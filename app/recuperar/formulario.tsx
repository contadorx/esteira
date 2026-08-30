"use client";

// Componente no escopo do MÓDULO (regra 6).
import { useActionState } from "react";
import { pedirNovaSenha } from "./acoes";
import { RECUPERACAO_OCIOSA } from "./tipos";

export default function FormularioRecuperacao({
  suporte,
  falhou,
}: {
  suporte: string;
  falhou: string | null;
}) {
  const [resultado, acao, enviando] = useActionState(pedirNovaSenha, RECUPERACAO_OCIOSA);

  return (
    <main className="entrar-palco">
      <form className="entrar-caixa" action={acao}>
        <h1>Esqueci minha senha</h1>
        <p className="ajuda">
          Escreva o e-mail com que você entra. Mandamos um link para você
          escolher uma senha nova.
        </p>

        {/* Quem chegou aqui vindo de um link que não funcionou precisa ler o
            motivo antes do formulário — senão vai pedir outro link e falhar
            do mesmo jeito. */}
        {falhou && resultado.estado === "ociosa" && (
          <p className="alerta" role="alert">
            O link não funcionou: {falhou}.
          </p>
        )}

        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />

        {resultado.estado === "erro" && (
          <p className="alerta" role="alert">
            {resultado.mensagem}
          </p>
        )}

        {/*
          "Saiu agora" é o que se apurou; "chegou" não é (regra 2). Por isso a
          mensagem fala do envio e já diz o que fazer quando ele não chegar —
          em vez de deixar a pessoa recarregando a caixa de entrada.
        */}
        {resultado.estado === "enviado" && (
          <div className="aviso-ok" role="status">
            <b>{resultado.mensagem}</b>
            <p className="obs">
              Se não aparecer em alguns minutos, olhe no spam. O e-mail sai de
              um servidor compartilhado e às vezes cai lá. Continuando sem
              chegar, chame no WhatsApp <b>{suporte}</b> — a gente destrava na
              hora.
            </p>
          </div>
        )}

        <button className="btn btn-aco" type="submit" disabled={enviando}>
          {enviando ? "Enviando…" : "Mandar o link"}
        </button>

        <a className="voltar" href="/entrar">
          ← voltar para o login
        </a>
      </form>
    </main>
  );
}
