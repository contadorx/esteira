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
import { lerAmbiente } from "@/lib/ambiente";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { ambiente: amb, motivo } = lerAmbiente();
  const url = amb?.url ?? null;
  const chave = amb?.publicavel ?? null;
  const secreta = process.env.SUPABASE_SECRET_KEY ?? null;

  const ambiente = {
    url: url ? "presente" : "FALTANDO",
    chavePublica: chave ? "presente" : "FALTANDO",
    motivo,
    SUPABASE_SECRET_KEY: secreta ? "presente" : "faltando (só a foto depende)",
    host: url ? safeHost(url) : null,
    formatoDaChave: chave ? `${chave.slice(0, 12)}… (${chave.length} caracteres)` : null,
    urlTemEspacoOuAspas: url ? /[\s"']/.test(url) : null,
    chaveTemEspacoOuAspas: chave ? /[\s"']/.test(chave) : null,
    // O que REALMENTE chegou ao processo — é isto que denuncia nome errado.
    nomesComSupabase: Object.keys(process.env).filter((k) => /SUPABASE/i.test(k)).sort(),
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
