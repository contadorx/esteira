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

type CookieParaGravar = { name: string; value: string; options?: CookieOptions };

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicavel = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicavel) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return { url, publicavel };
}

export async function clienteDoServidor() {
  const { url, publicavel } = ambiente();
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
export async function oficinaDaSessao(): Promise<{
  oficinaId: string | null;
  usuarioId: string | null;
  erro: string | null;
}> {
  const supabase = await clienteDoServidor();
  const { data, error } = await supabase.auth.getUser();
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
  const { url, publicavel } = ambiente();
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

let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) {
    throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY.");
  }
  if (!admin) {
    admin = createClient(url, secreta, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
