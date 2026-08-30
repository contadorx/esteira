-- ─────────────────────────────────────────────────────────────
-- seed-auth-dev.sql — usuário do escritório para DESENVOLVIMENTO.
--
-- Fase 1: um usuário por oficina. O tenant vive em app_metadata.oficina_id,
-- que é o que `jwt_oficina()` lê nas policies de RLS. app_metadata é
-- controlado pelo servidor — o usuário não edita.
--
-- ⚠ SÓ PARA DESENVOLVIMENTO. Para uma oficina real, crie o usuário pelo
-- Dashboard (Authentication → Add user) e rode apenas o UPDATE do final.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  v_uid     uuid := gen_random_uuid();
  v_email   text := 'saojorge@esteira.dev';
  v_senha   text := 'esteira123';
  v_oficina uuid := 'a0000000-0000-4000-8000-000000000001';  -- Marmoraria São Jorge
begin
  delete from auth.identities where provider_id = v_email;
  delete from auth.users where email = v_email;

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

  -- Sem identity, o login por e-mail/senha não funciona nas versões atuais.
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );
end $$;

-- ── Amarrar um usuário JÁ EXISTENTE a uma oficina (o caminho de produção) ──
-- update auth.users
--    set raw_app_meta_data = raw_app_meta_data
--        || jsonb_build_object('oficina_id', '<uuid-da-oficina>')
--  where email = '<email-do-usuario>';
--
-- Depois disso a pessoa precisa sair e entrar de novo: o oficina_id só entra
-- no token quando um token novo é emitido.
