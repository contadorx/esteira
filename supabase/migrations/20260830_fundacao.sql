-- ─────────────────────────────────────────────────────────────
-- 20260830_fundacao — as 6 tabelas da Esteira, RLS desde o início (D7),
-- acesso do chão como tabela (D11), índices do quadro e do radar.
-- Regra 10 do 05: este arquivo está no repositório E aplicado no banco
-- no mesmo dia. Se divergirem, o repositório é quem está errado.
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── oficinas ────────────────────────────────────────────────
create table oficinas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  logo_url  text,
  fuso      text not null default 'America/Sao_Paulo',
  criado_em timestamptz not null default now()
);

-- ── etapas (por oficina e por tipo de pedido — D6) ──────────
create table etapas (
  id          uuid primary key default gen_random_uuid(),
  oficina_id  uuid not null references oficinas(id),
  nome        text not null,
  ordem       int  not null,
  tipo_pedido text not null default 'padrao',
  unique (oficina_id, tipo_pedido, ordem)
);

-- ── pedidos ─────────────────────────────────────────────────
create table pedidos (
  id            uuid primary key default gen_random_uuid(),
  oficina_id    uuid not null references oficinas(id),
  numero        text not null,
  cliente_nome  text not null,
  cliente_fone  text,
  descricao     text,
  prazo         date,
  tipo_pedido   text not null default 'padrao',
  etapa_id      uuid references etapas(id),
  etapa_desde   timestamptz not null default now(),
  origem        text not null check (origem in ('csv','manual') or origem like 'erp:%'),
  token_publico text not null unique default encode(gen_random_bytes(16), 'hex'),
  criado_em     timestamptz not null default now(),
  unique (oficina_id, numero)
);

-- ── avancos (trilha de quem moveu o quê — alimenta a métrica nº 1) ──
-- quem: 'chao:<acesso_id>' | 'escritorio:<user_id>' | 'seed:<nota>'
create table avancos (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references pedidos(id),
  etapa_id   uuid not null references etapas(id),
  quem       text not null,
  quando     timestamptz not null default now(),
  foto_url   text,
  observacao text
);

-- ── avisos (trilha do canal — regra 1: estados honestos) ────
create table avisos (
  id        uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  destino   text not null,
  canal     text not null default 'wa_manual',
  template  text not null,
  status    text not null check (status in ('copiado','enviado','falhou','nao_confirmado')),
  quando    timestamptz not null default now(),
  erro      text
);

-- ── acessos (D11 — o mecanismo do D1: revogável e escopado) ─
create table acessos (
  id         uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references oficinas(id),
  nome       text not null,
  etapa_id   uuid references etapas(id),  -- null = vê a oficina inteira
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  pin        text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ── índices (o quadro e o radar são exatamente estas consultas) ──
create index pedidos_oficina_etapa on pedidos (oficina_id, etapa_id);
create index pedidos_oficina_prazo on pedidos (oficina_id, prazo);
create index avancos_pedido on avancos (pedido_id, quando desc);
create index avisos_pedido on avisos (pedido_id, quando desc);
create index acessos_oficina on acessos (oficina_id) where ativo;

-- ── etapa_desde se mantém sozinho (alimenta "3d aqui" e o radar) ──
create or replace function pedidos_marca_etapa_desde() returns trigger
language plpgsql as $$
begin
  if new.etapa_id is distinct from old.etapa_id then
    new.etapa_desde := now();
  end if;
  return new;
end $$;

create trigger trg_pedidos_etapa_desde
  before update on pedidos
  for each row execute function pedidos_marca_etapa_desde();

-- ── multi-tenant (D7): a oficina do usuário vem do JWT ──────
-- app_metadata é controlado pelo servidor (o usuário NÃO edita).
-- Fase 1: um usuário de auth por oficina; o oficina_id entra no
-- app_metadata na criação do usuário.
create or replace function jwt_oficina() returns uuid
language sql stable as $$
  select nullif(auth.jwt()->'app_metadata'->>'oficina_id','')::uuid
$$;

-- ── RLS: ligada em 6 de 6, policies junto com as tabelas (D7) ──
alter table oficinas enable row level security;
alter table etapas   enable row level security;
alter table pedidos  enable row level security;
alter table avancos  enable row level security;
alter table avisos   enable row level security;
alter table acessos  enable row level security;

-- anon não toca em tabela nenhuma. As rotas públicas (/p, /c) leem por
-- função security definer com token — a trava é o banco (regra 11).
revoke all on oficinas, etapas, pedidos, avancos, avisos, acessos from anon;

create policy oficinas_sel on oficinas for select to authenticated
  using (id = jwt_oficina());
create policy oficinas_upd on oficinas for update to authenticated
  using (id = jwt_oficina()) with check (id = jwt_oficina());

create policy etapas_all on etapas for all to authenticated
  using (oficina_id = jwt_oficina()) with check (oficina_id = jwt_oficina());

create policy pedidos_all on pedidos for all to authenticated
  using (oficina_id = jwt_oficina()) with check (oficina_id = jwt_oficina());

create policy acessos_all on acessos for all to authenticated
  using (oficina_id = jwt_oficina()) with check (oficina_id = jwt_oficina());

create policy avancos_all on avancos for all to authenticated
  using (exists (select 1 from pedidos p
                 where p.id = pedido_id and p.oficina_id = jwt_oficina()))
  with check (exists (select 1 from pedidos p
                      where p.id = pedido_id and p.oficina_id = jwt_oficina()));

create policy avisos_all on avisos for all to authenticated
  using (exists (select 1 from pedidos p
                 where p.id = pedido_id and p.oficina_id = jwt_oficina()))
  with check (exists (select 1 from pedidos p
                      where p.id = pedido_id and p.oficina_id = jwt_oficina()));
