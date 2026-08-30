-- ============================================================================
-- FATURAS — o histórico do dinheiro (D30)
--
-- POR QUE ESTA TABELA EXISTE
-- `assinaturas` tem `oficina_id` como CHAVE PRIMÁRIA: uma linha por oficina, o
-- estado ATUAL. Cada pagamento confirmado sobrescreve `periodo_ate` e some.
-- O webhook já conferia a cobrança na API do Asaas — tinha valor, vencimento e
-- status na mão — e jogava fora.
--
-- Isso não é uma consulta difícil de fazer depois: é uma consulta IMPOSSÍVEL,
-- porque o dado nunca foi gravado. Diferente do resto da dívida do build, este
-- item tem prazo: o que não for gravado antes do primeiro pagamento se perde.
--
-- Serve a três leitores, e é por isso que ela não é só um log:
--   1. o dono da Esteira  — "quanto entrou em outubro" (painel do negócio)
--   2. o dono da oficina  — "cadê o meu boleto" (/app/conta), sem ligar
--   3. o suporte          — "essa cobrança foi paga mesmo?" com a evidência
-- ============================================================================

-- ── A leitura do status, em UM lugar só ──────────────────────────────────────
-- O status cru do Asaas é a EVIDÊNCIA (ficou gravado como veio); `situacao` é
-- a nossa leitura dele. Guardar os dois é de propósito — mas a leitura não
-- pode ter duas definições, uma no banco e outra na tela (regra 12). Por isso
-- ela é função `immutable` e a coluna é GERADA a partir dela: não existe
-- caminho de escrita que produza uma `situacao` que discorde do `status`.
create or replace function situacao_da_cobranca(p_status text) returns text
language sql immutable
set search_path = public as $$
  select case
    -- CONFIRMED = pago (o dinheiro ainda não está disponível para saque, mas
    -- para o produto isso é irrelevante: a mensalidade foi paga).
    when p_status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH') then 'paga'
    when p_status in ('OVERDUE') then 'vencida'
    when p_status in ('REFUNDED', 'REFUND_REQUESTED',
                      'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE') then 'devolvida'
    when p_status in ('PENDING', 'AWAITING_RISK_ANALYSIS',
                      'AWAITING_CHARGEBACK_REVERSAL') then 'aberta'
    -- Status que o Asaas criar amanhã cai aqui e aparece na tela como
    -- "outra (<status>)". Não vira 'aberta' por descuido: inventar
    -- classificação para o que não se conhece é a regra 2 ao contrário.
    else 'outra'
  end
$$;

create table if not exists faturas (
  id                  uuid primary key default gen_random_uuid(),
  oficina_id          uuid not null references oficinas(id) on delete cascade,
  provedor            text not null default 'asaas',
  provedor_cobranca   text not null,
  provedor_assinatura text,
  valor               numeric(10,2),
  vencimento          date,
  pago_em             date,
  -- o que o Asaas respondeu, cru, na conferência autenticada
  status              text not null,
  situacao            text generated always as (situacao_da_cobranca(status)) stored,
  link                text,
  criado_em           timestamptz not null default now(),
  visto_em            timestamptz not null default now(),
  -- A MESMA cobrança é anunciada várias vezes (PENDING → CONFIRMED → RECEIVED),
  -- e o Asaas reenvia por desenho quando a resposta não é 200. Sem esta chave,
  -- o extrato somaria a mesma mensalidade três vezes — e um painel de receita
  -- que conta duas vezes é pior do que não existir.
  unique (provedor, provedor_cobranca)
);

-- `visto_em` é carimbado aqui, não pelo servidor de aplicação: um `new Date()`
-- no webhook seria um segundo relógio no produto (regra 8), e foi esse o
-- defeito que a varredura do B11 achou naquele arquivo.
create or replace function faturas_tocada() returns trigger
language plpgsql set search_path = public as $$
begin
  new.visto_em := now();
  return new;
end $$;

drop trigger if exists faturas_tocada_trg on faturas;
create trigger faturas_tocada_trg before update on faturas
  for each row execute function faturas_tocada();

create index if not exists faturas_oficina_idx on faturas (oficina_id, vencimento desc);
create index if not exists faturas_situacao_idx on faturas (situacao, vencimento);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- A oficina lê as PRÓPRIAS faturas (é o que responde "cadê meu boleto" sem
-- telefone). Ninguém escreve pela tela: quem grava é o webhook, com service
-- role, depois de conferir no Asaas (D23). Não existe policy de insert,
-- update ou delete de propósito — a ausência é a trava.
alter table faturas enable row level security;

drop policy if exists faturas_le_a_propria on faturas;
create policy faturas_le_a_propria on faturas
  for select to authenticated
  using (oficina_id = jwt_oficina());

-- ============================================================================
-- O EXTRATO DA OFICINA — para /app/conta
-- `security invoker`: roda com a RLS de quem chamou, então a policy acima é a
-- trava. Não recebe `oficina_id` como parâmetro justamente para não repetir o
-- furo do `conta_da_oficina(p_oficina)`, que deixava qualquer usuário logado
-- ler os dados de qualquer outra oficina.
-- ============================================================================
create or replace function minhas_faturas()
returns table (
  vencimento date,
  pago_em date,
  valor numeric,
  situacao text,
  status text,
  link text
)
language sql stable security invoker
set search_path = public as $$
  select f.vencimento, f.pago_em, f.valor, f.situacao, f.status, f.link
  from faturas f
  where f.oficina_id = jwt_oficina()
  order by f.vencimento desc nulls last, f.criado_em desc
  limit 24
$$;

-- De PUBLIC, não só de `anon`: `anon` herda de PUBLIC, e revogar apenas dele
-- deixa a função chamável sem login pela herança.
revoke execute on function minhas_faturas() from public, anon;
grant execute on function minhas_faturas() to authenticated;

revoke execute on function situacao_da_cobranca(text) from public, anon;
grant execute on function situacao_da_cobranca(text) to authenticated;

comment on table faturas is
  'Histórico do dinheiro (D30). Escrita só pelo webhook, depois de conferir na API do Asaas. Uma linha por cobrança do provedor, atualizada no lugar.';
