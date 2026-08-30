import type { Metadata } from "next";
import FormularioImport from "./formulario";

export const metadata: Metadata = { title: "Importar CSV — Esteira" };

// Esta rota depende da requisição (sessão em cookie), então NUNCA pode ser
// pré-renderizada no build: prerender roda sem as variáveis de ambiente e sem
// cookie, e o build quebrava aqui. Rota de sessão é dinâmica por natureza.
export const dynamic = "force-dynamic";


export default function PaginaImportar() {
  return <FormularioImport />;
}
