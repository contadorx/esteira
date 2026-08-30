-- ─────────────────────────────────────────────────────────────
-- seed.sql — massa de desenvolvimento (regra 9: verificação abre a
-- tela COM MASSA). 3 oficinas, 50 pedidos, acessos de chão fixos.
--
-- ⚠ SOMENTE DESENVOLVIMENTO. Apaga tudo antes de inserir.
-- Antes do piloto real: rodar apenas o bloco TRUNCATE e nada mais.
-- Prazos são relativos a current_date — a massa não envelhece.
-- ─────────────────────────────────────────────────────────────

begin;

-- `cascade` leva junto `membros` e `assinaturas`, que apontam para oficinas.
truncate avisos, avancos, acessos, pedidos, etapas, oficinas cascade;

-- ── oficinas (ids fixos para o seed ser re-rodável e referenciável) ──
insert into oficinas (id, nome) values
  ('a0000000-0000-4000-8000-000000000001', 'Marmoraria São Jorge'),
  ('a0000000-0000-4000-8000-000000000002', 'Gráfica Alvorada'),
  ('a0000000-0000-4000-8000-000000000003', 'Esquadrias Ferreira');

-- ── etapas por oficina ──────────────────────────────────────
-- Sem assinatura o gatilho `pedidos_respeita_plano` (D22) recusa o primeiro
-- insert e o seed inteiro falha. Massa de desenvolvimento nasce no plano
-- maior, com validade longa: ela não existe para testar cobrança.
insert into assinaturas (oficina_id, plano, status, periodo_ate)
select id, 'grande', 'ativa', (now() at time zone 'America/Sao_Paulo')::date + 3650
  from oficinas
on conflict (oficina_id) do nothing;

insert into etapas (oficina_id, nome, ordem)
select 'a0000000-0000-4000-8000-000000000001', e.nome, e.ordem
from (values ('Recebido',1),('Corte',2),('Acabamento',3),('Montagem',4),('Pronto',5),('Entregue',6)) e(nome, ordem);

insert into etapas (oficina_id, nome, ordem)
select 'a0000000-0000-4000-8000-000000000002', e.nome, e.ordem
from (values ('Arte aprovada',1),('Impressão',2),('Acabamento',3),('Pronto',4),('Entregue',5)) e(nome, ordem);

insert into etapas (oficina_id, nome, ordem)
select 'a0000000-0000-4000-8000-000000000003', e.nome, e.ordem
from (values ('Medição',1),('Corte',2),('Solda',3),('Pintura',4),('Vidro',5),('Pronto',6),('Entregue',7)) e(nome, ordem);

-- ── pedidos: Marmoraria São Jorge — a massa do mockup ───────
insert into pedidos (oficina_id, numero, cliente_nome, cliente_fone, descricao, prazo, etapa_id, etapa_desde, origem)
select 'a0000000-0000-4000-8000-000000000001', p.numero, p.cliente, '5511990000000',
       p.item, current_date + p.prazo_off, e.id, now() - (p.dias || ' days')::interval, 'manual'
from (values
  ('1029','Rest. Dom Pedro',  '2 tampos 1,20×0,70 granito cinza','Montagem',  -1, 4),
  ('1038','Construtora Vale', '12 soleiras mármore branco',      'Acabamento',  2, 2),
  ('1042','Marli Nogueira',   'Bancada 2,40×0,60 São Gabriel',   'Acabamento',  3, 1),
  ('1044','Ed. Portal Sul',   'Peitoril 8 unidades',             'Corte',       4, 3),
  ('1047','Célia Marcondes',  'Lavatório esculpido',             'Corte',       8, 2),
  ('1051','Ana Paula Reis',   'Bancada cozinha em L',            'Recebido',    3, 1),
  ('1053','Padaria Estrela',  'Balcão 3,10 m quartzo',           'Recebido',   10, 1),
  ('1055','João Bertoldo',    'Escada 14 degraus',               'Recebido',   15, 0),
  ('1031','Clínica Bem Viver','4 bancadas de banheiro',          'Pronto',      2, 1),
  ('1035','Sérgio Tanaka',    'Mesa de jantar travertino',       'Pronto',      1, 2),
  ('1022','Hotel Belvedere',  '6 tampos de recepção',            'Entregue',   -2, 0),
  ('1026','Mercado Vieira',   'Balcão frios 4,00 m',             'Entregue',   -1, 0)
) p(numero, cliente, item, etapa, prazo_off, dias)
join etapas e on e.oficina_id = 'a0000000-0000-4000-8000-000000000001' and e.nome = p.etapa;

-- ── pedidos: Gráfica Alvorada — 20 gerados ──────────────────
insert into pedidos (oficina_id, numero, cliente_nome, descricao, prazo, etapa_id, etapa_desde, origem)
select 'a0000000-0000-4000-8000-000000000002',
       (2000 + i)::text,
       (array['Ótica Visual','Colégio Monte Azul','Buffet Sabor & Cia','Auto Peças Nakamura','Imobiliária Horizonte',
              'Pizzaria Forno Vivo','Clínica Sorriso','Padoca do Bairro','Studio Fit','Advocacia Ramos'])[1 + (i % 10)],
       (array['1.000 cartões de visita','Banner 2×1 m','500 panfletos A5','Cardápios plastificados','Adesivos de vitrine',
              'Bloco de pedidos 3 vias','Crachás com cordão','Placa em PVC','Convites 15 anos','Etiquetas bobina'])[1 + (i % 10)],
       current_date + ((i * 5 % 13) - 2),
       e.id,
       now() - ((i * 3 % 5) || ' days')::interval,
       case when i % 3 = 0 then 'csv' else 'manual' end
from generate_series(1, 20) i
join etapas e on e.oficina_id = 'a0000000-0000-4000-8000-000000000002'
             and e.ordem = 1 + (i * 7 % 5);

-- ── pedidos: Esquadrias Ferreira — 18 gerados ───────────────
insert into pedidos (oficina_id, numero, cliente_nome, descricao, prazo, etapa_id, etapa_desde, origem)
select 'a0000000-0000-4000-8000-000000000003',
       (3000 + i)::text,
       (array['Cond. Jardim das Flores','Construtora Meridiano','Dona Irene','Sr. Waldomiro','Loja Mundo dos Vidros',
              'Escola Recanto','Mercadinho 2 Irmãos','Chácara Boa Vista','Ateliê Renata'])[1 + (i % 9)],
       (array['Janela 4 folhas alumínio','Porta de correr 2,10 m','Guarda-corpo 6 m','Portão basculante','Box de banheiro',
              'Grade de proteção','Esquadria de canto','Porta pivotante','Fechamento de sacada'])[1 + (i % 9)],
       current_date + ((i * 4 % 17) - 3),
       e.id,
       now() - ((i * 2 % 6) || ' days')::interval,
       'manual'
from generate_series(1, 18) i
join etapas e on e.oficina_id = 'a0000000-0000-4000-8000-000000000003'
             and e.ordem = 1 + (i * 5 % 7);

-- ── acessos de chão (tokens FIXOS de dev — trocar no piloto real) ──
insert into acessos (oficina_id, nome, etapa_id, token, pin)
select 'a0000000-0000-4000-8000-000000000001', 'Toninho', e.id, 'dev-toninho-corte', '4321'
from etapas e where e.oficina_id = 'a0000000-0000-4000-8000-000000000001' and e.nome = 'Corte';

insert into acessos (oficina_id, nome, etapa_id, token, pin)
select 'a0000000-0000-4000-8000-000000000001', 'Zé do Acabamento', e.id, 'dev-ze-acabamento', '8765'
from etapas e where e.oficina_id = 'a0000000-0000-4000-8000-000000000001' and e.nome = 'Acabamento';

insert into acessos (oficina_id, nome, token)
values ('a0000000-0000-4000-8000-000000000002', 'Bancada da Gráfica', 'dev-grafica-geral');

-- ── histórico do pedido 1042 (a linha do tempo do mockup) ───
insert into avancos (pedido_id, etapa_id, quem, quando)
select p.id, e.id, a.quem, now() - (a.dias_atras || ' days')::interval
from pedidos p
join (values
  ('Recebido',   'escritorio:seed', 6),
  ('Corte',      'chao:seed-toninho', 3),
  ('Acabamento', 'chao:seed-toninho', 1)
) a(etapa, quem, dias_atras) on true
join etapas e on e.oficina_id = p.oficina_id and e.nome = a.etapa
where p.numero = '1042' and p.oficina_id = 'a0000000-0000-4000-8000-000000000001';

commit;

-- Conferência rápida (esperado: 3 oficinas, 18 etapas, 50 pedidos, 3 acessos, 3 avanços):
-- select (select count(*) from oficinas), (select count(*) from etapas),
--        (select count(*) from pedidos),  (select count(*) from acessos),
--        (select count(*) from avancos);
