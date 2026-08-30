-- ============================================================================
-- A ÁREA DE NEGÓCIO (B15) — quem opera a Esteira olhando as oficinas
--
-- D31: mora fora do `(escritorio)`. `membros` tem `unique (user_id)` e amarra
-- a pessoa a UMA oficina; quem opera o negócio não é de oficina nenhuma.
--
-- D32: quem é da equipe mora em tabela própria, não numa coluna `super_admin`
-- em `membros`. O poder de ver TODAS as oficinas não pode depender de uma
-- linha da tabela que a RLS multi-tenant protege.
--
-- E A TRAVA É ESTA FUNÇÃO, não a tela (regra 11): `painel_negocio()` devolve
-- `null` para quem não é equipe. Uma URL vazada não entrega dado nenhum.
-- ============================================================================

create table if not exists equipe (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  criado_em timestamptz not null default now()
);

-- Ninguém lê nem escreve esta tabela pela tela. Ela é consultada apenas de
-- dentro de funções `security definer`. Sem policy = sem passagem (a ausência
-- é a trava, e é de propósito).
alter table equipe enable row level security;

create or replace function sou_equipe() returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (select 1 from equipe where user_id = auth.uid())
$$;

-- ATENÇÃO: `revoke ... from anon` NÃO basta.
-- No Postgres, toda função nasce com EXECUTE concedido a PUBLIC, e `anon`
-- herda de PUBLIC — então revogar só de `anon` deixa a porta aberta pela
-- herança. O linter do Supabase pegou exatamente isso aqui: `painel_negocio`
-- continuava chamável sem login. Não vazava dado (sem sessão, `sou_equipe()`
-- é falso), mas é a mesma falha de raciocínio que já custou um furo entre
-- oficinas neste projeto. Revogar de PUBLIC é o que fecha.
revoke execute on function sou_equipe() from public, anon;
grant execute on function sou_equipe() to authenticated;

-- ============================================================================
-- PEDIDOS ATIVOS — uma definição só (regra 12)
--
-- "Ativo" é o pedido cuja etapa atual NÃO é a última do caminho dele. Esta
-- conta estava escrita dentro de `conta_da_oficina`, e o painel do negócio
-- precisava da mesma. Duas cópias divergem no dia em que alguém mexer numa —
-- e aí a barra de uso do cliente e o painel do dono passam a discordar sobre
-- o mesmo número, que é o pior jeito de errar.
-- ============================================================================
create or replace function pedidos_ativos(p_oficina uuid) returns int
language sql stable security definer
set search_path = public as $$
  select count(*)::int
    from pedidos p
    join etapas e on e.id = p.etapa_id
   where p.oficina_id = p_oficina
     and exists (select 1 from etapas e2
                  where e2.oficina_id = p.oficina_id
                    and e2.tipo_pedido = p.tipo_pedido
                    and e2.ordem > e.ordem)
$$;

-- Recebe `p_oficina` e é `security definer`: pelas mesmas razões do
-- `conta_da_oficina`, não pode ficar ao alcance de qualquer usuário logado —
-- senão vira um contador de pedidos de qualquer oficina.
revoke execute on function pedidos_ativos(uuid) from anon, authenticated, public;

-- `conta_da_oficina` passa a CHAMAR a função, em vez de repetir a consulta.
create or replace function conta_da_oficina(p_oficina uuid)
returns jsonb language plpgsql stable security definer
set search_path = public as $function$
declare
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_a      record;
  v_p      record;
  v_ativos int;
  v_ate    date;
  v_pode   boolean;
  v_motivo text;
begin
  select * into v_a from assinaturas where oficina_id = p_oficina;
  if v_a.oficina_id is null then
    return jsonb_build_object('estado', 'sem_assinatura');
  end if;
  select * into v_p from planos where codigo = v_a.plano;

  v_ativos := pedidos_ativos(p_oficina);

  v_ate := case when v_a.status = 'teste' then v_a.teste_ate else v_a.periodo_ate end;

  if v_a.status = 'vencida' then
    v_pode := false;
    v_motivo := 'o pagamento não foi confirmado';
  elsif v_ate is not null and v_ate < v_hoje then
    v_pode := false;
    v_motivo := case v_a.status
                  when 'teste' then 'o teste terminou em ' || to_char(v_ate, 'DD/MM')
                  when 'cancelada' then 'a assinatura foi cancelada e o período pago '
                                        || 'terminou em ' || to_char(v_ate, 'DD/MM')
                  else 'o período pago terminou em ' || to_char(v_ate, 'DD/MM') end;
  elsif v_a.status = 'cancelada' and v_ate is null then
    v_pode := false;
    v_motivo := 'a assinatura foi cancelada';
  elsif v_p.limite_pedidos_ativos is not null and v_ativos >= v_p.limite_pedidos_ativos then
    v_pode := false;
    v_motivo := 'o plano ' || v_p.nome || ' vai até ' || v_p.limite_pedidos_ativos
                || ' pedidos em andamento, e você está com ' || v_ativos;
  else
    v_pode := true;
    v_motivo := null;
  end if;

  return jsonb_build_object(
    'estado',          'ok',
    'plano',           v_a.plano,
    'plano_nome',      v_p.nome,
    'preco_centavos',  v_p.preco_centavos,
    'status',          v_a.status,
    'ate',             v_ate,
    'dias_restantes',  case when v_ate is null then null else v_ate - v_hoje end,
    'pedidos_ativos',  v_ativos,
    'limite',          v_p.limite_pedidos_ativos,
    'pode_criar',      v_pode,
    'motivo',          v_motivo,
    'provedor',        v_a.provedor,
    'tem_assinatura',  (v_a.provedor_assinatura is not null)
  );
end $function$;

-- ============================================================================
-- O PAINEL DO NEGÓCIO — uma chamada só (regra 4)
--
-- MRR, contagens, caixa e a lista de oficinas saem da MESMA consulta. Se o MRR
-- do topo viesse de um `select sum(...)` e a lista de outro, os dois números
-- discordariam no dia em que uma condição mudasse num só lugar — e num painel
-- de receita esse é o defeito que ninguém percebe.
--
-- Devolve `null` (e não uma exceção) para quem não é da equipe: a tela mostra
-- "restrito" e não vaza sequer o formato do que existe do outro lado.
-- ============================================================================
create or replace function painel_negocio()
returns jsonb language plpgsql stable security definer
set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lista jsonb;
  v_acoes jsonb;
begin
  if not sou_equipe() then
    return null;
  end if;

  -- ── a lista, que é a fonte de TODOS os números do topo ────────────────────
  with base as (
    select
      o.id,
      o.nome,
      o.criado_em,
      a.status,
      a.plano,
      p.nome  as plano_nome,
      p.preco_centavos,
      p.limite_pedidos_ativos as limite,
      case when a.status = 'teste' then a.teste_ate else a.periodo_ate end as ate,
      pedidos_ativos(o.id) as ativos,
      (select count(*) from pedidos pe where pe.oficina_id = o.id) as pedidos_total,
      (select count(*) from membros m where m.oficina_id = o.id and m.ativo) as pessoas,
      (select count(*) from acessos ac where ac.oficina_id = o.id and ac.ativo) as acessos,
      -- A MÉTRICA Nº 1 do produto, por oficina: dos avanços dos últimos 30
      -- dias, quantos vieram do chão. `entrada:` fica de fora — cadastrar um
      -- pedido não é fazê-lo andar (D17).
      (select count(*) from avancos av join pedidos pe on pe.id = av.pedido_id
        where pe.oficina_id = o.id and av.quem like 'chao:%'
          and av.quando >= now() - interval '30 days') as chao_30d,
      (select count(*) from avancos av join pedidos pe on pe.id = av.pedido_id
        where pe.oficina_id = o.id and av.quem like 'escritorio:%'
          and av.quando >= now() - interval '30 days') as escritorio_30d,
      (select max(av.quando)::date from avancos av join pedidos pe on pe.id = av.pedido_id
        where pe.oficina_id = o.id and av.quem not like 'entrada:%') as ultimo_avanco,
      (select coalesce(sum(f.valor), 0) from faturas f
        where f.oficina_id = o.id and f.situacao = 'paga') as pago_total,
      (select count(*) from faturas f
        where f.oficina_id = o.id and f.situacao = 'vencida') as faturas_vencidas
    from oficinas o
    left join assinaturas a on a.oficina_id = o.id
    left join planos p on p.codigo = a.plano
  )
  select jsonb_agg(to_jsonb(b) order by b.criado_em desc) into v_lista from base b;

  v_lista := coalesce(v_lista, '[]'::jsonb);

  -- ── a fila de ação: nenhuma linha decorativa ──────────────────────────────
  -- Cada item existe porque leva a um telefonema. Métrica que não vira ação
  -- não entra.
  with b as (select * from jsonb_array_elements(v_lista) as e(v)),
  itens as (
    -- 1) teste acabando E o chão já avançou: o produto pegou. É o lead mais
    --    quente que existe.
    select 'Teste acabando e o chão já usa' as tipo, 'alta' as urgencia,
           v->>'nome' as oficina, v->>'id' as oficina_id,
           (v->>'chao_30d') || ' avanço(s) pelo celular do chão · termina em '
             || ((v->>'ate')::date - v_hoje) || ' dia(s)' as detalhe,
           (v->>'preco_centavos')::int as valor_centavos
      from b where v->>'status' = 'teste' and (v->>'ate') is not null
        and (v->>'ate')::date - v_hoje between 0 and 3
        and (v->>'chao_30d')::int > 0
    union all
    -- 2) teste acabando E só o escritório mexeu: pegou pela metade. A ligação
    --    é outra — "quem mexe nisso no chão?"
    select 'Teste acabando, só o escritório usa', 'alta',
           v->>'nome', v->>'id',
           'nenhum avanço pelo chão em 30 dias (' || (v->>'escritorio_30d')
             || ' pelo escritório) · termina em ' || ((v->>'ate')::date - v_hoje) || ' dia(s)',
           (v->>'preco_centavos')::int
      from b where v->>'status' = 'teste' and (v->>'ate') is not null
        and (v->>'ate')::date - v_hoje between 0 and 3
        and (v->>'chao_30d')::int = 0 and (v->>'pedidos_total')::int > 0
    union all
    -- 3) teste acabando sem nenhum pedido: não implantou. Morre sozinho e sem
    --    motivo escrito, se ninguém ligar hoje.
    select 'Teste acabando sem nenhum pedido', 'alta',
           v->>'nome', v->>'id',
           'a oficina se cadastrou e não chegou a usar · termina em '
             || ((v->>'ate')::date - v_hoje) || ' dia(s)',
           (v->>'preco_centavos')::int
      from b where v->>'status' = 'teste' and (v->>'ate') is not null
        and (v->>'ate')::date - v_hoje between 0 and 3
        and (v->>'pedidos_total')::int = 0
    union all
    -- 4) nenhum acesso de chão criado: está sendo usada errada, e a métrica
    --    que decide o produto vai dar 0% para sempre.
    select 'Sem acesso de chão criado', 'alta',
           v->>'nome', v->>'id',
           'nenhum link ou PIN entregue a quem produz — o produto está sendo '
             || 'usado como planilha', null::int
      from b where (v->>'acessos')::int = 0 and (v->>'pedidos_total')::int > 0
    union all
    -- 5) dinheiro na mesa
    select 'Cobrança vencida', 'alta',
           v->>'nome', v->>'id',
           (v->>'faturas_vencidas') || ' cobrança(s) vencida(s) sem pagamento',
           (v->>'preco_centavos')::int
      from b where (v->>'faturas_vencidas')::int > 0
    union all
    -- 6) churn com 30 dias de antecedência
    select 'Assinante parado', 'media',
           v->>'nome', v->>'id',
           case when (v->>'ultimo_avanco') is null then 'nunca avançou um pedido'
                else 'sem avanço há ' || (v_hoje - (v->>'ultimo_avanco')::date) || ' dias' end,
           (v->>'preco_centavos')::int
      from b where v->>'status' = 'ativa'
        and ((v->>'ultimo_avanco') is null
             or (v->>'ultimo_avanco')::date < v_hoje - 7)
    union all
    -- 7) cancelou mas ainda está lá dentro: ainda dá para conversar (D27)
    select 'Cancelou e ainda tem acesso', 'media',
           v->>'nome', v->>'id',
           'o período pago vai até ' || to_char((v->>'ate')::date, 'DD/MM')
             || ' — depois disso vira saudade',
           (v->>'preco_centavos')::int
      from b where v->>'status' = 'cancelada' and (v->>'ate') is not null
        and (v->>'ate')::date >= v_hoje
    union all
    -- 8) upgrade que o cliente QUER
    select 'No limite do plano', 'baixa',
           v->>'nome', v->>'id',
           (v->>'ativos') || ' pedidos em andamento, e o plano ' || (v->>'plano_nome')
             || ' vai até ' || (v->>'limite'),
           (v->>'preco_centavos')::int
      from b where (v->>'limite') is not null
        and (v->>'ativos')::int >= (v->>'limite')::int
  )
  select jsonb_agg(to_jsonb(i) order by
           case i.urgencia when 'alta' then 0 when 'media' then 1 else 2 end,
           coalesce(i.valor_centavos, 0) desc)
    into v_acoes from itens i;

  return jsonb_build_object(
    'estado', 'ok',
    'hoje', v_hoje,
    -- MRR = soma do preço de tabela de quem está com assinatura ATIVA. Vem da
    -- mesma lista que a tela mostra, então a soma do topo é conferível linha a
    -- linha (regra 4).
    'mrr_centavos', (
      select coalesce(sum((v->>'preco_centavos')::int), 0)
        from jsonb_array_elements(v_lista) as e(v)
       where v->>'status' = 'ativa'),
    -- MRR potencial: quem está em teste, ao preço do plano que escolheu. É
    -- promessa de promessa, e por isso NUNCA soma com o de cima.
    'mrr_teste_centavos', (
      select coalesce(sum((v->>'preco_centavos')::int), 0)
        from jsonb_array_elements(v_lista) as e(v)
       where v->>'status' = 'teste'),
    'contagens', jsonb_build_object(
      'total',     jsonb_array_length(v_lista),
      'teste',     (select count(*) from jsonb_array_elements(v_lista) as e(v) where v->>'status' = 'teste'),
      'ativa',     (select count(*) from jsonb_array_elements(v_lista) as e(v) where v->>'status' = 'ativa'),
      'vencida',   (select count(*) from jsonb_array_elements(v_lista) as e(v) where v->>'status' = 'vencida'),
      'cancelada', (select count(*) from jsonb_array_elements(v_lista) as e(v) where v->>'status' = 'cancelada'),
      'sem_assinatura', (select count(*) from jsonb_array_elements(v_lista) as e(v) where v->>'status' is null)
    ),
    -- O CAIXA é outra coisa que o MRR: MRR é o que a base vale por mês SE todo
    -- mundo ficar; caixa é o que entrou. Os dois nunca se somam (D33).
    'caixa', (
      select jsonb_build_object(
        'recebido_mes',   coalesce(sum(valor) filter (where situacao = 'paga'
                            and pago_em >= date_trunc('month', v_hoje)::date), 0),
        'recebido_total', coalesce(sum(valor) filter (where situacao = 'paga'), 0),
        'aberto',         coalesce(sum(valor) filter (where situacao = 'aberta'), 0),
        'vencido',        coalesce(sum(valor) filter (where situacao = 'vencida'), 0),
        'pagas',          count(*) filter (where situacao = 'paga'),
        'vencidas',       count(*) filter (where situacao = 'vencida')
      ) from faturas),
    'chao_30d', (select coalesce(sum((v->>'chao_30d')::int), 0)
                   from jsonb_array_elements(v_lista) as e(v)),
    'escritorio_30d', (select coalesce(sum((v->>'escritorio_30d')::int), 0)
                   from jsonb_array_elements(v_lista) as e(v)),
    'acoes', coalesce(v_acoes, '[]'::jsonb),
    'oficinas', v_lista
  );
end $$;

revoke execute on function painel_negocio() from public, anon;
grant execute on function painel_negocio() to authenticated;

comment on function painel_negocio() is
  'Painel do negócio (B15). A própria função é a trava: devolve null para quem não está em `equipe`. Todos os números saem da mesma lista (regra 4).';

-- ============================================================================
-- O EXTRATO COMPLETO — para /negocio/faturas
--
-- A RLS de `faturas` só deixa a oficina ver as próprias. Quem opera o negócio
-- precisa ver todas, e isso passa por `security definer` com a MESMA trava do
-- painel: não é da equipe, não recebe nada.
-- ============================================================================
create or replace function faturas_do_negocio()
returns jsonb language plpgsql stable security definer
set search_path = public as $$
begin
  if not sou_equipe() then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.ordem_data desc nulls last)
      from (
        select f.provedor_cobranca,
               f.valor,
               f.vencimento,
               f.pago_em,
               f.situacao,
               f.status,
               f.link,
               f.visto_em,
               o.nome as oficina,
               o.id   as oficina_id,
               coalesce(f.pago_em, f.vencimento) as ordem_data
          from faturas f
          join oficinas o on o.id = f.oficina_id
         limit 500
      ) x
  ), '[]'::jsonb);
end $$;

revoke execute on function faturas_do_negocio() from public, anon;
grant execute on function faturas_do_negocio() to authenticated;
