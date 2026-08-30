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
 * A sessão inteira numa chamada só: oficina, nome dela e papel do usuário.
 *
 * A fonte é `minha_sessao()`, que lê a tabela `membros` — a MESMA fonte que
 * `jwt_oficina()` usa nas policies (B9). Ler de outro lugar aqui criaria duas
 * verdades sobre "de quem é este dado", e a que a tela mostra não seria a que
 * o banco aplica.
 *
 * `estado` distingue três coisas que antes viravam a mesma tela em branco:
 * sem sessão (vá para /entrar), sessão sem oficina (a conta existe mas a
 * oficina não terminou de nascer) e ok. Regra 3.
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

export type PapelDoUsuario = "dono" | "escritorio";

export interface Sessao {
  estado: "sem_sessao" | "sem_oficina" | "ok" | "falha";
  oficinaId: string | null;
  oficina: string | null;
  usuarioId: string | null;
  papel: PapelDoUsuario | null;
  erro: string | null;
}

export async function oficinaDaSessao(): Promise<Sessao> {
  const vazia: Sessao = {
    estado: "sem_sessao",
    oficinaId: null,
    oficina: null,
    usuarioId: null,
    papel: null,
    erro: null,
  };
  // Nada aqui pode derrubar a página. Configuração faltando ou rede fora viram
  // um `erro` legível que a tela mostra — e não uma exceção que o usuário lê
  // como "Application error" sem nenhuma pista (regras 1 e 2).
  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    if (ehControleDoNext(e)) throw e;
    return { ...vazia, estado: "falha", erro: e instanceof Error ? e.message : String(e) };
  }

  let data, error;
  try {
    ({ data, error } = await supabase.auth.getUser());
  } catch (e) {
    if (ehControleDoNext(e)) throw e;
    return {
      ...vazia,
      estado: "falha",
      erro: `Não consegui falar com o Supabase: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (error) {
    // Sessão ausente é situação normal, não anomalia: não vira erro na tela.
    const ausente = error.message.toLowerCase().includes("session");
    return ausente ? vazia : { ...vazia, estado: "falha", erro: error.message };
  }
  if (!data.user) return vazia;

  const { data: sessao, error: erroSessao } = await supabase.rpc("minha_sessao");
  if (erroSessao) {
    // Regra 3: não conseguir ler o vínculo é diferente de não ter vínculo. A
    // primeira frase manda recarregar; a segunda manda criar oficina.
    return {
      ...vazia,
      estado: "falha",
      usuarioId: data.user.id,
      erro: `Não consegui ler seu vínculo com a oficina: ${erroSessao.message}`,
    };
  }

  const s = sessao as {
    estado?: string;
    oficina_id?: string;
    oficina?: string;
    papel?: PapelDoUsuario;
  } | null;

  if (s?.estado !== "ok") {
    return { ...vazia, estado: "sem_oficina", usuarioId: data.user.id };
  }
  return {
    estado: "ok",
    oficinaId: s.oficina_id ?? null,
    oficina: s.oficina ?? null,
    usuarioId: data.user.id,
    papel: s.papel ?? "escritorio",
    erro: null,
  };
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
