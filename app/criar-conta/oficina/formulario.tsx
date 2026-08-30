"use client";

/**
 * A tela do meio-do-caminho: a conta existe, a oficina não.
 *
 * Ela só aparece quando o cadastro falhou entre as duas metades (ver o
 * cabeçalho de `app/criar-conta/acoes.ts`). É rara de propósito — e existe
 * porque a alternativa era deixar a pessoa presa num login que entra e não
 * mostra nada.
 */

import { useActionState, useState } from "react";
import { PACKS } from "@/lib/packs";
import { criarOficinaDaSessao } from "../acoes";
import { CADASTRO_OCIOSO } from "../tipos";

export default function FormularioOficina() {
  const [resultado, acao, enviando] = useActionState(criarOficinaDaSessao, CADASTRO_OCIOSO);
  const [pack, setPack] = useState(PACKS[0].id);
  const escolhido = PACKS.find((p) => p.id === pack) ?? PACKS[0];

  return (
    <form className="entrar-caixa cadastro" action={acao}>
      <h1>Falta só a oficina</h1>
      <p className="ajuda">
        Sua conta está criada, mas ela ainda não tem uma oficina. É o último
        passo — depois dele o quadro abre.
      </p>

      <div className="campo">
        <label htmlFor="oficina">Nome da oficina *</label>
        <input
          id="oficina"
          name="oficina"
          required
          aria-invalid={resultado.estado === "erro" && resultado.campo === "oficina"}
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
        <p className="cadastro-etapas">
          {escolhido.etapas.map((e, i) => (
            <span key={e}>
              {i > 0 && <b aria-hidden="true"> › </b>}
              {e}
            </span>
          ))}
        </p>
      </div>

      {resultado.estado !== "ocioso" && resultado.mensagem && (
        <p className="alerta" role="alert">
          {resultado.mensagem}
        </p>
      )}

      <button className="btn btn-aco cheia" type="submit" disabled={enviando}>
        {enviando ? "Criando…" : "Criar oficina"}
      </button>
    </form>
  );
}
