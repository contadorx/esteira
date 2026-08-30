import type { Metadata } from "next";
import { clienteDoServidor } from "@/lib/supabase/server";
import FormularioPedido from "./formulario";

export const metadata: Metadata = { title: "Novo pedido — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaNovoPedido() {
  const supabase = await clienteDoServidor();
  const { data, error } = await supabase
    .from("etapas")
    .select("id, nome, ordem, tipo_pedido")
    .order("ordem", { ascending: true });

  if (error) {
    return (
      <div className="wrap-app estreito">
        <h1>Novo pedido</h1>
        <div className="falha" role="alert">
          <b>Não consegui carregar as etapas desta oficina.</b>
          <p>{error.message}</p>
          <p className="obs">
            Sem as etapas, cadastrar agora colocaria o pedido em lugar nenhum —
            por isso o formulário não aparece.
          </p>
        </div>
      </div>
    );
  }

  return <FormularioPedido etapas={data ?? []} />;
}
