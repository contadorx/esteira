"use client";

import { useActionState, useState } from "react";
import { PACKS } from "@/lib/packs";
import { criarConta } from "./acoes";
import { CADASTRO_OCIOSO } from "./tipos";

export default function FormularioCadastro() {
  const [resultado, acao, enviando] = useActionState(criarConta, CADASTRO_OCIOSO);
  const [pack, setPack] = useState(PACKS[0].id);
  const escolhido = PACKS.find((p) => p.id === pack) ?? PACKS[0];
  const erroEm = (campo: string) =>
    resultado.estado === "erro" && resultado.campo === campo;

  return (
    <form className="entrar-caixa cadastro" action={acao}>
      <h1>Criar conta</h1>
      <p className="ajuda">
        14 dias para testar, sem cartão. Você já sai com as etapas do seu setor
        configuradas — e pode mudar todas depois.
      </p>

      <div className="campo">
        <label htmlFor="oficina">Nome da oficina *</label>
        <input
          id="oficina"
          name="oficina"
          required
          autoComplete="organization"
          aria-invalid={erroEm("oficina")}
          placeholder="Marmoraria São Jorge"
        />
      </div>

      <div className="campo">
        <label htmlFor="pack">Seu setor</label>
        <select id="pack" name="pack" value={pack} onChange={(e) => setPack(e.target.value)}>
          {PACKS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.setor}
            </option>
          ))}
        </select>
        {/*
          Mostrar as etapas ANTES de criar é o que evita a primeira frustração:
          a pessoa vê o caminho que vai receber, e já sabe que ele é editável.
          Prometer "configuramos para você" e entregar outra coisa custa a
          confiança inteira no primeiro minuto.
        */}
        <p className="cadastro-etapas">
          {escolhido.etapas.map((e, i) => (
            <span key={e}>
              {i > 0 && <b aria-hidden="true"> › </b>}
              {e}
            </span>
          ))}
        </p>
        <p className="obs">
          É um ponto de partida, escrito de fora da sua oficina. Renomeie,
          reordene e apague o que não for seu — leva um minuto.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="email">Seu e-mail *</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={erroEm("email")}
        />
      </div>

      <div className="campo">
        <label htmlFor="senha">Senha *</label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-invalid={erroEm("senha")}
        />
        <p className="obs">Pelo menos 8 caracteres.</p>
      </div>

      {resultado.estado === "erro" && (
        <p className="alerta" role="alert">
          {resultado.mensagem}
        </p>
      )}
      {/* Sucesso parcial tem porta própria: cor e texto diferentes do erro. */}
      {resultado.estado === "parcial" && (
        <p className="aviso-parcial" role="alert">
          {resultado.mensagem}
        </p>
      )}

      <button className="btn btn-aco cheia" type="submit" disabled={enviando}>
        {enviando ? "Criando…" : "Criar conta e começar o teste"}
      </button>

      <p className="entrar-link">
        Já tem conta? <a href="/entrar">Entrar</a>
      </p>
    </form>
  );
}
