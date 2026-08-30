-- ─────────────────────────────────────────────────────────────
-- nova-oficina.sql — implantação de uma oficina (fase 1).
--
-- ⚠ Desde o B10 existe autocadastro: a oficina nasce sozinha em /criar-conta,
-- com 14 dias de teste. Este script continua aqui para o caso em que VOCÊ cria
-- a conta (implantação assistida, cliente sem e-mail à mão, migração) — e
-- porque ele já é assinatura ATIVA, não teste.
--
-- Troque os três valores do topo e rode. Depois entre no app com o e-mail e
-- a senha e aplique o pack do setor em /app/etapas — as etapas ficam por
-- último de propósito: escolher o pack junto com o dono, olhando a oficina,
-- é o momento em que os nomes reais aparecem.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  v_nome  text := 'Marmoraria Exemplo';        -- nome que aparece na barra
  v_email text := 'contato@exemplo.com.br';    -- login do escritório
  v_senha text := 'troque-esta-senha';         -- diga ao dono para trocar

  v_oficina uuid;
  v_uid     uuid := gen_random_uuid();
begin
  insert into oficinas (nome) values (v_nome) returning id into v_oficina;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, crypt(v_senha, gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers', array['email'],
                       'oficina_id', v_oficina::text),
    '{}'::jsonb, '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  -- O vínculo é o que dá acesso (D20). Sem ele o login entra e não vê nada:
  -- `jwt_oficina()` lê `membros`, não mais o app_metadata.
  insert into membros (oficina_id, user_id, papel, email)
  values (v_oficina, v_uid, 'dono', v_email);

  -- E sem assinatura o gatilho do plano recusa o primeiro pedido (D22).
  -- Implantação assistida nasce ATIVA, não em teste: quem chegou por aqui já
  -- foi negociado por fora.
  insert into assinaturas (oficina_id, plano, status, periodo_ate)
  values (v_oficina, 'medio', 'ativa',
          (now() at time zone 'America/Sao_Paulo')::date + 30);

  raise notice 'Oficina % criada (id %). Login: %', v_nome, v_oficina, v_email;
end $$;
