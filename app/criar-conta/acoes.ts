"use server";

/**
 * Autocadastro (B10) — a oficina nasce sozinha, sem SQL e sem você.
 *
 * ── O problema que este arquivo existe para não criar ─────────
 * Um cadastro tem DUAS metades em sistemas diferentes: o usuário vive no Auth
 * do Supabase, a oficina vive no Postgres. Não existe transação que abrace as
 * duas. Então a pergunta da regra 13 — "e se a segunda metade falhar?" — tem
 * resposta escrita aqui:
 *
 *   1. cria o usuário no Auth;
 *   2. cria oficina + etapas + dono + assinatura de teste em UMA transação
 *      (`criar_oficina`), que ou faz tudo ou não faz nada;
 *   3. se (2) falhar, DESFAZ (1) apagando o usuário recém-criado;
 *   4. se o desfazer também falhar, a pessoa ouve exatamente isso — que a
 *      conta ficou criada sem oficina e o que fazer — em vez de um "erro
 *      inesperado" que a deixa presa num limbo que ela não pode consertar
 *      (regra 14: sucesso parcial tem porta própria).
 *
 * ── Por que o service role ────────────────────────────────────
 * `signUp()` comum exige e-mail confirmado para a sessão valer, e confirmar
 * e-mail exige SMTP configurado. Enquanto isso não existe, o produto não
 * pode ter um cadastro que "funciona" e deixa a pessoa esperando um e-mail
 * que nunca chega. O usuário é criado já confirmado, pelo servidor.
 *
 * O preço disso está escrito: **ninguém prova que o e-mail é seu**. Para este
 * produto o estrago é pequeno — quem se cadastra com e-mail alheio ganha
 * acesso a uma oficina vazia que ele mesmo criou. Verificação de e-mail entra
 * quando houver SMTP, e aí some esta nota.
 */

import { redirect } from "next/navigation";
import { clienteDoServidor, supabaseAdmin, temChaveSecreta } from "@/lib/supabase/server";
import { acharPack, PACKS } from "@/lib/packs";
import type { ResultadoCadastro } from "./tipos";

const MIN_SENHA = 8;

function erro(mensagem: string, campo: string | null = null): ResultadoCadastro {
  return { estado: "erro", mensagem, campo };
}

/** Mensagem do Supabase traduzida no que a pessoa pode fazer a respeito. */
function motivoDoAuth(texto: string): { mensagem: string; campo: string | null } {
  const t = texto.toLowerCase();
  if (t.includes("already registered") || t.includes("already been registered"))
    return {
      mensagem: "Já existe uma conta com esse e-mail. Entre por “Já tenho conta”.",
      campo: "email",
    };
  if (t.includes("password"))
    return { mensagem: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`, campo: "senha" };
  if (t.includes("email"))
    return { mensagem: "Esse e-mail não foi aceito. Confira se está escrito certo.", campo: "email" };
  return { mensagem: `Não consegui criar a conta (${texto}).`, campo: null };
}

export async function criarConta(
  _anterior: ResultadoCadastro,
  form: FormData,
): Promise<ResultadoCadastro> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const oficina = String(form.get("oficina") ?? "").trim();
  const packId = String(form.get("pack") ?? "").trim();

  if (!email || !email.includes("@")) return erro("Informe um e-mail válido.", "email");
  if (senha.length < MIN_SENHA)
    return erro(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`, "senha");
  if (!oficina) return erro("Informe o nome da oficina.", "oficina");

  const pack = acharPack(packId) ?? PACKS[0];

  // A chave secreta não é detalhe de infraestrutura aqui: sem ela o cadastro
  // simplesmente não existe. Dizer isso agora é melhor que falhar no meio.
  if (!temChaveSecreta()) {
    return erro(
      "O cadastro está indisponível: falta a chave de serviço no servidor. " +
        "Nenhuma conta foi criada. Avise o suporte.",
    );
  }

  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return erro(`O cadastro está indisponível (${e instanceof Error ? e.message : String(e)}).`);
  }

  // ── 1) o usuário ────────────────────────────────────────────
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroAuth || !criado?.user) {
    const m = motivoDoAuth(erroAuth?.message ?? "sem detalhe");
    return erro(m.mensagem, m.campo);
  }
  const userId = criado.user.id;

  // ── 2) a oficina, numa transação só ─────────────────────────
  const { error: erroOficina } = await admin.rpc("criar_oficina", {
    p_user: userId,
    p_nome: oficina,
    p_etapas: pack.etapas,
  });

  if (erroOficina) {
    // ── 3) desfazer o que já tinha sido feito ─────────────────
    const { error: erroApagar } = await admin.auth.admin.deleteUser(userId);
    if (erroApagar) {
      // ── 4) nem desfazer deu: a pessoa precisa saber o estado real ──
      return {
        estado: "parcial",
        campo: null,
        mensagem:
          `Sua conta foi criada, mas a oficina não (${erroOficina.message}) — e não ` +
          `consegui desfazer a conta (${erroApagar.message}). Entre com ${email} e ` +
          `a tela vai pedir para terminar o cadastro da oficina.`,
      };
    }
    return erro(
      `Não consegui criar a oficina (${erroOficina.message}). Nada foi salvo — ` +
        `pode tentar de novo.`,
    );
  }

  // ── entrar de verdade, com a sessão em cookie ───────────────
  const supabase = await clienteDoServidor();
  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroLogin) {
    // A conta EXISTE e está certa; só o login automático falhou. Mandar para
    // o /entrar é honesto — e a pessoa não perdeu nada.
    redirect("/entrar?criada=1");
  }

  redirect("/app?bemvindo=1");
}

/**
 * Recuperação: a conta existe, a oficina não. Acontece quando o passo 2 falha
 * e o passo 3 também. Aqui já há sessão, então o `user_id` vem dela — nunca
 * do formulário.
 */
export async function criarOficinaDaSessao(
  _anterior: ResultadoCadastro,
  form: FormData,
): Promise<ResultadoCadastro> {
  const oficina = String(form.get("oficina") ?? "").trim();
  const packId = String(form.get("pack") ?? "").trim();
  if (!oficina) return erro("Informe o nome da oficina.", "oficina");
  const pack = acharPack(packId) ?? PACKS[0];

  const supabase = await clienteDoServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/entrar");

  if (!temChaveSecreta()) {
    return erro("Falta a chave de serviço no servidor. Avise o suporte.");
  }

  const { error: erroOficina } = await supabaseAdmin().rpc("criar_oficina", {
    p_user: data.user.id,
    p_nome: oficina,
    p_etapas: pack.etapas,
  });
  if (erroOficina) return erro(`Não consegui criar a oficina (${erroOficina.message}).`);

  redirect("/app?bemvindo=1");
}
