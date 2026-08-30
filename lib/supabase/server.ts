/**
 * Clientes Supabase do servidor.
 *
 * Regra 1 do 05: supabase-js NÃO lança exceção — devolve { data, error }.
 * TODA chamada lê `error`. Sem exceção a esta regra, nunca.
 *
 * Dois clientes, propósitos diferentes:
 * - clienteDoServidor(): sessão do usuário por cookie. RESPEITA a RLS. É o
 *   padrão — tudo do escritório passa por aqui, e é o que prova a policy
 *   usando o app com usuário de verdade (regra 11).
 * - supabaseAdmin(): service role, ATRAVESSA a RLS. Só onde for inevitável
 *   (rotas públicas por token, que ainda não existem). Nunca no navegador.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { exigirAmbiente, lerAmbiente } from "@/lib/ambiente";

type CookieParaGravar = { name: string; value: string; options?: CookieOptions };

export async function clienteDoServidor() {
  const { url, publicavel } = exigirAmbiente();
  const cookieStore = await cookies();
  return createServerClient(url, publicavel, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(paraGravar: CookieParaGravar[]) {
        try {
          for (const { name, value, options } of paraGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode gravar cookie: o middleware renova a sessão.
        }
      },
    },
  });
}

/**
 * A oficina do usuário logado, lida do app_metadata (controlado pelo servidor;
 * o usuário não edita). É o mesmo valor que `jwt_oficina()` lê nas policies.
 * Devolve null quando não há sessão — quem chama decide o que fazer.
 */
/**
 * `redirect()` e a saída para renderização dinâmica do Next são implementados
 * como EXCEÇÕES. Um try/catch descuidado os engole e quebra o roteamento sem
 * dar um pio — então tudo que carrega um digest "NEXT_*" ou "DYNAMIC_*" volta
 * a ser lançado.
 */
function ehControleDoNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && /^(NEXT_|DYNAMIC_SERVER_USAGE)/.test(digest);
}

export async function oficinaDaSessao(): Promise<{
  oficinaId: string | null;
  usuarioId: string | null;
  erro: string | null;
}> {
  // Nada aqui pode derrubar a página. Configuração faltando ou rede fora viram
  // um `erro` legível que a tela mostra — e não uma exceção que o usuário lê
  // como "Application error" sem nenhuma pista (regras 1 e 2).
  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    if (ehControleDoNext(e)) throw e;
    return {
      oficinaId: null,
      usuarioId: null,
      erro: e instanceof Error ? e.message : String(e),
    };
  }

  let data, error;
  try {
    ({ data, error } = await supabase.auth.getUser());
  } catch (e) {
    if (ehControleDoNext(e)) throw e;
    return {
      oficinaId: null,
      usuarioId: null,
      erro: `Não consegui falar com o Supabase: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (error) {
    // Sessão ausente é situação normal, não anomalia: não vira erro na tela.
    const ausente = error.message.toLowerCase().includes("session");
    return { oficinaId: null, usuarioId: null, erro: ausente ? null : error.message };
  }
  const usuario = data.user;
  if (!usuario) return { oficinaId: null, usuarioId: null, erro: null };
  const oficinaId = (usuario.app_metadata?.oficina_id as string | undefined) ?? null;
  return { oficinaId, usuarioId: usuario.id, erro: null };
}

/**
 * Cliente ANÔNIMO, sem cookie e sem sessão. É o que as rotas por token usam
 * (`/c/<token>`, `/p/<token>`): `anon` não enxerga tabela nenhuma, só executa
 * as funções `security definer` que validam o token por dentro (regra 11).
 */
let anonimo: SupabaseClient | null = null;

export function clienteAnonimo(): SupabaseClient {
  const { url, publicavel } = exigirAmbiente();
  if (!anonimo) {
    anonimo = createClient(url, publicavel, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonimo;
}

/** Há chave secreta configurada? Quem depende dela precisa saber ANTES. */
export function temChaveSecreta(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}

/** Reexportado para as telas de diagnóstico não duplicarem a lista de nomes. */
export { lerAmbiente };

let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  const { url } = exigirAmbiente();
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!secreta) {
    throw new Error("Falta SUPABASE_SECRET_KEY (só o upload de foto depende dela).");
  }
  if (!admin) {
    admin = createClient(url, secreta, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
