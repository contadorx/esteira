/**
 * Cliente Supabase de SERVIDOR (service role). Só pode ser importado por
 * código que roda no servidor (server actions, route handlers). A chave
 * secreta NUNCA chega ao navegador.
 *
 * Regra 1 do 05: supabase-js NÃO lança exceção — devolve { data, error }.
 * TODA chamada lê `error`. Sem exceção a esta regra, nunca.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY no ambiente.",
    );
  }
  if (!cliente) {
    cliente = createClient(url, secreta, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
