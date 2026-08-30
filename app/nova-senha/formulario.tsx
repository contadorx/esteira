"use client";

// Componente no escopo do MÓDULO (regra 6).
import { useActionState } from "react";
import { trocarSenha } from "./acoes";
import { MIN_SENHA, NOVA_SENHA_OCIOSA } from "./tipos";

export default function FormularioNovaSenha({ email }: { email: string | null }) {
  const [resultado, acao, enviando] = useActionState(trocarSenha, NOVA_SENHA_OCIOSA);

  return (
    <main className="entrar-palco">
      <form className="entrar-caixa" action={acao}>
        <h1>Escolha uma senha nova</h1>
        {/* Dizer de QUAL conta é a senha evita o erro mais comum de quem tem
            dois e-mails: trocar a senha da conta errada e continuar sem entrar. */}
        <p className="ajuda">
          {email ? (
            <>
              Você está trocando a senha de <b>{email}</b>.
            </>
          ) : (
            "Link confirmado. Escreva a senha nova duas vezes."
          )}
        </p>

        <label htmlFor="senha">Senha nova</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="new-password"
          minLength={MIN_SENHA}
          required
        />

        <label htmlFor="repetida">Repita a senha</label>
        <input
          id="repetida"
          name="repetida"
          type="password"
          autoComplete="new-password"
          minLength={MIN_SENHA}
          required
        />

        {resultado.estado === "erro" && (
          <p className="alerta" role="alert">
            {resultado.mensagem}
          </p>
        )}

        <button className="btn btn-aco" type="submit" disabled={enviando}>
          {enviando ? "Trocando…" : "Trocar a senha e entrar"}
        </button>
      </form>
    </main>
  );
}
