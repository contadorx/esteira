-- ─────────────────────────────────────────────────────────────
-- fumaca-tempos.sql — a prova da aritmética do B8.
--
-- Roda contra o banco de VERDADE, dentro de uma transação que termina em
-- exceção — ou seja, faz rollback de tudo. O relatório vem no texto da
-- exceção final ("FUMACA OK >>> …"). Qualquer divergência levanta antes,
-- com o número apurado × o esperado.
--
-- Isto existe porque `create function` que compila não prova nada (regra 10):
-- a primeira versão desta função quebrava em `round(double precision, 1)`,
-- que não existe no Postgres, e só a chamada revelou.
--
-- COMO RODAR: cole no SQL Editor do Supabase, ou aplique pelo MCP. O
-- resultado ESPERADO é um erro cujo texto começa com "FUMACA OK".
--
-- O histórico é montado com permanências conhecidas:
--   Corte      1, 2, 3 dias → mediana 2,0
--   Polimento  2, 2, 6 dias → mediana 2,0
--   Acabamento 3, 5, 4 dias → mediana 4,0 · p80 4,6 · maior 5,0
--   Corte especial / Pintura: só 2 observações → mediana NULA (regra 3)
-- E a previsão de F-4 (em Polimento há 1 dia):
--   (2,0 − 1) + 4,0 = 5,0 dias → hoje+5; prazo hoje+3 → folga −2.
--
-- ⚠ Toda hora é construída como instante local explícito ('… 09:00' at time
-- zone 'America/Sao_Paulo'). Data pura em coluna timestamptz vira meia-noite
-- UTC = 21h do dia anterior em São Paulo, e o "há N dias" sai um dia maior.
-- Essa armadilha já custou uma rodada no B6 (regra 8).
-- ─────────────────────────────────────────────────────────────

do $fumaca$
declare
  v_of uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
  e1 uuid; e2 uuid; e3 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
  x1 uuid; x2 uuid;
  r jsonb; et jsonb; pd jsonb; rel text := '';
  n_entrada int;
begin
  insert into oficinas(nome) values ('FUMACA TEMPOS') returning id into v_of;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Corte',1,'padrao') returning id into c1;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Polimento',2,'padrao') returning id into c2;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Acabamento',3,'padrao') returning id into c3;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Pronto',4,'padrao') returning id into c4;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Corte especial',1,'especial') returning id into e1;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Pintura',2,'especial') returning id into e2;
  insert into etapas(oficina_id,nome,ordem,tipo_pedido) values (v_of,'Pronto',3,'especial') returning id into e3;

  -- ── 3 pedidos concluídos, com permanência CONHECIDA ─────────
  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,criado_em,etapa_desde)
    values (v_of,'F-1','A',c1,'manual',
            ((v_hoje-20)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-20)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into p1;
  insert into avancos(pedido_id,etapa_id,quem,quando) values
   (p1,c2,'chao:x',((v_hoje-19)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (p1,c3,'chao:x',((v_hoje-17)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (p1,c4,'chao:x',((v_hoje-14)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo');
  update pedidos set etapa_id=c4 where id=p1;

  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,criado_em,etapa_desde)
    values (v_of,'F-2','B',c1,'manual',
            ((v_hoje-30)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-30)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into p2;
  insert into avancos(pedido_id,etapa_id,quem,quando) values
   (p2,c2,'chao:x',((v_hoje-28)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (p2,c3,'chao:x',((v_hoje-26)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (p2,c4,'chao:x',((v_hoje-21)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo');
  update pedidos set etapa_id=c4 where id=p2;

  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,criado_em,etapa_desde)
    values (v_of,'F-3','C',c1,'manual',
            ((v_hoje-40)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-40)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into p3;
  insert into avancos(pedido_id,etapa_id,quem,quando) values
   (p3,c2,'chao:x',((v_hoje-37)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (p3,c3,'chao:x',((v_hoje-31)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (p3,c4,'chao:x',((v_hoje-27)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo');
  update pedidos set etapa_id=c4 where id=p3;

  -- ── o pedido em jogo: em Polimento há 1 dia ─────────────────
  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,prazo,criado_em,etapa_desde)
    values (v_of,'F-4','D',c2,'manual', v_hoje+3,
            ((v_hoje-3)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-1)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into p4;

  -- ── tipo especial: só 2 observações → amostra insuficiente ──
  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,tipo_pedido,criado_em,etapa_desde)
    values (v_of,'F-X1','E',e1,'manual','especial',
            ((v_hoje-10)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-10)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into x1;
  insert into avancos(pedido_id,etapa_id,quem,quando) values
   (x1,e2,'chao:x',((v_hoje-9)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (x1,e3,'chao:x',((v_hoje-8)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo');
  update pedidos set etapa_id=e3 where id=x1;

  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,tipo_pedido,criado_em,etapa_desde)
    values (v_of,'F-X2','F',e1,'manual','especial',
            ((v_hoje-12)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-12)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into x2;
  insert into avancos(pedido_id,etapa_id,quem,quando) values
   (x2,e2,'chao:x',((v_hoje-10)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo'),
   (x2,e3,'chao:x',((v_hoje-9)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo');
  update pedidos set etapa_id=e3 where id=x2;

  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,tipo_pedido,prazo,criado_em,etapa_desde)
    values (v_of,'F-5','G',e1,'manual','especial', v_hoje+10,
            ((v_hoje-1)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo',
            ((v_hoje-1)::text||' 09:00')::timestamp at time zone 'America/Sao_Paulo')
    returning id into p5;

  -- ── pedido já na última etapa ───────────────────────────────
  insert into pedidos(oficina_id,numero,cliente_nome,etapa_id,origem,prazo,criado_em,etapa_desde)
    values (v_of,'F-6','H',c4,'manual', v_hoje+1, now(), now())
    returning id into p6;

  -- ── 0. o gatilho gravou a entrada na trilha? ────────────────
  select count(*) into n_entrada from avancos where pedido_id = p4 and quem = 'entrada:manual';
  if n_entrada <> 1 then
    raise exception 'GATILHO: esperava 1 linha entrada:manual para F-4, achei %', n_entrada;
  end if;

  r := tempos(v_of, v_hoje);

  -- ── 1. medianas conferidas na mão ───────────────────────────
  select x into et from jsonb_array_elements(r->'etapas') x
   where x->>'etapa'='Corte' and x->>'tipo'='padrao';
  if (et->>'n')::int <> 3 or (et->>'mediana_dias')::numeric <> 2.0 then
    raise exception 'CORTE: n=% mediana=% (esperado 3 e 2.0)', et->>'n', et->>'mediana_dias';
  end if;
  rel := rel || format('Corte n=%s med=%s p80=%s | ', et->>'n', et->>'mediana_dias', et->>'p80_dias');

  select x into et from jsonb_array_elements(r->'etapas') x where x->>'etapa'='Polimento';
  if (et->>'n')::int <> 3 or (et->>'mediana_dias')::numeric <> 2.0 then
    raise exception 'POLIMENTO: n=% mediana=%', et->>'n', et->>'mediana_dias';
  end if;
  rel := rel || format('Polimento n=%s med=%s | ', et->>'n', et->>'mediana_dias');

  select x into et from jsonb_array_elements(r->'etapas') x where x->>'etapa'='Acabamento';
  if (et->>'n')::int <> 3 or (et->>'mediana_dias')::numeric <> 4.0
     or (et->>'p80_dias')::numeric <> 4.6 then
    raise exception 'ACABAMENTO: n=% med=% p80=%', et->>'n', et->>'mediana_dias', et->>'p80_dias';
  end if;
  rel := rel || format('Acabamento n=%s med=%s p80=%s maior=%s | ',
                       et->>'n', et->>'mediana_dias', et->>'p80_dias', et->>'maior_dias');

  -- ── 2. última etapa: "não se mede", não "ainda não sei" ─────
  select x into et from jsonb_array_elements(r->'etapas') x
   where x->>'etapa'='Pronto' and x->>'tipo'='padrao';
  if (et->>'ultima')::boolean is not true or et->>'mediana_dias' is not null then
    raise exception 'PRONTO: ultima=% mediana=%', et->>'ultima', et->>'mediana_dias';
  end if;

  -- ── 3. amostra 2 devolve NULO, não zero (regra 3) ───────────
  select x into et from jsonb_array_elements(r->'etapas') x where x->>'etapa'='Corte especial';
  if (et->>'n')::int <> 2 or et->>'mediana_dias' is not null then
    raise exception 'AMOSTRA CURTA: n=% mediana=% (esperado 2 e NULO)', et->>'n', et->>'mediana_dias';
  end if;
  rel := rel || format('Corte especial n=2 med=%s | ', coalesce(et->>'mediana_dias','NULO'));

  -- ── 4. previsão = o que falta aqui + soma das seguintes ─────
  select x into pd from jsonb_array_elements(r->'pedidos') x where x->>'numero'='F-4';
  if pd->>'estado' <> 'previsto' or (pd->>'previsao_dias')::numeric <> 5.0
     or (pd->>'previsao_data')::date <> v_hoje+5 or (pd->>'folga_dias')::int <> -2 then
    raise exception 'F-4: estado=% dias=% data=% folga=% (esperado previsto 5.0 % -2)',
      pd->>'estado', pd->>'previsao_dias', pd->>'previsao_data', pd->>'folga_dias', v_hoje+5;
  end if;
  rel := rel || format('F-4 %s dias, sai %s, folga %s | ',
                       pd->>'previsao_dias', pd->>'previsao_data', pd->>'folga_dias');

  -- ── 5. sem histórico suficiente NÃO ganha data ──────────────
  select x into pd from jsonb_array_elements(r->'pedidos') x where x->>'numero'='F-5';
  if pd->>'estado' <> 'sem_historico' or pd->>'previsao_data' is not null then
    raise exception 'F-5: estado=% data=% (esperado sem_historico e NULO)',
      pd->>'estado', pd->>'previsao_data';
  end if;
  if pd->>'sem_previsao' not like '%Corte especial%' or pd->>'sem_previsao' not like 'faltam 1 %' then
    raise exception 'F-5: motivo pouco concreto: %', pd->>'sem_previsao';
  end if;
  rel := rel || format('F-5 sem data: "%s" | ', pd->>'sem_previsao');

  -- ── 6. já na última etapa ───────────────────────────────────
  select x into pd from jsonb_array_elements(r->'pedidos') x where x->>'numero'='F-6';
  if pd->>'estado' <> 'chegou' or pd->>'previsao_data' is not null then
    raise exception 'F-6: estado=% data=%', pd->>'estado', pd->>'previsao_data';
  end if;

  -- ── 7. o número da manchete ─────────────────────────────────
  if (r->'resumo'->>'atrasa_pela_conta')::int <> 1 then
    raise exception 'RESUMO: atrasa_pela_conta=% (esperado 1)', r->'resumo'->>'atrasa_pela_conta';
  end if;
  rel := rel || format('resumo=%s', r->'resumo');

  raise exception 'FUMACA OK >>> %', rel;
end $fumaca$;
