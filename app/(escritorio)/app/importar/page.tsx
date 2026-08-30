import type { Metadata } from "next";
import FormularioImport from "./formulario";

export const metadata: Metadata = { title: "Importar CSV — Esteira" };

export default function PaginaImportar() {
  return <FormularioImport />;
}
