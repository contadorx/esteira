"use client";

/**
 * Componente no escopo do MÓDULO, não dentro de outro render (regra 6):
 * declarar isto dentro de PaginaEntrar remontaria o <input> a cada tecla.
 */
import { useActionState } from "react";
import { entrar } from "./acoes";
import { ENTRADA_OCIOSA } from "./tipos";

export default function FormularioEntrada() {
  const [resultado, acao, enviando] = useActionState(entrar, ENTRADA_OCIOSA);

  return (
    <main className="entrar-palco">
      <form className="entrar-caixa" action={acao}>
        <div className="marca marca-escura">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="#1D3A5F" />
            <path d="M12 40h40" stroke="#EA5A0B" strokeWidth="6" strokeLinecap="round" />
            <circle cx="20" cy="48" r="4" fill="#fff" />
            <circle cx="32" cy="48" r="4" fill="#fff" />
            <circle cx="44" cy="48" r="4" fill="#fff" />
            <rect x="24" y="18" width="18" height="14" rx="2" fill="#fff" />
          </svg>
          <span className="n">Esteira</span>
        </div>

        <h1>Entrar</h1>
        <p className="ajuda">O acesso do escritório. Quem produz não precisa de senha.</p>

        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />

        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />

        {resultado.estado === "erro" && (
          <p className="alerta" role="alert">
            {resultado.mensagem}
          </p>
        )}

        <button className="btn btn-aco" type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        {/* Fica DEPOIS do botão e antes do rodapé: quem errou a senha olha
            exatamente para cá. Antes desta linha, quem esquecia a senha não
            tinha caminho nenhum — a oficina seguia rodando e o escritório
            ficava trancado do lado de fora. */}
        <a className="esqueci" href="/recuperar">
          Esqueci minha senha
        </a>

        <a className="voltar" href="/">
          ← voltar para o site
        </a>
      </form>
    </main>
  );
}
