-- ─────────────────────────────────────────────────────────────
-- 20260830_membros — multiusuário por oficina (B9).
--
-- ⚠ ESTA É A MIGRATION MAIS ARRISCADA DO PRODUTO. Ela troca a fonte do
-- tenant: até aqui a oficina do usuário vinha de `app_metadata.oficina_id`
-- (D12); a partir daqui vem da tabela `membros`. Como `jwt_oficina()` é o que
-- TODAS as policies de RLS usam, trocar o corpo dela troca a fronteira de
-- isolamento de todas as tabelas ao mesmo tempo.
--
-- O que segura o risco: a direção da falha. Se o backfill não encontrar um
-- usuário, ele fica SEM oficina — e não vendo a oficina errada. A porta que
-- emperra fecha; nunca abre. (Regra 13: e se a segunda metade falhar?)
--
-- ── Por que sair do app_metadata ──────────────────────────────
-- 1. `app_metadata` só muda em token novo: amarrar um usuário a uma oficina
--    exigia sair e entrar de novo, e isso já estava escrito como consequência
--    incômoda do D12.
-- 2. Não cabe um segundo usuário sem um lugar para guardar papel e "ativo".
-- 3. Revogar acesso de alguém tinha que ser feito no painel do Supabase, não
--    no produto.
--
-- ── Um usuário pertence a UMA oficina (unique em user_id) ─────
-- Não é limitação de banco de dados, é decisão: com uma oficina por usuário,
-- `jwt_oficina()` continua devolvendo um único uuid e nenhuma policy precisa
-- mudar de forma. Multi-oficina por pessoa (contador que atende várias) é
-- outro produto e entra com sua própria decisão escrita.
-- ─────────────────────────────────────────────────────────────

create table if not exists membros (
  id         uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references oficinas(id),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- `dono` administra pessoas e assinatura; `escritorio` opera o dia a dia.
  -- Duas linhas, não uma matriz de permissões: permissão fina está fora do
  -- MVP e continua fora até alguém pedir três vezes.
  papel      text not null default 'escritorio' check (papel in ('dono','escritorio')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (user_id)
);

create index if not exists membros_oficina on membros (oficina_id) where ativo;

-- ── Backfill: quem já existe não pode perder o acesso ─────────
-- Vem do app_metadata, que era a fonte anterior. Roda ANTES de trocar a
-- função — se rodasse depois, o dono ficaria trancado para fora entre uma
-- coisa e outra.
insert into membros (oficina_id, user_id, papel)
select (u.raw_app_meta_data->>'oficina_id')::uuid, u.id, 'dono'
  from auth.users u
 where u.raw_app_meta_data->>'oficina_id' is not null
   and exists (select 1 from oficinas o where o.id = (u.raw_app_meta_data->>'oficina_id')::uuid)
on conflict (user_id) do nothing;

-- ── A nova fonte do tenant ────────────────────────────────────
-- `security definer` de propósito: esta função é chamada DE DENTRO das
-- policies de `membros`. Se rodasse como o usuário, avaliar a policy exigiria
-- chamar a função, que leria a tabela, que avaliaria a policy — recursão. Ao
-- atravessar a RLS ela lê a linha direto e a recursão não existe.
-- `stable` para o planejador chamar uma vez por consulta, não por linha.
create or replace function jwt_oficina() returns uuid
language sql stable security definer set search_path = public as $$
  select m.oficina_id from membros m where m.user_id = auth.uid() and m.ativo limit 1
$$;

create or replace function sou_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select m.papel = 'dono' from membros m
                    where m.user_id = auth.uid() and m.ativo limit 1), false)
$$;

-- ── RLS de `membros` ──────────────────────────────────────────
alter table membros enable row level security;
revoke all on membros from anon;

drop policy if exists membros_sel on membros;
create policy membros_sel on membros for select to authenticated
  using (oficina_id = jwt_oficina());

-- Só o dono mexe em gente. E o `with check` repete a condição de propósito:
-- sem ele, um dono poderia mover alguém para OUTRA oficina com um update.
drop policy if exists membros_ins on membros;
create policy membros_ins on membros for insert to authenticated
  with check (oficina_id = jwt_oficina() and sou_dono());

drop policy if exists membros_upd on membros;
create policy membros_upd on membros for update to authenticated
  using (oficina_id = jwt_oficina() and sou_dono())
  with check (oficina_id = jwt_oficina() and sou_dono());

-- Sem policy de delete: desativar (`ativo = false`) preserva o histórico de
-- quem avançou o quê. Apagar o membro deixaria `avancos.quem` apontando para
-- ninguém, e a métrica nº 1 é feita desse campo.

-- ── A sessão inteira numa chamada só ──────────────────────────
-- O layout precisava de oficina, nome e papel; eram três consultas em três
-- lugares. Regra 12: o ajuste pertence a um lugar só. E `sem_oficina` é um
-- estado de verdade — usuário criado cuja oficina não terminou de nascer —
-- distinto de "sem sessão" (regra 3).
create or replace function minha_sessao() returns jsonb
language sql stable security invoker set search_path = public as $$
  select case
    when auth.uid() is null then jsonb_build_object('estado', 'sem_sessao')
    else coalesce(
      (select jsonb_build_object(
                'estado',     'ok',
                'usuario_id', m.user_id,
                'oficina_id', o.id,
                'oficina',    o.nome,
                'papel',      m.papel)
         from membros m join oficinas o on o.id = m.oficina_id
        where m.user_id = auth.uid() and m.ativo),
      jsonb_build_object('estado', 'sem_oficina'))
  end
$$;

revoke all on function minha_sessao() from public;
grant execute on function minha_sessao() to authenticated;

-- ── O e-mail de acesso, junto do membro ───────────────────────
-- Para a tela de pessoas não depender do service role só para dizer quem é
-- quem. É uma CÓPIA do que estava no Auth no momento do convite — por isso a
-- tela chama de "e-mail de acesso" e não promete refletir uma troca feita
-- depois direto no Supabase.
alter table membros add column if not exists email text;

update membros m
   set email = u.email
  from auth.users u
 where u.id = m.user_id and m.email is null;
