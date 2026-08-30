"use client";

/**
 * Fronteira de erro do aplicativo.
 *
 * Sem isto, uma exceção no servidor vira a tela branca da Vercel com um
 * "digest" e nada mais — que é exatamente o tipo de estado mudo que este
 * projeto combate. Aqui a pessoa vê o que dá para dizer, e quem for consertar
 * vê o digest para achar a linha no log.
 */

import { useEffect } from "react";

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vai para o log do servidor com o digest junto — é o que liga esta tela
    // à linha certa do log da Vercel.
    console.error("[esteira] erro não tratado", error.digest, error.message);
  }, [error]);

  return (
    <main className="entrar-palco">
      <div className="entrar-caixa">
        <h1>Deu erro aqui</h1>
        <p className="ajuda">
          Alguma coisa quebrou do lado do servidor. Não é você — e o pedido que
          você estava vendo não foi alterado.
        </p>
        {error.digest && (
          <p className="alerta">
            Código para o suporte: <b>{error.digest}</b>
          </p>
        )}
        <button className="btn btn-aco" onClick={reset} style={{ marginTop: 16 }}>
          Tentar de novo
        </button>
        <a className="voltar" href="/">
          ← voltar para o site
        </a>
      </div>
    </main>
  );
}
