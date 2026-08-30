-- ─────────────────────────────────────────────────────────────
-- 20260830_tempos — a previsão aprendida do histórico (B8, fase 2).
--
-- O que muda em relação ao radar: o radar do B6 conta "uma etapa por dia",
-- deliberadamente otimista, porque não tinha de onde tirar número melhor.
-- Aqui a oficina passa a ter: quanto CADA etapa leva NESTA oficina, medido
-- do que já aconteceu.
--
-- ── Três decisões que governam este arquivo ────────────────────────────
--
-- 1. MEDIANA, não média. Um pedido que atravessou o feriado destrói a média
--    e não move a mediana. Também vai o p80 — "8 em cada 10 saem em até X".
--
-- 2. AMOSTRA MÍNIMA (p_min_amostra, padrão 3). Abaixo dela a etapa devolve
--    `mediana_dias: null` — NÃO zero, NÃO um chute. Regra 3 na veia: "ainda
--    não sei" é um estado, e é o estado de toda oficina no primeiro mês.
--    E se UMA etapa do caminho não é sabida, o pedido inteiro fica SEM data
--    prevista, com o motivo dizendo qual etapa falta e quantos pedidos.
--    Somar mediana com chute produziria uma data — e uma data na tela é uma
--    promessa (regra 2).
--
-- 3. DIAS CORRIDOS. Uma etapa que começa sexta 17h e sai segunda 8h conta
--    2,6 dias, não 3 horas de trabalho. É proposital: o prazo do cliente
--    também é em dias corridos, então é essa a régua que dá para comparar
--    com ele. Medir hora útil pediria calendário de expediente por oficina
--    — isso é PCP, está fora da fronteira.
--
-- ── O viés que esta conta TEM, e que a tela mostra do lado ─────────────
-- A mediana só enxerga pedidos que JÁ SAÍRAM da etapa. Os que estão presos
-- nela agora não entram — e são justamente os lentos. Por isso a função
-- devolve, coladas na mesma linha, `na_fila` e `mais_antigo_dias`: se tem
-- pedido parado há mais tempo que a mediana, a mediana está otimista, e a
-- pessoa tem os dois números para ver isso sozinha (regra 4 — nasceram da
-- mesma consulta).
--
-- security invoker: a RLS de `pedidos` e `avancos` continua valendo.
-- ─────────────────────────────────────────────────────────────


-- ── 1. A entrada do pedido também é trilha ────────────────────
--
-- Sem isto a PRIMEIRA etapa nunca teria início gravado — `avancos` só
-- registrava movimento — e ela jamais seria aprendida. Pior: a primeira
-- etapa costuma ser onde a fila entope (esperando material, esperando
-- aprovação), que é exatamente o que se quer medir.
--
-- Vai como trigger, não como duas linhas em `criarPedido` e `importarCsv`:
-- regra 12 — compensação repetida em dois lugares vai faltar no terceiro, e
-- o terceiro já tem nome (o conector de ERP da fase 3).
--
-- `quando` = `criado_em`, não `now()`: assim massa histórica com data no
-- passado gera entrada no passado, e a trilha não mente sobre quando o
-- pedido apareceu.
create or replace function pedidos_marca_entrada() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.etapa_id is not null then
    insert into avancos (pedido_id, etapa_id, quem, quando)
    values (new.id, new.etapa_id, 'entrada:' || new.origem, new.criado_em);
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_entrada on pedidos;
create trigger trg_pedidos_entrada
  after insert on pedidos
  for each row execute function pedidos_marca_entrada();


-- ── 2. O radar não pode contar entrada como avanço ────────────
--
-- Cadastrar pedido não é fazer o pedido andar. Se `entrada:%` entrasse na
-- conta, um dia de importação de CSV apareceria como um dia de produção — e
-- o pct_chao, que é A métrica do produto, desabaria por diluição.
-- Regra 13: o conserto da trilha quebraria o radar; então os dois vão juntos.
create or replace function radar(p_oficina uuid, p_hoje date default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hoje     date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  v_lista    jsonb;
  v_ontem    jsonb;
  v_metrica  jsonb;
  v_em_jogo  int;
  v_andaram  int;
begin
  select count(*) into v_em_jogo
    from pedidos p
    join etapas e on e.id = p.etapa_id
   where p.oficina_id = p_oficina
     and exists (select 1 from etapas e2
                  where e2.oficina_id = p.oficina_id
                    and e2.tipo_pedido = p.tipo_pedido
                    and e2.ordem > e.ordem);

  with emJogo as (
    select p.id, p.numero, p.cliente_nome, p.descricao, p.prazo,
           e.nome as etapa,
           (v_hoje - (p.etapa_desde at time zone 'America/Sao_Paulo')::date) as dias_parado,
           (select count(*) from etapas e2
             where e2.oficina_id = p.oficina_id
               and e2.tipo_pedido = p.tipo_pedido
               and e2.ordem > e.ordem) as etapas_restantes
      from pedidos p
      join etapas e on e.id = p.etapa_id
     where p.oficina_id = p_oficina
  ),
  classificado as (
    select *,
           case
             when prazo is not null and prazo < v_hoje then 'venceu'
             when prazo is not null and (prazo - v_hoje) <= etapas_restantes then 'aperta'
             when dias_parado >= 2 then 'parado'
             else null
           end as motivo
      from emJogo
     where etapas_restantes > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',       id,
           'numero',   numero,
           'cliente',  cliente_nome,
           'descricao', descricao,
           'etapa',    etapa,
           'prazo',    prazo,
           'dias_parado',      dias_parado,
           'etapas_restantes', etapas_restantes,
           'dias_ate_o_prazo', case when prazo is null then null else prazo - v_hoje end,
           'motivo',   motivo
         ) order by
           case motivo when 'venceu' then 1 when 'aperta' then 2 else 3 end,
           prazo nulls last, numero), '[]'::jsonb)
    into v_lista
    from classificado
   where motivo is not null;

  select count(distinct a.pedido_id) into v_andaram
    from avancos a
    join pedidos p on p.id = a.pedido_id
   where p.oficina_id = p_oficina
     and (a.quando at time zone 'America/Sao_Paulo')::date = v_hoje - 1
     and a.quem not like 'entrada:%'
     and coalesce(a.observacao, '') not like 'PROBLEMA:%';

  v_ontem := jsonb_build_object(
    'avancaram', v_andaram,
    'parados',   greatest(v_em_jogo - v_andaram, 0)
  );

  -- A métrica nº 1 do produto: quanto do avanço vem do chão, 7 dias.
  -- pct_chao é NULO quando não houve avanço nenhum — "não sei" não é zero
  -- (regra 3), e neste número a diferença decide o futuro do produto.
  select jsonb_build_object(
           'total', count(*),
           'chao',  count(*) filter (where a.quem like 'chao:%'),
           'pct_chao', case when count(*) = 0 then null
                            else round(100.0 * count(*) filter (where a.quem like 'chao:%')
                                       / count(*)) end
         )
    into v_metrica
    from avancos a
    join pedidos p on p.id = a.pedido_id
   where p.oficina_id = p_oficina
     and a.quando >= (v_hoje - 6)::timestamptz
     and a.quem not like 'entrada:%'
     and coalesce(a.observacao, '') not like 'PROBLEMA:%';

  return jsonb_build_object(
    'hoje',    v_hoje,
    'lista',   v_lista,
    'ontem',   v_ontem,
    'metrica', v_metrica,
    'em_jogo', v_em_jogo,
    'contagem', jsonb_build_object(
      'venceu', (select count(*) from jsonb_array_elements(v_lista) x where x->>'motivo' = 'venceu'),
      'aperta', (select count(*) from jsonb_array_elements(v_lista) x where x->>'motivo' = 'aperta'),
      'parado', (select count(*) from jsonb_array_elements(v_lista) x where x->>'motivo' = 'parado')
    )
  );
end $$;


-- ── 3. tempos() — o que se aprendeu e o que se prevê ──────────
--
-- Devolve as duas metades na MESMA chamada, de propósito (regra 4): a lista
-- de etapas com o que se sabe de cada uma, e a lista de pedidos com a data
-- prevista. Quem some da segunda tem o porquê na primeira.
create or replace function tempos(
  p_oficina     uuid,
  p_hoje        date default null,
  p_min_amostra int  default 3,
  p_janela_dias int  default 180
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hoje date := coalesce(p_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  v_saida jsonb;
begin
  -- Uma consulta só, do começo ao fim. A lista de etapas e a lista de
  -- pedidos saem das MESMAS CTEs — regra 4: dois números na mesma tela
  -- nascem juntos, senão um dia discordam e ninguém sabe qual mentiu.
  with trilha as (
    -- A linha do tempo de cada pedido. `PROBLEMA:` não move o pedido de
    -- etapa (o chão só registrou um aperto) — se entrasse aqui, partiria a
    -- permanência em duas e faria toda etapa parecer mais rápida.
    select a.pedido_id, a.etapa_id, a.quando, p.tipo_pedido,
           lead(a.quando)   over (partition by a.pedido_id order by a.quando, a.id) as saiu_em,
           lead(a.etapa_id) over (partition by a.pedido_id order by a.quando, a.id) as saiu_para
      from avancos a
      join pedidos p on p.id = a.pedido_id
     where p.oficina_id = p_oficina
       and coalesce(a.observacao, '') not like 'PROBLEMA:%'
       and a.quando >= (v_hoje - p_janela_dias)::timestamptz
  ),
  segmentos as (
    -- `::numeric` não é decoração: `extract(epoch …)` sai como double, e
    -- `round(double, 1)` não existe no Postgres. A fumaça pegou isto antes
    -- de existir tela — e teria virado erro 500 na primeira oficina.
    select e.id as etapa_id,
           (extract(epoch from (t.saiu_em - t.quando)) / 86400.0)::numeric as dias,
           (ed.ordem > e.ordem) as pra_frente
      from trilha t
      join etapas e  on e.id = t.etapa_id
      join etapas ed on ed.id = t.saiu_para
     where t.saiu_em is not null
  ),
  aprendido as (
    -- `voltas` conta retrabalho: o pedido saiu para uma etapa ANTERIOR.
    -- Esse tempo não entra na mediana (a permanência não foi normal), mas o
    -- número aparece — retrabalho invisível é como a fila entope calada.
    -- `percentile_cont` NÃO tem variante numeric: ela devolve double
    -- precision aconteça o que acontecer com a entrada — e `round(double, 1)`
    -- não existe. O cast na saída é obrigatório, não estilo.
    select etapa_id,
           count(*) filter (where pra_frente)     as n,
           count(*) filter (where not pra_frente) as voltas,
           (percentile_cont(0.5) within group (order by dias)
             filter (where pra_frente))::numeric as mediana,
           (percentile_cont(0.8) within group (order by dias)
             filter (where pra_frente))::numeric as p80,
           max(dias) filter (where pra_frente)    as maior
      from segmentos
     group by etapa_id
  ),
  fila as (
    select p.etapa_id,
           count(*) as agora,
           max(v_hoje - (p.etapa_desde at time zone 'America/Sao_Paulo')::date) as mais_antigo
      from pedidos p
     where p.oficina_id = p_oficina and p.etapa_id is not null
     group by p.etapa_id
  ),
  caminho as (
    -- A ÚLTIMA etapa de cada tipo é estruturalmente inaprendível: nada sai
    -- dela, então não existe permanência para medir. Ela não é "ainda não
    -- sei" — é "não se mede", e a tela precisa da diferença, senão fica
    -- eternamente esperando um número que nunca vem.
    -- Por isso a previsão responde "quando o pedido CHEGA na última etapa".
    select tipo_pedido, max(ordem) as ultima
      from etapas where oficina_id = p_oficina group by tipo_pedido
  ),
  etapa_ap as (
    -- TODA etapa da oficina entra, inclusive as que não têm histórico
    -- nenhum: some da lista quem nunca aprendeu, e a tela passa a dizer
    -- "está tudo sabido" quando na verdade não olhou.
    select e.id, e.tipo_pedido, e.nome, e.ordem,
           coalesce(ap.n, 0)      as n,
           coalesce(ap.voltas, 0) as voltas,
           -- Abaixo da amostra mínima: nulo. "Ainda não sei" não é zero.
           case when coalesce(ap.n, 0) >= p_min_amostra then round(ap.mediana, 1) end as mediana,
           case when coalesce(ap.n, 0) >= p_min_amostra then round(ap.p80, 1)     end as p80,
           case when coalesce(ap.n, 0) >= p_min_amostra then round(ap.maior, 1)   end as maior,
           coalesce(f.agora, 0)   as na_fila,
           f.mais_antigo,
           (e.ordem = c.ultima)   as ultima
      from etapas e
      join caminho c         on c.tipo_pedido = e.tipo_pedido
      left join aprendido ap on ap.etapa_id = e.id
      left join fila f       on f.etapa_id  = e.id
     where e.oficina_id = p_oficina
  ),
  prev as (
    select p.id, p.numero, p.cliente_nome as cliente, ea.nome as etapa, p.prazo,
           (v_hoje - (p.etapa_desde at time zone 'America/Sao_Paulo')::date) as dias_aqui,
           case when ea.ultima            then 'chegou'
                when r.sem_historico > 0  then 'sem_historico'
                else 'previsto' end as estado,
           case when not ea.ultima and r.sem_historico = 0 then
             round(greatest(ea.mediana - (v_hoje - (p.etapa_desde at time zone 'America/Sao_Paulo')::date), 0)
                   + coalesce(r.soma_depois, 0), 1)
           end as previsao_dias,
           case when not ea.ultima and r.sem_historico = 0 then
             -- Arredonda PARA CIMA: data prevista é promessa, e promessa que
             -- sobra é melhor que promessa que falta.
             v_hoje + ceil(greatest(ea.mediana - (v_hoje - (p.etapa_desde at time zone 'America/Sao_Paulo')::date), 0)
                           + coalesce(r.soma_depois, 0))::int
           end as previsao_data,
           case when not ea.ultima and r.sem_historico > 0 then
             'faltam ' || greatest(p_min_amostra - r.n_da_primeira, 1) ||
             ' pedido(s) saindo de “' || r.primeira_sem || '” para eu saber'
           end as motivo
      from pedidos p
      join etapa_ap ea on ea.id = p.etapa_id
      join caminho  c  on c.tipo_pedido = p.tipo_pedido
      cross join lateral (
        -- Da etapa atual até a penúltima: se UMA delas não é sabida, o pedido
        -- não ganha data. Somar mediana com chute produz uma data — e data
        -- na tela é promessa (regra 2).
        select count(*) filter (where r2.mediana is null) as sem_historico,
               (array_agg(r2.nome order by r2.ordem)
                  filter (where r2.mediana is null))[1] as primeira_sem,
               (array_agg(r2.n order by r2.ordem)
                  filter (where r2.mediana is null))[1] as n_da_primeira,
               sum(r2.mediana) filter (where r2.ordem > ea.ordem) as soma_depois
          from etapa_ap r2
         where r2.tipo_pedido = p.tipo_pedido
           and r2.ordem >= ea.ordem
           and r2.ordem <  c.ultima
      ) r
     where p.oficina_id = p_oficina
  )
  select jsonb_build_object(
    'hoje',        v_hoje,
    'min_amostra', p_min_amostra,
    'janela_dias', p_janela_dias,
    'etapas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'etapa_id',         id,
               'tipo',             tipo_pedido,
               'etapa',            nome,
               'ordem',            ordem,
               'n',                n,
               'voltas',           voltas,
               'mediana_dias',     mediana,
               'p80_dias',         p80,
               'maior_dias',       maior,
               'na_fila',          na_fila,
               'mais_antigo_dias', mais_antigo,
               'ultima',           ultima
             ) order by tipo_pedido, ordem), '[]'::jsonb)
        from etapa_ap
    ),
    'pedidos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',            id,
               'numero',        numero,
               'cliente',       cliente,
               'etapa',         etapa,
               'dias_aqui',     dias_aqui,
               'prazo',         prazo,
               'estado',        estado,
               'previsao_dias', previsao_dias,
               'previsao_data', previsao_data,
               -- Positivo = sobra; negativo = pela conta, sai DEPOIS do prazo.
               'folga_dias',    case when prazo is null or previsao_data is null
                                     then null else prazo - previsao_data end,
               'sem_previsao',  motivo
             ) order by
               case estado when 'previsto' then 1 when 'sem_historico' then 2 else 3 end,
               case when prazo is null or previsao_data is null then null
                    else prazo - previsao_data end nulls last,
               numero), '[]'::jsonb)
        from prev
    ),
    'resumo', jsonb_build_object(
      'etapas_total',      (select count(*) from etapa_ap where not ultima),
      'etapas_aprendidas', (select count(*) from etapa_ap where mediana is not null),
      'observacoes',       (select coalesce(sum(n), 0) from etapa_ap),
      'voltas',            (select coalesce(sum(voltas), 0) from etapa_ap),
      'pedidos_total',     (select count(*) from prev where estado <> 'chegou'),
      'com_previsao',      (select count(*) from prev where estado = 'previsto'),
      'ja_chegaram',       (select count(*) from prev where estado = 'chegou'),
      -- O número que a tela existe para dar: quantos, pela conta, saem DEPOIS
      -- do prazo prometido.
      'atrasa_pela_conta', (select count(*) from prev
                             where prazo is not null and previsao_data is not null
                               and previsao_data > prazo)
    )
  ) into v_saida;

  return v_saida;
end $$;

-- Gatilho não precisa estar exposto na API (endurecimento do B11).
revoke execute on function pedidos_marca_entrada() from anon, authenticated, public;
