"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import type { TipoMensagem } from "@/lib/mensagem";

export interface ResultadoAviso {
  estado: "ok" | "erro";
  /** Quando a cópia foi registrada. É a única hora que a tela pode exibir. */
  quando: string | null;
  mensagem: string | null;
}

export async function registrarAviso(
  pedidoId: string,
  destino: string | null,
  template: TipoMensagem,
): Promise<ResultadoAviso> {
  const { oficinaId } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  const supabase = await clienteDoServidor();

  const { data, error } = await supabase.rpc("registrar_aviso_copiado", {
    p_pedido: pedidoId,
    p_destino: destino,
    p_template: template,
  });

  if (error) {
    return { estado: "erro", quando: null, mensagem: `Não consegui registrar: ${error.message}` };
  }
  if (data?.estado !== "ok") {
    return { estado: "erro", quando: null, mensagem: "Pedido não encontrado." };
  }

  revalidatePath("/app/pedidos");
  return { estado: "ok", quando: data.quando as string, mensagem: null };
}
