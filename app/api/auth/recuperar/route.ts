/**
 * A porta onde o link do e-mail de recuperação cai.
 *
 * Precisa ser Route Handler e não página: trocar a sessão significa GRAVAR
 * cookie, e no App Router só Route Handler e Server Action podem gravar
 * cookie. Uma página que tentasse fazer isso falharia em silêncio e a pessoa
 * cairia em /nova-senha deslogada, sem entender por quê.
 *
 * ── Dois formatos, porque o Supabase manda os dois ───────────────────────────
 * Dependendo do modelo de e-mail configurado no projeto, o link chega como
 * `?code=…` (PKCE) ou como `?token_hash=…&type=recovery`. Tratar só um dos
 * dois é escolher um jeito de quebrar em produção sem aviso, então os dois
 * estão aqui.
 *
 * ── O limite, escrito ────────────────────────────────────────────────────────
 * No formato PKCE o verificador fica num cookie do navegador que PEDIU a
 * troca. Quem pede no computador e abre o e-mail no celular não tem esse
 * cookie, e a troca falha — por desenho do protocolo, não por bug. Quando
 * isso acontece a pessoa é mandada de volta com o motivo em português e o
 * conselho certo ("abra o link no mesmo aparelho"), em vez de um erro cru.
 */
import { NextResponse } from "next/server";
import { clienteDoServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function voltar(url: URL, motivo: string) {
  const destino = new URL("/recuperar", url.origin);
  destino.searchParams.set("falhou", motivo);
  return NextResponse.redirect(destino);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type");

  // O Supabase manda o próprio erro na URL quando o link já expirou. Repetir
  // esse motivo é melhor do que tentar trocar e produzir uma segunda mensagem.
  const erroDoProvedor = url.searchParams.get("error_description");
  if (erroDoProvedor) return voltar(url, erroDoProvedor);

  if (!code && !tokenHash) {
    return voltar(url, "o link veio sem o código de confirmação");
  }

  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    return voltar(url, e instanceof Error ? e.message : String(e));
  }

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: (tipo as "recovery") ?? "recovery",
      })
    : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    const expirou = /expired|invalid|not found/i.test(error.message);
    return voltar(
      url,
      expirou
        ? "esse link já foi usado ou passou de 1 hora — peça outro"
        : `não consegui validar o link (${error.message}). Se você abriu o e-mail em outro aparelho, tente abrir no mesmo em que pediu a troca.`,
    );
  }

  return NextResponse.redirect(new URL("/nova-senha", url.origin));
}
