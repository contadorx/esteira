-- ─────────────────────────────────────────────────────────────
-- seed-historico.sql — histórico de mentira, só para DESENVOLVIMENTO.
--
-- Por que existe: a tela /app/tempos só tem o que mostrar depois que pedidos
-- ATRAVESSARAM as etapas. Numa base nova ela mostra — corretamente — "ainda
-- não sei". Para conferir o desenho e a conta sem esperar um mês de oficina,
-- este arquivo inventa 12 pedidos já concluídos, com permanências variadas.
--
-- ⚠ NUNCA rode isto numa base com oficina de verdade. `limpeza-antes-do-
-- piloto.sql` apaga tudo que veio daqui junto com o resto da massa de dev
-- (os pedidos nascem na Marmoraria São Jorge, que é oficina de seed).
--
-- Rodar de novo é seguro: apaga os H-% antes de recriar.
-- ─────────────────────────────────────────────────────────────
do $seed$
declare
  v_of   uuid;
  v_ets  uuid[];
  v_qtd  int;
  v_i    int;
  v_j    int;
  v_ped  uuid;
  v_t    timestamptz;
  v_dur  numeric;
begin
  select id into v_of from oficinas where nome = 'Marmoraria São Jorge';
  if v_of is null then
    raise exception 'Marmoraria São Jorge não existe — rode supabase/seed.sql antes.';
  end if;

  delete from avancos where pedido_id in (select id from pedidos where oficina_id = v_of and numero like 'H-%');
  delete from avisos  where pedido_id in (select id from pedidos where oficina_id = v_of and numero like 'H-%');
  delete from pedidos where oficina_id = v_of and numero like 'H-%';

  select array_agg(id order by ordem) into v_ets
    from etapas where oficina_id = v_of and tipo_pedido = 'padrao';
  v_qtd := array_length(v_ets, 1);
  if v_qtd is null or v_qtd < 3 then
    raise exception 'A oficina precisa de pelo menos 3 etapas no tipo padrao (achei %)', v_qtd;
  end if;

  for v_i in 1..12 loop
    -- Começa entre 60 e 15 dias atrás, às 8h da manhã, hora de São Paulo.
    v_t := (((now() at time zone 'America/Sao_Paulo')::date - (60 - v_i * 3))::text || ' 08:00')
             ::timestamp at time zone 'America/Sao_Paulo';

    insert into pedidos(oficina_id, numero, cliente_nome, cliente_fone, descricao,
                        prazo, origem, etapa_id, criado_em, etapa_desde)
    values (v_of, 'H-' || v_i, 'Cliente histórico ' || v_i, '5511988887777',
            'Peça de histórico ' || v_i,
            (v_t + interval '20 days')::date, 'manual', v_ets[1], v_t, v_t)
    returning id into v_ped;
    -- O gatilho já gravou a entrada na primeira etapa, com `quando = criado_em`.

    for v_j in 2..v_qtd loop
      -- Permanência que varia por etapa E por pedido: sem variação a mediana
      -- fica artificialmente redonda e o p80 não diz nada.
      v_dur := 1 + ((v_j + v_i) % 4) + case when (v_i % 5) = 0 then 3 else 0 end;
      v_t := v_t + (v_dur || ' days')::interval;
      insert into avancos(pedido_id, etapa_id, quem, quando)
      values (v_ped, v_ets[v_j],
              case when v_i % 4 = 0 then 'escritorio:seed' else 'chao:seed' end,
              v_t);
    end loop;

    update pedidos set etapa_id = v_ets[v_qtd] where id = v_ped;
  end loop;

  raise notice 'Histórico criado: 12 pedidos H-%% atravessando % etapas.', v_qtd;
end $seed$;

-- Confira o que a conta aprendeu (troque o id da oficina se preciso):
-- select jsonb_pretty(tempos((select id from oficinas where nome = 'Marmoraria São Jorge')));
