-- ─────────────────────────────────────────────────────────────
-- 20260830_conta — planos, assinatura, criação de oficina e o limite (B10/B11).
--
-- Três coisas que precisam nascer juntas, porque separadas produzem estados
-- impossíveis de responder:
--   · a oficina (com etapas e dono) — senão a conta existe e não serve;
--   · a assinatura — senão existe oficina sem plano, e a tela teria que
--     ADIVINHAR se pode ou não criar pedido;
--   · o limite — e ele mora no BANCO, não na tela (regra 11).
--
-- ── A régua do bloqueio, escrita antes de programar ───────────
-- Teste vencido ou assinatura em atraso **impedem criar pedido novo**. Não
-- impedem: mover pedido que já existe, abrir o radar, o celular do chão e a
-- página do cliente final. Motivo: quem produz e quem comprou não são a mesma
-- pessoa — travar o chão por causa de um boleto pune quem não decide nada, e
-- some com o pedido do cliente final, que não tem nada com isso. Os dados
-- ficam todos lá; o que para é o crescimento.
-- ─────────────────────────────────────────────────────────────

create table if not exists planos (
  codigo                text primary key,
  nome                  text    not null,
  preco_centavos        int     not null,
  limite_pedidos_ativos int,               -- null = sem limite
  ordem                 int     not null,
  ativo                 boolean not null default true
);

-- Os valores seguem a faixa escrita no `03-roadmap` (R$ 89–189, usuários
-- ilimitados). Os CORTES de pedidos ativos são proposta, não medição: nenhuma
-- oficina real foi observada ainda. Ficam em tabela justamente para mudar sem
-- deploy quando o primeiro piloto disser o tamanho real do movimento dele.
insert into planos (codigo, nome, preco_centavos, limite_pedidos_ativos, ordem) values
  ('teste',  'Teste de 14 dias',  0,     60, 0),
  ('base',   'Base',              8900,  60, 1),
  ('medio',  'Médio',            13900, 150, 2),
  ('grande', 'Grande',           18900, 400, 3)
on conflict (codigo) do nothing;

create table if not exists assinaturas (
  oficina_id          uuid primary key references oficinas(id),
  plano               text not null references planos(codigo),
  -- `teste`      — no período de avaliação, `teste_ate` manda
  -- `ativa`      — pago, `periodo_ate` manda
  -- `vencida`    — era paga e o pagamento não veio (ou o teste acabou)
  -- `cancelada`  — o dono pediu para sair
  -- Quatro estados nomeados, nunca um booleano `pago` (regra 1).
  status              text not null check (status in ('teste','ativa','vencida','cancelada')),
  teste_ate           date,
  periodo_ate         date,
  provedor            text,
  provedor_cliente    text,
  provedor_assinatura text,
  atualizado_em       timestamptz not null default now()
);

alter table planos      enable row level security;
alter table assinaturas enable row level security;
revoke all on planos, assinaturas from anon;

drop policy if exists planos_sel on planos;
create policy planos_sel on planos for select to authenticated using (ativo);

-- A assinatura é só de leitura pelo app: quem escreve nela é o webhook do
-- provedor (service role) ou o SQL do dono do produto. Se a tela pudesse
-- gravar, "pago" viraria um campo que o cliente edita.
drop policy if exists assinaturas_sel on assinaturas;
create policy assinaturas_sel on assinaturas for select to authenticated
  using (oficina_id = jwt_oficina());

-- ── Criar oficina: uma transação, ou nada ─────────────────────
-- Chamada só pelo service role, do servidor, logo depois de criar o usuário
-- no Auth. Não é executável por `authenticated`: se fosse, qualquer usuário
-- logado poderia fabricar oficinas para outros ids.
create or replace function criar_oficina(p_user uuid, p_nome text, p_etapas text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_of uuid; v_i int; v_ate date;
begin
  if p_user is null then raise exception 'usuário não informado'; end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'informe o nome da oficina'; end if;
  if array_length(p_etapas, 1) is null or array_length(p_etapas, 1) < 2 then
    raise exception 'a oficina precisa de pelo menos 2 etapas';
  end if;
  if exists (select 1 from membros where user_id = p_user) then
    raise exception 'este usuário já pertence a uma oficina';
  end if;

  insert into oficinas (nome) values (btrim(p_nome)) returning id into v_of;

  for v_i in 1..array_length(p_etapas, 1) loop
    if coalesce(btrim(p_etapas[v_i]), '') = '' then
      raise exception 'etapa % está sem nome', v_i;
    end if;
    insert into etapas (oficina_id, nome, ordem, tipo_pedido)
    values (v_of, btrim(p_etapas[v_i]), v_i, 'padrao');
  end loop;

  insert into membros (oficina_id, user_id, papel) values (v_of, p_user, 'dono');

  v_ate := (now() at time zone 'America/Sao_Paulo')::date + 14;
  insert into assinaturas (oficina_id, plano, status, teste_ate)
  values (v_of, 'teste', 'teste', v_ate);

  return jsonb_build_object('oficina_id', v_of,
                            'etapas', array_length(p_etapas, 1),
                            'teste_ate', v_ate);
end $$;

revoke all on function criar_oficina(uuid, text, text[]) from public, anon, authenticated;
grant execute on function criar_oficina(uuid, text, text[]) to service_role;

-- ── Uso e direito: uma consulta, para a tela e para a trava ───
-- A mesma função responde ao banner, à tela de conta e ao gatilho. Se fossem
-- duas contas, um dia a tela diria "pode" e o banco diria "não pode" — e a
-- pessoa ficaria olhando um botão que não funciona (regra 4).
create or replace function conta_da_oficina(p_oficina uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
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
    -- Oficina sem assinatura só existe se algo tiver falhado pela metade.
    -- Dizer "sem plano" é melhor que inventar um (regra 3).
    return jsonb_build_object('estado', 'sem_assinatura');
  end if;
  select * into v_p from planos where codigo = v_a.plano;

  select count(*) into v_ativos
    from pedidos p
    join etapas e on e.id = p.etapa_id
   where p.oficina_id = p_oficina
     and exists (select 1 from etapas e2
                  where e2.oficina_id = p.oficina_id
                    and e2.tipo_pedido = p.tipo_pedido
                    and e2.ordem > e.ordem);

  v_ate := case when v_a.status = 'teste' then v_a.teste_ate else v_a.periodo_ate end;

  if v_a.status in ('vencida', 'cancelada') then
    v_pode := false;
    v_motivo := case when v_a.status = 'cancelada'
                     then 'a assinatura foi cancelada'
                     else 'o pagamento não foi confirmado' end;
  elsif v_ate is not null and v_ate < v_hoje then
    v_pode := false;
    v_motivo := case when v_a.status = 'teste'
                     then 'o teste terminou em ' || to_char(v_ate, 'DD/MM')
                     else 'o período pago terminou em ' || to_char(v_ate, 'DD/MM') end;
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
    'provedor',        v_a.provedor
  );
end $$;

revoke all on function conta_da_oficina(uuid) from public, anon;
grant execute on function conta_da_oficina(uuid) to authenticated, service_role;

-- ── A trava, no banco ─────────────────────────────────────────
-- Regra 11: trava na tela não é trava. Sem isto, um POST direto criaria
-- pedido acima do limite e o produto não teria como cobrar por faixa.
create or replace function pedidos_respeita_plano() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_c jsonb;
begin
  v_c := conta_da_oficina(new.oficina_id);
  if v_c->>'estado' <> 'ok' then
    raise exception 'Esta oficina está sem plano ativo. Fale com o suporte.'
      using errcode = 'check_violation';
  end if;
  if not (v_c->>'pode_criar')::boolean then
    raise exception 'Não dá para criar pedido novo: %.', v_c->>'motivo'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_plano on pedidos;
create trigger trg_pedidos_plano
  before insert on pedidos
  for each row execute function pedidos_respeita_plano();

-- ── Assinatura para as oficinas que já existem ────────────────
-- Sem isto, o gatilho acima trancaria o seed e o piloto no primeiro insert.
insert into assinaturas (oficina_id, plano, status, periodo_ate)
select o.id, 'grande', 'ativa', (now() at time zone 'America/Sao_Paulo')::date + 3650
  from oficinas o
 where not exists (select 1 from assinaturas a where a.oficina_id = o.id)
on conflict (oficina_id) do nothing;

-- ── `atualizado_em` é carimbo do BANCO ────────────────────────
-- Um `new Date()` no servidor da Vercel seria um segundo relógio, em outro
-- fuso, para um campo que só faz sentido no fuso do banco (regra 8). A
-- varredura pegou exatamente isso no webhook.
create or replace function assinaturas_tocada() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_assinaturas_tocada on assinaturas;
create trigger trg_assinaturas_tocada
  before update on assinaturas
  for each row execute function assinaturas_tocada();

-- ── Endurecimento (furo achado pelo linter no mesmo dia) ──────
-- `conta_da_oficina(p_oficina)` é security definer E estava executável por
-- qualquer usuário logado, com o id da oficina VINDO DO PARÂMETRO. Ou seja:
-- qualquer cliente podia ler o plano, o status e a quantidade de pedidos em
-- andamento de QUALQUER outra oficina, só trocando o uuid.
--
-- O conserto não é conferir o parâmetro dentro dela: o gatilho do plano
-- também a chama, e ali `auth.uid()` pode ser nulo (seed, service role). O
-- conserto é tirar a função do alcance do app e dar ao app uma porta que NÃO
-- aceita id nenhum — a oficina vem de `jwt_oficina()`.
revoke execute on function conta_da_oficina(uuid) from authenticated, anon, public;

create or replace function minha_conta()
returns jsonb
language sql stable security definer set search_path = public as $$
  select conta_da_oficina(jwt_oficina())
$$;

revoke all on function minha_conta() from public, anon;
grant execute on function minha_conta() to authenticated;

-- Funções que só fazem sentido dentro de policy ou de gatilho não precisam
-- estar expostas na API. (`jwt_oficina` e `sou_dono` continuam executáveis por
-- `authenticated`: as policies são avaliadas com os direitos do usuário, e
-- revogar delas trancaria todo mundo para fora.)
revoke execute on function jwt_oficina() from anon;
revoke execute on function sou_dono()    from anon;
revoke execute on function pedidos_respeita_plano() from anon, authenticated, public;
revoke execute on function assinaturas_tocada()     from anon, authenticated, public;

-- `search_path` fixo: sem isto, quem controla o search_path da sessão pode
-- fazer a função enxergar outra tabela com o mesmo nome.
alter function pedidos_marca_etapa_desde() set search_path = public;
alter function reordenar_etapas(uuid, text, uuid[]) set search_path = public;
