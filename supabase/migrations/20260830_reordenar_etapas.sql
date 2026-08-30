-- ─────────────────────────────────────────────────────────────
-- 20260830_reordenar_etapas — reordenação atômica das etapas (B2).
--
-- O problema: `unique (oficina_id, tipo_pedido, ordem)` briga com troca
-- in-place. Trocar a 2 pela 3 em duas escritas passa por um estado em que
-- duas etapas têm a mesma ordem — e o banco recusa, com razão.
--
-- A solução não é afrouxar o índice (ele é o que impede ordem duplicada em
-- produção): é renumerar tudo de uma vez, aqui dentro. Primeiro a faixa
-- negativa (livre de colisão), depois a definitiva.
--
-- Regra 1: função de banco LEVANTA EXCEÇÃO em falha. Devolver {ok:false}
-- reintroduz exatamente a falha silenciosa que o projeto combate.
-- Roda com direitos do CHAMADOR (sem security definer): a RLS continua
-- valendo, e uma oficina não reordena a etapa de outra.
-- ─────────────────────────────────────────────────────────────

create or replace function reordenar_etapas(
  p_oficina uuid,
  p_tipo    text,
  p_ids     uuid[]
) returns integer
language plpgsql
as $$
declare
  v_total   integer;
  v_pedidas integer := array_length(p_ids, 1);
  v_afetadas integer;
begin
  if v_pedidas is null or v_pedidas = 0 then
    raise exception 'reordenar_etapas: lista de etapas vazia';
  end if;

  select count(*) into v_total
    from etapas
   where oficina_id = p_oficina and tipo_pedido = p_tipo;

  -- A lista precisa ser COMPLETA. Reordenar um pedaço deixaria as demais na
  -- faixa negativa — dado corrompido em silêncio, que é o pecado capital.
  if v_total <> v_pedidas then
    raise exception
      'reordenar_etapas: a lista tem % etapa(s), mas o tipo % tem %',
      v_pedidas, p_tipo, v_total;
  end if;

  update etapas
     set ordem = -ordem
   where oficina_id = p_oficina and tipo_pedido = p_tipo;

  update etapas e
     set ordem = x.pos
    from (
      select id, pos
        from unnest(p_ids) with ordinality as t(id, pos)
    ) x
   where e.id = x.id
     and e.oficina_id = p_oficina
     and e.tipo_pedido = p_tipo;

  get diagnostics v_afetadas = row_count;

  -- Se alguma etapa ficou negativa, um id da lista não era daqui.
  if v_afetadas <> v_total then
    raise exception
      'reordenar_etapas: % etapa(s) atualizadas de % — algum id não pertence a este tipo',
      v_afetadas, v_total;
  end if;

  return v_afetadas;
end $$;

comment on function reordenar_etapas(uuid, text, uuid[]) is
  'Renumera TODAS as etapas de um tipo de pedido em uma transação. Lista incompleta ou id estranho levanta exceção.';
