import type { Metadata } from "next";
import FormularioOficina from "./formulario";

export const metadata: Metadata = { title: "Terminar o cadastro — Esteira" };
export const dynamic = "force-dynamic";

export default function PaginaOficinaPendente() {
  return (
    <div className="entrar-palco">
      <FormularioOficina />
    </div>
  );
}
