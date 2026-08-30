-- ─────────────────────────────────────────────────────────────
-- 20260830_radar — o radar de atraso (B6). A função que vende o produto.
--
-- A conta, dita em uma frase para o dono conferir de cabeça:
--   "uma etapa por dia, no melhor caso. Se faltam menos dias que etapas,
--    o pedido não sai no prazo."
--
-- É deliberadamente OTIMISTA (dias corridos, uma etapa por dia). Radar que
-- grita demais é radar que ninguém lê depois da segunda semana — e aí ele não
-- serve para nada. Errar para menos custa um pedido; errar para mais custa o
-- hábito, que é o produto.
--
-- Três motivos, nesta ordem de gravidade:
--   venceu  = prazo já passou
--   aperta  = dias até o prazo <= etapas restantes (sem folga nenhuma)
--   parado  = sem andar há 2 dias ou mais, mesmo com prazo folgado — é onde
--             a fila entope em silêncio
-- Pedido na última etapa sai do radar: cobrar avanço de quem já chegou é o
-- começo de o radar ser ignorado.
--
-- `p_hoje` existe para o teste construir casos exatos em vez de esperar o
-- calendário. O padrão é hoje em São Paulo — o mesmo "hoje" de lib/datas.ts.
--
-- ⚠ ARMADILHA DE FUSO (regra 8), paga na fumaça deste bloco: gravar
-- `etapa_desde` como DATA pura vira meia-noite UTC, que é 21h do dia anterior
-- em São Paulo — e o "parado há N dias" sai um dia maior. A produção grava
-- `now()`, um instante real; o teste precisa construir hora local explícita.
--
-- security invoker: a RLS de `pedidos` continua valendo, então uma oficina não
-- consegue o radar de outra nem passando o id na mão.
-- ─────────────────────────────────────────────────────────────

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
