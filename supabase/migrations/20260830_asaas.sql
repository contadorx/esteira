-- ─────────────────────────────────────────────────────────────
-- 20260830_asaas — o que a troca de provedor exigiu do banco (D25–D28).
--
-- A troca de Stripe para Asaas mexeu em três arquivos de código e em UMA
-- regra do banco: cancelar deixou de ser sinônimo de acabar.
--
-- ── Por que ────────────────────────────────────────────────────
-- Na Stripe o cancelamento vinha com `cancel_at_period_end` e o provedor
-- segurava o acesso até o fim. No Asaas, cancelar é **remover a assinatura**:
-- ela para de gerar cobrança na hora. Se o produto tratasse `cancelada` como
-- bloqueio imediato, quem cancelasse no dia 2 perderia o mês que já pagou —
-- ficaríamos com o dinheiro e tiraríamos o serviço.
--
-- Agora `periodo_ate` manda: cancelada com período no futuro continua com a
-- conta inteira; só não renova.
--
-- Entra junto `tem_assinatura`, que a tela usa para oferecer "ver a cobrança"
-- e "cancelar" sem precisar receber o id do cliente no navegador.
-- ─────────────────────────────────────────────────────────────

create or replace function conta_da_oficina(p_oficina uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_a      record;
  v_p      record;
  v_ativos int;
  v_ate    date;
  v_pode   boolean;
  v_motivo text;
begin
  select * into v_a from assinaturas where oficina_id = p_oficina;
  if v_a.oficina_id is null then
    return jsonb_build_object('estado', 'sem_assinatura');
  end if;
  select * into v_p from planos where codigo = v_a.plano;

  select count(*) into v_ativos
    from pedidos p
    join etapas e on e.id = p.etapa_id
   where p.oficina_id = p_oficina
     and exists (select 1 from etapas e2
                  where e2.oficina_id = p.oficina_id
                    and e2.tipo_pedido = p.tipo_pedido
                    and e2.ordem > e.ordem);

  v_ate := case when v_a.status = 'teste' then v_a.teste_ate else v_a.periodo_ate end;

  if v_a.status = 'vencida' then
    v_pode := false;
    v_motivo := 'o pagamento não foi confirmado';
  elsif v_ate is not null and v_ate < v_hoje then
    v_pode := false;
    v_motivo := case v_a.status
                  when 'teste' then 'o teste terminou em ' || to_char(v_ate, 'DD/MM')
                  when 'cancelada' then 'a assinatura foi cancelada e o período pago '
                                        || 'terminou em ' || to_char(v_ate, 'DD/MM')
                  else 'o período pago terminou em ' || to_char(v_ate, 'DD/MM') end;
  elsif v_a.status = 'cancelada' and v_ate is null then
    -- Cancelada sem período pago registrado: não há o que respeitar.
    v_pode := false;
    v_motivo := 'a assinatura foi cancelada';
  elsif v_p.limite_pedidos_ativos is not null and v_ativos >= v_p.limite_pedidos_ativos then
    v_pode := false;
    v_motivo := 'o plano ' || v_p.nome || ' vai até ' || v_p.limite_pedidos_ativos
                || ' pedidos em andamento, e você está com ' || v_ativos;
  else
    v_pode := true;
    v_motivo := null;
  end if;

  return jsonb_build_object(
    'estado',          'ok',
    'plano',           v_a.plano,
    'plano_nome',      v_p.nome,
    'preco_centavos',  v_p.preco_centavos,
    'status',          v_a.status,
    'ate',             v_ate,
    'dias_restantes',  case when v_ate is null then null else v_ate - v_hoje end,
    'pedidos_ativos',  v_ativos,
    'limite',          v_p.limite_pedidos_ativos,
    'pode_criar',      v_pode,
    'motivo',          v_motivo,
    'provedor',        v_a.provedor,
    'tem_assinatura',  (v_a.provedor_assinatura is not null)
  );
end $$;

-- Continua fora do alcance do app: quem o aplicativo chama é `minha_conta()`,
-- que não aceita id (o furo de vazamento entre oficinas, fechado no B11).
revoke execute on function conta_da_oficina(uuid) from authenticated, anon, public;
