import type { Metadata } from "next";
import FormularioCadastro from "./formulario";

export const metadata: Metadata = {
  title: "Criar conta — Esteira",
  description: "14 dias de teste, sem cartão.",
};
// Rota que fala com o Auth: nunca pré-renderizada (o build roda sem ambiente).
export const dynamic = "force-dynamic";

export default function PaginaCriarConta() {
  return (
    <div className="entrar-palco">
      <FormularioCadastro />
    </div>
  );
}
