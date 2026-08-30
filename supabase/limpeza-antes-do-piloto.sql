-- ─────────────────────────────────────────────────────────────
-- limpeza-antes-do-piloto.sql
--
-- Rode ANTES de entregar o primeiro link a uma oficina de verdade.
--
-- Por que isto existe: o desenvolvimento deixou credenciais conhecidas no
-- banco e no repositório público — a senha `esteira123` está em texto claro
-- em `seed-auth-dev.sql`, e os tokens do chão são literais (`dev-toninho-corte`
-- e companhia). Enquanto forem só massa de teste, tudo bem. No dia em que
-- houver pedido real de cliente real na mesma base, viram porta aberta.
--
-- Rode bloco a bloco, conferindo o resultado de cada um. Nada aqui é
-- reversível.
-- ─────────────────────────────────────────────────────────────

-- ── 1. O que existe hoje ──────────────────────────────────────
-- Olhe antes de apagar. Se aparecer oficina que você não reconhece, PARE.
select o.nome as oficina,
       (select count(*) from pedidos p where p.oficina_id = o.id) as pedidos,
       (select count(*) from acessos a where a.oficina_id = o.id and a.ativo) as acessos_ativos
  from oficinas o
 order by o.criado_em;

-- ── 2. Apagar a massa de desenvolvimento ──────────────────────
-- As três oficinas do seed e tudo que pende delas. A ordem respeita as FKs.
-- ⚠ Confira na consulta acima que são MESMO só as de teste.
begin;

with alvo as (
  select id from oficinas
   where nome in ('Marmoraria São Jorge', 'Gráfica Alvorada', 'Esquadrias Ferreira')
)
delete from avisos  where pedido_id in (select p.id from pedidos p join alvo a on a.id = p.oficina_id);

with alvo as (
  select id from oficinas
   where nome in ('Marmoraria São Jorge', 'Gráfica Alvorada', 'Esquadrias Ferreira')
)
delete from avancos where pedido_id in (select p.id from pedidos p join alvo a on a.id = p.oficina_id);

-- ⚠ `assinaturas` e `membros` referenciam `oficinas` desde o B9/B11: sem
-- apagá-las antes, o delete de oficinas é recusado pela FK e a limpeza para
-- no meio — justamente na véspera do piloto.
delete from assinaturas where oficina_id in (
  select id from oficinas where nome in ('Marmoraria São Jorge','Gráfica Alvorada','Esquadrias Ferreira'));
delete from membros where oficina_id in (
  select id from oficinas where nome in ('Marmoraria São Jorge','Gráfica Alvorada','Esquadrias Ferreira'));
delete from pedidos where oficina_id in (
  select id from oficinas where nome in ('Marmoraria São Jorge','Gráfica Alvorada','Esquadrias Ferreira'));
delete from acessos where oficina_id in (
  select id from oficinas where nome in ('Marmoraria São Jorge','Gráfica Alvorada','Esquadrias Ferreira'));
delete from etapas  where oficina_id in (
  select id from oficinas where nome in ('Marmoraria São Jorge','Gráfica Alvorada','Esquadrias Ferreira'));
delete from oficinas where nome in ('Marmoraria São Jorge','Gráfica Alvorada','Esquadrias Ferreira');

-- pedidos de teste e de histórico que sobraram dos portões e do seed
delete from avisos  where pedido_id in (select id from pedidos where numero like 'T-9%' or numero like 'H-%');
delete from avancos where pedido_id in (select id from pedidos where numero like 'H-%');
delete from pedidos where numero like 'H-%';
delete from avisos  where pedido_id in (select id from pedidos where numero like 'T-9%');
delete from avancos where pedido_id in (select id from pedidos where numero like 'T-9%');
delete from pedidos where numero like 'T-9%';
delete from etapas  where tipo_pedido like 'crono%';

commit;

-- ── 3. Matar o usuário de desenvolvimento ─────────────────────
-- A senha dele está no GitHub. Não sobrevive ao primeiro cliente.
delete from auth.identities where provider_id = 'saojorge@esteira.dev';
delete from auth.users      where email       = 'saojorge@esteira.dev';

-- ── 4. Conferir que não sobrou token conhecido ────────────────
-- Tem que voltar VAZIO.
select nome, token from acessos where token like 'dev-%';

-- ── 5. Conferir que sobrou o que deveria ──────────────────────
select (select count(*) from oficinas) as oficinas,
       (select count(*) from pedidos)  as pedidos,
       (select count(*) from acessos)  as acessos,
       (select count(*) from membros)  as membros,
       (select count(*) from assinaturas) as assinaturas,
       (select count(*) from auth.users) as usuarios;

-- ── 6. Toda oficina que sobrou tem assinatura? ────────────────
-- Oficina sem assinatura não cadastra pedido (o gatilho do D22 recusa) e a
-- tela de conta diz "sem assinatura". Tem que voltar VAZIO.
select o.id, o.nome
  from oficinas o
 where not exists (select 1 from assinaturas a where a.oficina_id = o.id);

-- Depois disto, use `nova-oficina.sql` para criar a oficina do piloto, e crie
-- os acessos do chão pela tela /app/acessos — lá o token nasce com 128 bits
-- aleatórios, não com um nome que dá para adivinhar.
