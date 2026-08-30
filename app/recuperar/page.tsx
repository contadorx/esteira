import type { Metadata } from "next";
import { canalDeSocorro } from "@/lib/contato";
import FormularioRecuperacao from "./formulario";

export const metadata: Metadata = { title: "Esqueci minha senha — Esteira" };

export default async function PaginaRecuperar({
  searchParams,
}: {
  searchParams: Promise<{ falhou?: string }>;
}) {
  // O motivo vem do Route Handler que tentou validar o link. Mostrar aqui, e
  // não numa página de erro própria, mantém a pessoa a um clique de pedir
  // outro link — que é sempre o que ela vai querer fazer.
  const { falhou } = await searchParams;
  return <FormularioRecuperacao suporte={canalDeSocorro()} falhou={falhou ?? null} />;
}
