import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { oficinaDaSessao } from "@/lib/supabase/server";
import FormularioEntrada from "./formulario";

export const metadata: Metadata = { title: "Entrar — Esteira" };

export default async function PaginaEntrar() {
  const { oficinaId } = await oficinaDaSessao();
  if (oficinaId) redirect("/app");
  return <FormularioEntrada />;
}
