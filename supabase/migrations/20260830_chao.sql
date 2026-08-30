-- ─────────────────────────────────────────────────────────────
-- 20260830_chao — o celular do chão de fábrica (B4).
--
-- Aqui não existe sessão de autenticação: o acesso é por link (D1). A trava,
-- portanto, TEM que morar no banco — se ela morasse na tela, bastaria chamar
-- a API direto para atravessá-la (regra 11).
--
-- Estas funções são `security definer` porque `anon` não tem permissão em
-- tabela nenhuma. Cada uma valida o token, o PIN e o escopo antes de qualquer
-- leitura ou escrita, e `set search_path = public` impede que um schema
-- plantado no caminho troque as tabelas por baixo.
--
-- Consequência do D1 respeitada aqui dentro: a tela do chão vê número do
-- pedido, descrição, prazo e o PRIMEIRO NOME do cliente. Nada de telefone,
-- valor ou sobrenome — quem tem o link tem o que está nestas funções.
-- ─────────────────────────────────────────────────────────────

-- Resolve o acesso e confere o PIN. Devolve null quando não passa.
create or replace function chao_acesso(p_token text, p_pin text)
returns acessos
language plpgsql
security definer
set search_path = public
as $$
declare v_acesso acessos;
begin
  select * into v_acesso from acessos where token = p_token and ativo;
  if not found then return null; end if;
  if v_acesso.pin is not null and (p_pin is null or p_pin <> v_acesso.pin) then
    return null;
  end if;
  return v_acesso;
end $$;

-- O painel: quem sou eu e o que está comigo.
create or replace function chao_painel(p_token text, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso  acessos;
  v_bruto   acessos;
  v_oficina text;
  v_lista   jsonb;
begin
  select * into v_bruto from acessos where token = p_token and ativo;
  if not found then
    return jsonb_build_object('estado', 'invalido');
  end if;

  v_acesso := chao_acesso(p_token, p_pin);
  if v_acesso is null then
    -- O link existe, mas falta o PIN. Dizer isso não vaza nada além de que o
    -- link é de alguém — e sem isso a tela não saberia o que pedir.
    return jsonb_build_object('estado', 'pin', 'nome', v_bruto.nome);
  end if;

  select nome into v_oficina from oficinas where id = v_acesso.oficina_id;

  select coalesce(jsonb_agg(x order by x->>'prazo' nulls last, x->>'numero'), '[]'::jsonb)
    into v_lista
  from (
    select jsonb_build_object(
             'id',           p.id,
             'numero',       p.numero,
             'cliente',      split_part(p.cliente_nome, ' ', 1),  -- D1: só o primeiro nome
             'descricao',    p.descricao,
             'prazo',        p.prazo,
             'etapa_id',     p.etapa_id,
             'etapa_nome',   e.nome,
             'etapa_desde',  p.etapa_desde,
             'proxima_nome', prox.nome
           ) as x
      from pedidos p
      join etapas e on e.id = p.etapa_id
      join lateral (
             select e2.nome
               from etapas e2
              where e2.oficina_id = p.oficina_id
                and e2.tipo_pedido = p.tipo_pedido
                and e2.ordem > e.ordem
              order by e2.ordem
              limit 1
           ) prox on true
     where p.oficina_id = v_acesso.oficina_id
       and (v_acesso.etapa_id is null or p.etapa_id = v_acesso.etapa_id)
  ) t;

  return jsonb_build_object(
    'estado',  'ok',
    'nome',    v_acesso.nome,
    'oficina', v_oficina,
    'posto',   (select nome from etapas where id = v_acesso.etapa_id),
    'pedidos', v_lista
  );
end $$;

-- Avançar. A próxima etapa é decidida AQUI, não enviada pela tela: o chão
-- empurra o pedido um passo adiante, e não para onde alguém pedir.
--
-- Os três "não deu" são testados separadamente, de propósito. A primeira
-- versão desta função descobria o motivo DEPOIS, adivinhando — e chegou a
-- responder "já está na última etapa" para um pedido que só não era daquele
-- posto. Recusa certa com motivo errado continua sendo violação da regra 2;
-- foi o portão do B4 que pegou.
create or replace function chao_avancar(
  p_token       text,
  p_pin         text,
  p_pedido      uuid,
  p_etapa_atual uuid,
  p_foto        text default null,
  p_observacao  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso    acessos;
  v_numero    text;
  v_etapa_ora uuid;
  v_onde      text;
  v_proxima   uuid;
  v_nome      text;
begin
  v_acesso := chao_acesso(p_token, p_pin);
  if v_acesso is null then
    return jsonb_build_object('estado', 'invalido');
  end if;

  select p.numero, p.etapa_id into v_numero, v_etapa_ora
    from pedidos p
   where p.id = p_pedido and p.oficina_id = v_acesso.oficina_id;

  -- Não é desta oficina: não existe, para quem pergunta.
  if v_numero is null then
    return jsonb_build_object('estado', 'invalido');
  end if;

  -- Posto escopado só fala do próprio posto.
  if v_acesso.etapa_id is not null and p_etapa_atual is distinct from v_acesso.etapa_id then
    return jsonb_build_object('estado', 'invalido');
  end if;

  select nome into v_onde from etapas where id = v_etapa_ora;

  -- Saiu da etapa que a tela viu: alguém marcou antes.
  if v_etapa_ora is distinct from p_etapa_atual then
    return jsonb_build_object('estado', 'conflito', 'numero', v_numero, 'onde', v_onde);
  end if;

  select e2.id, e2.nome into v_proxima, v_nome
    from pedidos p
    join etapas e  on e.id = p.etapa_id
    join etapas e2 on e2.oficina_id = p.oficina_id
                  and e2.tipo_pedido = p.tipo_pedido
                  and e2.ordem > e.ordem
   where p.id = p_pedido
   order by e2.ordem
   limit 1;

  -- Está onde deveria, mas o caminho acabou.
  if v_proxima is null then
    return jsonb_build_object('estado', 'fim', 'numero', v_numero, 'onde', v_onde);
  end if;

  -- A TRAVA continua no where: entre o select acima e este update, outra
  -- pessoa ainda pode ter movido o pedido (regra 7).
  update pedidos
     set etapa_id = v_proxima
   where id = p_pedido
     and etapa_id = p_etapa_atual
     and oficina_id = v_acesso.oficina_id
  returning numero into v_numero;

  if v_numero is null then
    select p.numero, e.nome into v_numero, v_onde
      from pedidos p left join etapas e on e.id = p.etapa_id
     where p.id = p_pedido and p.oficina_id = v_acesso.oficina_id;
    return jsonb_build_object('estado', 'conflito', 'numero', v_numero, 'onde', v_onde);
  end if;

  insert into avancos (pedido_id, etapa_id, quem, foto_url, observacao)
  values (p_pedido, v_proxima, 'chao:' || v_acesso.id, p_foto, p_observacao);

  return jsonb_build_object('estado', 'ok', 'numero', v_numero, 'etapa', v_nome);
end $$;

-- "Deu problema": registra sem mover o pedido. O escritório precisa saber que
-- algo travou; fingir que andou seria pior que não registrar nada.
create or replace function chao_problema(
  p_token      text,
  p_pin        text,
  p_pedido     uuid,
  p_observacao text,
  p_foto       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso acessos;
  v_etapa  uuid;
  v_numero text;
begin
  v_acesso := chao_acesso(p_token, p_pin);
  if v_acesso is null then return jsonb_build_object('estado', 'invalido'); end if;

  select p.etapa_id, p.numero into v_etapa, v_numero
    from pedidos p
   where p.id = p_pedido
     and p.oficina_id = v_acesso.oficina_id
     and (v_acesso.etapa_id is null or p.etapa_id = v_acesso.etapa_id);

  if v_etapa is null then return jsonb_build_object('estado', 'invalido'); end if;

  insert into avancos (pedido_id, etapa_id, quem, foto_url, observacao)
  values (p_pedido, v_etapa, 'chao:' || v_acesso.id, p_foto,
          'PROBLEMA: ' || coalesce(nullif(trim(p_observacao), ''), '(sem descrição)'));

  return jsonb_build_object('estado', 'ok', 'numero', v_numero);
end $$;

-- `anon` executa só estas três. `chao_acesso` é interna: ninguém a chama de fora.
revoke all on function chao_acesso(text, text) from public, anon;
revoke all on function chao_painel(text, text) from public;
revoke all on function chao_avancar(text, text, uuid, uuid, text, text) from public;
revoke all on function chao_problema(text, text, uuid, text, text) from public;
grant execute on function chao_painel(text, text) to anon, authenticated;
grant execute on function chao_avancar(text, text, uuid, uuid, text, text) to anon, authenticated;
grant execute on function chao_problema(text, text, uuid, text, text) to anon, authenticated;

-- Bucket das fotos do chão. Privado: a foto entra pela função (service role,
-- depois de o token ser validado) e sai por URL assinada — nunca por link
-- público adivinhável.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avancos', 'avancos', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
