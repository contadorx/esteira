-- ─────────────────────────────────────────────────────────────
-- 20260830_pedido_publico — a página que o cliente final abre (B5).
--
-- Sem sessão, como o chão: a trava mora aqui dentro. E aqui a régua do que
-- pode aparecer é a mais curta de todas — este link circula fora da oficina
-- e pode ser reencaminhado.
--
-- NÃO devolve: nome do cliente, telefone, observação interna (inclusive as de
-- "PROBLEMA"), foto do chão, nem qualquer outro pedido. Quem abre o link já
-- sabe de quem é o pedido; o nome ali não informaria o dono e informaria
-- quem recebesse o link de terceiro.
--
-- A régua completa do projeto, para não confundir:
--   · mensagem que a oficina manda ao cliente dela → nome COMPLETO
--   · tela do chão de fábrica                      → primeiro nome
--   · página pública do pedido                     → nome nenhum
-- ─────────────────────────────────────────────────────────────

create or replace function pedido_publico(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  record;
  v_etapas  jsonb;
  v_atual   int;
begin
  select p.id, p.numero, p.descricao, p.prazo, p.tipo_pedido, p.oficina_id,
         p.etapa_id, p.etapa_desde,
         o.nome as oficina,
         e.ordem as ordem_atual, e.nome as etapa_nome
    into v_pedido
    from pedidos p
    join oficinas o on o.id = p.oficina_id
    left join etapas e on e.id = p.etapa_id
   where p.token_publico = p_token;

  if v_pedido.id is null then
    return jsonb_build_object('estado', 'nao_encontrado');
  end if;

  v_atual := coalesce(v_pedido.ordem_atual, 0);

  -- A linha do tempo: todas as etapas do caminho deste pedido, com a data de
  -- quando ele entrou em cada uma (quando houver registro — pedido importado
  -- de planilha não tem histórico, e inventar data seria mentir).
  select coalesce(jsonb_agg(jsonb_build_object(
           'nome',     e.nome,
           'ordem',    e.ordem,
           'situacao', case when e.ordem < v_atual then 'cumprida'
                            when e.ordem = v_atual then 'atual'
                            else 'a_fazer' end,
           'quando',   (select max(a.quando) from avancos a
                         where a.pedido_id = v_pedido.id
                           and a.etapa_id = e.id
                           and coalesce(a.observacao, '') not like 'PROBLEMA:%')
         ) order by e.ordem), '[]'::jsonb)
    into v_etapas
    from etapas e
   where e.oficina_id = v_pedido.oficina_id
     and e.tipo_pedido = v_pedido.tipo_pedido;

  return jsonb_build_object(
    'estado',      'ok',
    'oficina',     v_pedido.oficina,
    'numero',      v_pedido.numero,
    'descricao',   v_pedido.descricao,
    'previsao',    v_pedido.prazo,
    'etapa_atual', v_pedido.etapa_nome,
    'etapa_desde', v_pedido.etapa_desde,
    'etapas',      v_etapas
  );
end $$;

revoke all on function pedido_publico(text) from public;
grant execute on function pedido_publico(text) to anon, authenticated;

-- Registrar que uma mensagem foi COPIADA. Nunca "enviada": na fase 1 quem
-- envia é a pessoa, pelo WhatsApp dela, e o aplicativo não tem como saber se
-- ela apertou enviar (regra 2).
create or replace function registrar_aviso_copiado(
  p_pedido   uuid,
  p_destino  text,
  p_template text
) returns jsonb
language plpgsql
security invoker          -- roda como o usuário: a RLS de pedidos vale
set search_path = public
as $$
declare v_quando timestamptz;
begin
  if not exists (select 1 from pedidos where id = p_pedido) then
    return jsonb_build_object('estado', 'invalido');
  end if;

  insert into avisos (pedido_id, destino, canal, template, status)
  values (p_pedido, coalesce(p_destino, 'sem telefone'), 'wa_manual', p_template, 'copiado')
  returning quando into v_quando;

  return jsonb_build_object('estado', 'ok', 'quando', v_quando);
end $$;
