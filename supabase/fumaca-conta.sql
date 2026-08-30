-- ─────────────────────────────────────────────────────────────
-- fumaca-conta.sql — a prova das regras de conta, plano e cobrança.
--
-- Dois blocos, cada um em transação que termina em exceção (rollback total).
-- O relatório vem no texto da exceção final ("FUMACA OK >>> …"); qualquer
-- divergência levanta antes, com o apurado × o esperado.
--
-- BLOCO 1 — criar oficina, teste de 14 dias e a trava do plano no banco.
-- BLOCO 2 — cancelar não é acabar (a regra que a troca para o Asaas exigiu).
--
-- COMO RODAR: cole no SQL Editor do Supabase, ou aplique pelo MCP. O
-- resultado ESPERADO é um erro cujo texto começa com "FUMACA OK".
-- ─────────────────────────────────────────────────────────────

-- ═══ BLOCO 1 ═════════════════════════════════════════════════
do $f$
declare
  v_u uuid := gen_random_uuid();
  v_r jsonb; v_c jsonb; v_of uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_et uuid; v_ok boolean; rel text := '';
begin
  insert into auth.users (id, email, aud, role, created_at, updated_at)
  values (v_u, 'fumaca-conta@esteira.dev', 'authenticated', 'authenticated', now(), now());

  -- 1) criar_oficina cria tudo numa transação
  v_r := criar_oficina(v_u, '  Oficina da Fumaça  ', array['Corte','Pintura','Pronto']);
  v_of := (v_r->>'oficina_id')::uuid;
  if (v_r->>'etapas')::int <> 3 then raise exception 'ETAPAS: %', v_r; end if;
  if (v_r->>'teste_ate')::date <> v_hoje + 14 then raise exception 'TESTE_ATE: %', v_r; end if;
  if (select nome from oficinas where id = v_of) <> 'Oficina da Fumaça' then
    raise exception 'NOME não foi aparado';
  end if;
  if (select count(*) from membros where oficina_id = v_of and papel='dono' and ativo) <> 1 then
    raise exception 'MEMBRO dono não criado';
  end if;
  rel := rel || format('criou oficina com 3 etapas, dono e teste ate %s | ', v_r->>'teste_ate');

  -- 2) o mesmo usuário não cria uma segunda oficina
  begin
    perform criar_oficina(v_u, 'Outra', array['A','B']);
    raise exception 'SEGUNDA OFICINA: deveria ter recusado';
  exception when others then
    if sqlerrm not like '%já pertence%' then raise; end if;
  end;
  rel := rel || 'segundo cadastro recusado | ';

  -- 3) etapas de menos é recusado
  begin
    perform criar_oficina(gen_random_uuid(), 'X', array['So uma']);
    raise exception 'UMA ETAPA: deveria ter recusado';
  exception when others then
    if sqlerrm not like '%pelo menos 2 etapas%' then raise; end if;
  end;

  -- 4) conta_da_oficina no estado recém-nascido
  v_c := conta_da_oficina(v_of);
  if v_c->>'status' <> 'teste' or (v_c->>'pode_criar')::boolean is not true
     or (v_c->>'pedidos_ativos')::int <> 0 or (v_c->>'dias_restantes')::int <> 14 then
    raise exception 'CONTA NOVA: %', v_c;
  end if;
  rel := rel || format('conta nova: %s dias, limite %s | ', v_c->>'dias_restantes', v_c->>'limite');

  -- 5) o limite trava no BANCO
  insert into planos (codigo, nome, preco_centavos, limite_pedidos_ativos, ordem)
  values ('fumaca', 'Fumaça', 100, 2, 99);
  update assinaturas set plano = 'fumaca' where oficina_id = v_of;
  select id into v_et from etapas where oficina_id = v_of and ordem = 1;

  insert into pedidos (oficina_id, numero, cliente_nome, etapa_id, origem)
  values (v_of,'L-1','A',v_et,'manual'), (v_of,'L-2','B',v_et,'manual');

  v_c := conta_da_oficina(v_of);
  if (v_c->>'pedidos_ativos')::int <> 2 or (v_c->>'pode_criar')::boolean is not false then
    raise exception 'LIMITE: %', v_c;
  end if;
  if v_c->>'motivo' not like '%2 pedidos em andamento%' then
    raise exception 'MOTIVO POUCO CONCRETO: %', v_c->>'motivo';
  end if;

  v_ok := false;
  begin
    insert into pedidos (oficina_id, numero, cliente_nome, etapa_id, origem)
    values (v_of,'L-3','C',v_et,'manual');
  exception when others then
    v_ok := true;
    if sqlerrm not like '%pedido novo%' then raise exception 'MENSAGEM DA TRAVA: %', sqlerrm; end if;
  end;
  if not v_ok then raise exception 'TRAVA: o banco aceitou pedido acima do limite'; end if;
  rel := rel || format('trava do plano: "%s" | ', v_c->>'motivo');

  -- 6) travado para criar, LIVRE para mover o que já existe
  update pedidos set etapa_id = (select id from etapas where oficina_id=v_of and ordem=2)
   where oficina_id = v_of and numero = 'L-1';
  rel := rel || 'mover continua livre | ';

  -- 7) teste vencido bloqueia criar, com a data na frase
  update assinaturas set plano='teste', status='teste', teste_ate = v_hoje - 1 where oficina_id = v_of;
  v_c := conta_da_oficina(v_of);
  if (v_c->>'pode_criar')::boolean is not false or v_c->>'motivo' not like 'o teste terminou em%' then
    raise exception 'TESTE VENCIDO: %', v_c;
  end if;
  rel := rel || format('teste vencido: "%s"', v_c->>'motivo');

  raise exception 'FUMACA OK (bloco 1) >>> %', rel;
end $f$;

-- ═══ BLOCO 2 — cancelar não é acabar (D27) ═══════════════════
-- Rode este separado do bloco 1: cada um termina em exceção, e a exceção do
-- primeiro aborta o resto do arquivo.
do $f$
declare
  v_of uuid; e1 uuid; e2 uuid; v_c jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  rel text := '';
begin
  insert into oficinas(nome) values ('FUMACA CANCELA') returning id into v_of;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'A',1,'padrao') returning id into e1;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'B',2,'padrao') returning id into e2;

  -- 1) cancelada COM período no futuro: a conta continua inteira
  insert into assinaturas(oficina_id, plano, status, periodo_ate, provedor, provedor_assinatura)
  values (v_of, 'medio', 'cancelada', v_hoje + 12, 'asaas', 'sub_x');
  v_c := conta_da_oficina(v_of);
  if (v_c->>'pode_criar')::boolean is not true or v_c->>'motivo' is not null then
    raise exception 'CANCELADA COM PERIODO: %', v_c;
  end if;
  if (v_c->>'tem_assinatura')::boolean is not true then
    raise exception 'TEM_ASSINATURA deveria ser true: %', v_c;
  end if;
  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem)
  values (v_of,'C-1','A',e1,'manual');
  rel := rel || format('cancelada com %s dias: segue criando pedido | ', v_c->>'dias_restantes');

  -- 2) cancelada com período JÁ vencido: bloqueia, e a frase diz as duas coisas
  update assinaturas set periodo_ate = v_hoje - 1 where oficina_id = v_of;
  v_c := conta_da_oficina(v_of);
  if (v_c->>'pode_criar')::boolean is not false
     or v_c->>'motivo' not like '%cancelada e o período pago terminou em%' then
    raise exception 'CANCELADA VENCIDA: %', v_c;
  end if;
  begin
    insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem)
    values (v_of,'C-2','B',e1,'manual');
    raise exception 'TRAVA: aceitou pedido com assinatura cancelada e vencida';
  exception when others then
    if sqlerrm like '%TRAVA%' then raise; end if;
    if sqlerrm not like '%pedido novo%' then raise; end if;
  end;
  rel := rel || format('cancelada e vencida: "%s" | ', v_c->>'motivo');

  -- 3) vencida por falta de pagamento bloqueia mesmo com data no futuro
  update assinaturas set status='vencida', periodo_ate = v_hoje + 30 where oficina_id = v_of;
  v_c := conta_da_oficina(v_of);
  if (v_c->>'pode_criar')::boolean is not false
     or v_c->>'motivo' <> 'o pagamento não foi confirmado' then
    raise exception 'VENCIDA: %', v_c;
  end if;
  rel := rel || format('vencida mesmo com data no futuro: "%s" | ', v_c->>'motivo');

  -- 4) sem assinatura no provedor, tem_assinatura é falso
  update assinaturas set status='ativa', provedor_assinatura=null where oficina_id = v_of;
  v_c := conta_da_oficina(v_of);
  if (v_c->>'tem_assinatura')::boolean is not false then
    raise exception 'TEM_ASSINATURA deveria ser false: %', v_c;
  end if;
  rel := rel || 'sem assinatura no provedor: tem_assinatura=false';

  raise exception 'FUMACA OK (bloco 2) >>> %', rel;
end $f$;
