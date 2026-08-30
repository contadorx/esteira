"use server";

import { redirect } from "next/navigation";
import { clienteDoServidor } from "@/lib/supabase/server";

/**
 * Sair, a partir da área de negócio.
 *
 * É a mesma ação do escritório, e existe aqui só porque um `"use server"` não
 * pode ser importado através de um layout de outro grupo de rotas sem arrastar
 * junto o resto daquele arquivo. Se um dia aparecer uma terceira, ela sobe
 * para `lib/` (regra 12).
 */
export async function sair() {
  const supabase = await clienteDoServidor();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Não consegui encerrar a sessão: ${error.message}`);
  redirect("/entrar");
}
