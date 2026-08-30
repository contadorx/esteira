import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { oficinaDaSessao } from "@/lib/supabase/server";
import FormularioEntrada from "./formulario";

export const metadata: Metadata = { title: "Entrar — Esteira" };

// Esta rota depende da requisição (sessão em cookie), então NUNCA pode ser
// pré-renderizada no build: prerender roda sem cookie e sem variável de
// ambiente. Rota de sessão é dinâmica por natureza.
export const dynamic = "force-dynamic";

export default async function PaginaEntrar() {
  const { oficinaId, erro } = await oficinaDaSessao();

  // Se nem dá para saber se há sessão, mostrar o motivo. A tela de login em
  // branco com "Application error" não diz nada a ninguém — nem a quem tenta
  // entrar, nem a quem vai consertar.
  if (erro) {
    return (
      <main className="entrar-palco">
        <div className="entrar-caixa">
          <h1>Não consegui abrir o login</h1>
          <p className="ajuda">
            O aplicativo subiu, mas não conseguiu falar com o banco de dados.
            Normalmente é configuração de ambiente faltando ou incorreta.
          </p>
          <p className="alerta" role="alert">
            {erro}
          </p>
          <a className="voltar" href="/">
            ← voltar para o site
          </a>
        </div>
      </main>
    );
  }

  if (oficinaId) redirect("/app");
  return <FormularioEntrada />;
}
