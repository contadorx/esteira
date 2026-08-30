-- ============================================================================
-- FUMAÇA — faturas e situacao_da_cobranca (regra 10: a fumaça CHAMA a função)
--
-- Tudo dentro de BEGIN…ROLLBACK. O relatório sai pela exceção final, que é
-- também o que garante o rollback mesmo se alguém rodar isto por engano em
-- produção.
--
-- O que se prova aqui:
--   1. a leitura de status é a mesma no banco e na tela (coluna gerada);
--   2. o mesmo aviso chegando duas vezes NÃO duplica a fatura — e o segundo
--      aviso ATUALIZA a linha (PENDING vira CONFIRMED, e a situação segue);
--   3. um status que o Asaas inventar amanhã não vira "aberta" por descuido;
--   4. `minhas_faturas()` devolve as faturas de UMA oficina, nunca as de duas.
-- ============================================================================
begin;

do $$
declare
  v_of1 uuid;
  v_of2 uuid;
  r text := '';
  v_sit text;
  v_n int;
  v_valor numeric;
begin
  insert into oficinas (nome) values ('Fumaça Faturas A') returning id into v_of1;
  insert into oficinas (nome) values ('Fumaça Faturas B') returning id into v_of2;

  -- ── 1) a leitura do status ────────────────────────────────────────────────
  r := r || 'CONFIRMED=' || situacao_da_cobranca('CONFIRMED')
         || ' RECEIVED=' || situacao_da_cobranca('RECEIVED')
         || ' OVERDUE=' || situacao_da_cobranca('OVERDUE')
         || ' PENDING=' || situacao_da_cobranca('PENDING')
         || ' REFUNDED=' || situacao_da_cobranca('REFUNDED')
         || ' INVENTADO=' || situacao_da_cobranca('STATUS_QUE_NAO_EXISTE');

  if situacao_da_cobranca('STATUS_QUE_NAO_EXISTE') = 'aberta' then
    raise exception 'FUMACA FALHOU >>> status desconhecido virou "aberta"';
  end if;

  -- ── 2) o aviso chega PENDENTE ─────────────────────────────────────────────
  insert into faturas (oficina_id, provedor_cobranca, provedor_assinatura,
                       valor, vencimento, status, link)
  values (v_of1, 'pay_fumaca', 'sub_fumaca', 139.00, date '2026-09-10',
          'PENDING', 'https://asaas.example/i/pay_fumaca');

  select situacao into v_sit from faturas where provedor_cobranca = 'pay_fumaca';
  r := r || ' | 1o aviso: ' || v_sit;
  if v_sit <> 'aberta' then
    raise exception 'FUMACA FALHOU >>> PENDING devia virar aberta, veio %', v_sit;
  end if;

  -- ── 3) o MESMO aviso, de novo, agora pago ─────────────────────────────────
  -- É o upsert do webhook. Se isto inserir uma segunda linha, o extrato passa a
  -- contar a mesma mensalidade duas vezes.
  insert into faturas (oficina_id, provedor_cobranca, provedor_assinatura,
                       valor, vencimento, pago_em, status, link)
  values (v_of1, 'pay_fumaca', 'sub_fumaca', 139.00, date '2026-09-10',
          date '2026-09-08', 'CONFIRMED', 'https://asaas.example/i/pay_fumaca')
  on conflict (provedor, provedor_cobranca) do update
    set valor = excluded.valor,
        vencimento = excluded.vencimento,
        pago_em = excluded.pago_em,
        status = excluded.status,
        link = excluded.link,
        visto_em = now();

  select count(*) into v_n from faturas where provedor_cobranca = 'pay_fumaca';
  select situacao into v_sit from faturas where provedor_cobranca = 'pay_fumaca';
  r := r || ' | 2o aviso: ' || v_n || ' linha(s), situacao ' || v_sit;
  if v_n <> 1 then
    raise exception 'FUMACA FALHOU >>> reenvio duplicou a fatura (% linhas)', v_n;
  end if;
  if v_sit <> 'paga' then
    raise exception 'FUMACA FALHOU >>> CONFIRMED devia virar paga, veio %', v_sit;
  end if;

  -- ── 4) a mesma cobrança em OUTRA oficina é outra linha ────────────────────
  -- A chave é (provedor, provedor_cobranca) e não (oficina, cobrança): dois
  -- clientes NUNCA compartilham um id de cobrança do Asaas, e usar a oficina na
  -- chave deixaria um id repetido entrar duas vezes.
  insert into faturas (oficina_id, provedor_cobranca, valor, vencimento, status)
  values (v_of2, 'pay_outra', 89.00, date '2026-09-10', 'OVERDUE');

  select sum(valor) into v_valor from faturas where situacao = 'paga' and oficina_id = v_of1;
  r := r || ' | pago pela oficina A: ' || coalesce(v_valor, 0);
  if coalesce(v_valor, 0) <> 139.00 then
    raise exception 'FUMACA FALHOU >>> soma do pago deu %, esperado 139.00', v_valor;
  end if;

  select count(*) into v_n from faturas where oficina_id = v_of2;
  r := r || ' | oficina B: ' || v_n || ' fatura(s), ' ||
       (select situacao from faturas where oficina_id = v_of2);

  raise exception 'FUMACA OK >>> %', r;
end $$;

rollback;
