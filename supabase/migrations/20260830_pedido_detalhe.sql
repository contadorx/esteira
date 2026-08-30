-- ─────────────────────────────────────────────────────────────
-- 20260830_pedido_detalhe — a gaveta do pedido (B12).
--
-- "O que aconteceu com este pedido?" era a pergunta que o produto não
-- respondia: o quadro mostrava ONDE ele está, e mais nada. Sem isto, a foto
-- que o chão tira sobe para um bucket privado e nunca é vista por ninguém —
-- o que é pior que não ter foto, porque a pessoa acredita que registrou.
--
-- Uma consulta devolve tudo (regra 4): dados, caminho, linha do tempo e
-- avisos. `security invoker` para a RLS continuar valendo — abrir o pedido de
-- outra oficina passando o id na mão não pode funcionar (regra 11).
--
-- `quem` é traduzido AQUI, não na tela: a tradução precisa ler `acessos` e
-- `membros`, e fazer isso no componente seria uma consulta por linha.
-- ─────────────────────────────────────────────────────────────

create or replace function pedido_detalhe(p_pedido uuid)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare v_p record; v_linha jsonb; v_avisos jsonb; v_hoje date;
begin
  v_hoje := (now() at time zone 'America/Sao_Paulo')::date;

  select p.*, e.nome as etapa_nome, e.ordem as etapa_ordem
    into v_p
    from pedidos p left join etapas e on e.id = p.etapa_id
   where p.id = p_pedido;

  if v_p.id is null then
    return jsonb_build_object('estado', 'nao_encontrado');
  end if;

  select coalesce(jsonb_agg(x order by x_quando), '[]'::jsonb)
    into v_linha
    from (
      select a.quando as x_quando,
             jsonb_build_object(
               'id',    a.id,
               'etapa', e.nome,
               'quando', a.quando,
               'foto',  a.foto_url,
               'observacao', a.observacao,
               -- "Deu problema" grava na MESMA etapa, com observação marcada.
               -- Sem separar aqui, ele apareceria como se o pedido tivesse
               -- andado — e a linha do tempo contaria uma história errada.
               'problema', (coalesce(a.observacao,'') like 'PROBLEMA:%'),
               'origem', case
                 when a.quem like 'entrada:%' then 'entrada'
                 when a.quem like 'chao:%'    then 'chao'
                 when a.quem like 'escritorio:%' then 'escritorio'
                 else 'outro' end,
               'quem', case
                 when a.quem like 'entrada:%' then
                   'cadastrado (' || split_part(a.quem, ':', 2) || ')'
                 when a.quem like 'chao:%' then
                   coalesce((select ac.nome from acessos ac
                              where ac.id::text = split_part(a.quem, ':', 2)),
                            'alguém do chão')
                 when a.quem like 'escritorio:%' then
                   coalesce((select m.email from membros m
                              where m.user_id::text = split_part(a.quem, ':', 2)),
                            'o escritório')
                 else a.quem end
             ) as x
        from avancos a left join etapas e on e.id = a.etapa_id
       where a.pedido_id = p_pedido
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'quando', v.quando, 'status', v.status,
           'template', v.template, 'destino', v.destino, 'erro', v.erro
         ) order by v.quando desc), '[]'::jsonb)
    into v_avisos
    from avisos v where v.pedido_id = p_pedido;

  return jsonb_build_object(
    'estado',      'ok',
    'id',          v_p.id,
    'numero',      v_p.numero,
    'cliente',     v_p.cliente_nome,
    'fone',        v_p.cliente_fone,
    'descricao',   v_p.descricao,
    'prazo',       v_p.prazo,
    'tipo',        v_p.tipo_pedido,
    'origem',      v_p.origem,
    'criado_em',   v_p.criado_em,
    'etapa',       v_p.etapa_nome,
    'etapa_ordem', v_p.etapa_ordem,
    'etapa_desde', v_p.etapa_desde,
    'dias_aqui',   v_hoje - (v_p.etapa_desde at time zone 'America/Sao_Paulo')::date,
    'token_publico', v_p.token_publico,
    'caminho', (select coalesce(jsonb_agg(jsonb_build_object('nome', e2.nome, 'ordem', e2.ordem)
                        order by e2.ordem), '[]'::jsonb)
                  from etapas e2
                 where e2.oficina_id = v_p.oficina_id and e2.tipo_pedido = v_p.tipo_pedido),
    'linha_do_tempo', v_linha,
    'avisos', v_avisos
  );
end $$;

revoke all on function pedido_detalhe(uuid) from public, anon;
grant execute on function pedido_detalhe(uuid) to authenticated;
