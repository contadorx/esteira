import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { oficinaDaSessao } from "@/lib/supabase/server";
import FormularioEntrada from "./formulario";

export const metadata: Metadata = { title: "Entrar — Esteira" };

// Esta rota depende da requisição (sessão em cookie), então NUNCA pode ser
// pré-renderizada no build: prerender roda sem as variáveis de ambiente e sem
// cookie, e o build quebrava aqui. Rota de sessão é dinâmica por natureza.
export const dynamic = "force-dynamic";


export default async function PaginaEntrar() {
  const { oficinaId } = await oficinaDaSessao();
  if (oficinaId) redirect("/app");
  return <FormularioEntrada />;
}
