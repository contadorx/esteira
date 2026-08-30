import type { Metadata } from "next";
import { headers } from "next/headers";
import { clienteDoServidor } from "@/lib/supabase/server";
import ListaAcessos from "./lista";

export const metadata: Metadata = { title: "Acessos do chão — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaAcessos() {
  const supabase = await clienteDoServidor();
  const [resAcessos, resEtapas] = await Promise.all([
    supabase
      .from("acessos")
      .select("id, nome, etapa_id, token, pin, ativo")
      .order("criado_em", { ascending: true }),
    supabase.from("etapas").select("id, nome, ordem, tipo_pedido").order("ordem"),
  ]);

  if (resAcessos.error || resEtapas.error) {
    const msg = (resAcessos.error ?? resEtapas.error)!.message;
    return (
      <div className="wrap-app estreito">
        <h1>Acessos do chão</h1>
        <div className="falha" role="alert">
          <b>Não consegui carregar os acessos.</b>
          <p>{msg}</p>
        </div>
      </div>
    );
  }

  // A base do link vem do host da requisição: em produção sai
  // esteira.app.br, em teste sai localhost. Nada de URL chumbada.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "esteira.app.br";
  const protocolo = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";

  return (
    <ListaAcessos
      acessos={resAcessos.data ?? []}
      etapas={resEtapas.data ?? []}
      base={`${protocolo}://${host}`}
    />
  );
}
