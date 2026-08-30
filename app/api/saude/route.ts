/**
 * /api/saude — diagnóstico de ambiente e conectividade.
 *
 * Existe porque "Application error: a server-side exception has occurred" não
 * diz nada a ninguém. Esta rota responde as duas perguntas que separam os
 * casos: as variáveis chegaram à execução? e o Supabase responde com esta
 * chave?
 *
 * NÃO devolve valor de segredo nenhum — só booleanos, o host do projeto (que
 * já vai no pacote do navegador) e os 12 primeiros caracteres da chave
 * publicável, o suficiente para reconhecer o formato sem expor a chave.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null;
  const secreta = process.env.SUPABASE_SECRET_KEY ?? null;

  const ambiente = {
    NEXT_PUBLIC_SUPABASE_URL: url ? "presente" : "FALTANDO",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: chave ? "presente" : "FALTANDO",
    SUPABASE_SECRET_KEY: secreta ? "presente" : "faltando (só a foto depende)",
    host: url ? safeHost(url) : null,
    formatoDaChave: chave ? `${chave.slice(0, 12)}… (${chave.length} caracteres)` : null,
    urlTemEspacoOuAspas: url ? /[\s"']/.test(url) : null,
    chaveTemEspacoOuAspas: chave ? /[\s"']/.test(chave) : null,
  };

  // Ping real: é isto que separa "configuração faltando" de "chave recusada".
  let supabase: Record<string, unknown> = { tentado: false };
  if (url && chave) {
    try {
      const r = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
        headers: { apikey: chave, Authorization: `Bearer ${chave}` },
        cache: "no-store",
      });
      supabase = {
        tentado: true,
        status: r.status,
        ok: r.ok,
        corpo: (await r.text()).slice(0, 200),
      };
    } catch (e) {
      supabase = {
        tentado: true,
        falhou: true,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return Response.json({ ambiente, supabase }, { status: 200 });
}

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return `URL INVÁLIDA: ${u.slice(0, 40)}`;
  }
}
