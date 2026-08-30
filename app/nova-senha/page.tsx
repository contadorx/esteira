import type { Metadata } from "next";
import { clienteDoServidor } from "@/lib/supabase/server";
import { canalDeSocorro } from "@/lib/contato";
import FormularioNovaSenha from "./formulario";

export const metadata: Metadata = { title: "Senha nova — Esteira" };

// Rota de sessão: nunca pré-renderizada.
export const dynamic = "force-dynamic";

export default async function PaginaNovaSenha() {
  let email: string | null = null;
  let erro: string | null = null;

  try {
    const supabase = await clienteDoServidor();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Regra 3: "não consegui perguntar" e "não tem sessão" são coisas
      // diferentes, e só a segunda significa que o link não vale mais.
      const ausente = /session|missing/i.test(error.message);
      erro = ausente
        ? "Esta tela precisa do link do e-mail. Peça um link novo e abra por ele."
        : `Não consegui conferir o link: ${error.message}`;
    } else if (!data.user) {
      erro = "Esta tela precisa do link do e-mail. Peça um link novo e abra por ele.";
    } else {
      email = data.user.email ?? null;
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  if (erro) {
    return (
      <main className="entrar-palco">
        <div className="entrar-caixa">
          <h1>Não consegui abrir a troca de senha</h1>
          <p className="alerta" role="alert">
            {erro}
          </p>
          <p className="ajuda">
            Se o link continuar sem funcionar, chame no {canalDeSocorro()}.
          </p>
          <a className="btn btn-aco" href="/recuperar">
            Pedir outro link
          </a>
          <a className="voltar" href="/entrar">
            ← voltar para o login
          </a>
        </div>
      </main>
    );
  }

  return <FormularioNovaSenha email={email} />;
}
