"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { criarPedido } from "../acoes";
import { CRIAR_OCIOSO } from "../tipos";

interface Etapa {
  id: string;
  nome: string;
  ordem: number;
  tipo_pedido: string;
}

function rotuloTipo(tipo: string): string {
  const t = tipo.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function FormularioPedido({ etapas }: { etapas: Etapa[] }) {
  const [resultado, acao, enviando] = useActionState(criarPedido, CRIAR_OCIOSO);

  const tipos = useMemo(
    () => [...new Set(etapas.map((e) => e.tipo_pedido))].sort(),
    [etapas],
  );
  const [tipo, setTipo] = useState(tipos[0] ?? "padrao");

  // As etapas oferecidas seguem o tipo escolhido: um pedido nunca começa numa
  // etapa que não é do caminho dele.
  const doTipo = etapas.filter((e) => e.tipo_pedido === tipo);
  const erroEm = (campo: string) =>
    resultado.estado === "erro" && resultado.campo === campo;

  return (
    <div className="wrap-app estreito">
      <h1>Novo pedido</h1>
      <p className="ajuda">
        O mínimo para o pedido existir. Cadastro, preço e estoque ficam no seu
        sistema — a Esteira só acompanha a produção.
      </p>

      <form className="form" action={acao}>
        <div className="dupla">
          <div className="campo">
            <label htmlFor="numero">Número do pedido *</label>
            <input
              id="numero"
              name="numero"
              required
              aria-invalid={erroEm("numero")}
              placeholder="1058"
            />
          </div>

          <div className="campo">
            <label htmlFor="cliente_nome">Cliente *</label>
            <input
              id="cliente_nome"
              name="cliente_nome"
              required
              aria-invalid={erroEm("cliente_nome")}
              placeholder="Marli Nogueira"
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="descricao">Descrição</label>
          <input
            id="descricao"
            name="descricao"
            placeholder="Bancada 2,40 × 0,60 São Gabriel"
          />
        </div>

        <div className="dupla">
          <div className="campo">
            <label htmlFor="cliente_fone">WhatsApp do cliente</label>
            <input
              id="cliente_fone"
              name="cliente_fone"
              inputMode="tel"
              aria-invalid={erroEm("cliente_fone")}
              placeholder="(11) 99999-0000"
            />
          </div>

          <div className="campo">
            <label htmlFor="prazo">Prazo de entrega</label>
            <input
              id="prazo"
              name="prazo"
              aria-invalid={erroEm("prazo")}
              placeholder="dd/mm/aaaa"
            />
          </div>
        </div>

        <div className="dupla">
          {tipos.length > 1 && (
            <div className="campo">
              <label htmlFor="tipo_pedido">Tipo de pedido</label>
              <select
                id="tipo_pedido"
                name="tipo_pedido"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {rotuloTipo(t)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {tipos.length === 1 && <input type="hidden" name="tipo_pedido" value={tipo} />}

          <div className="campo">
            <label htmlFor="etapa_id">Etapa inicial</label>
            <select id="etapa_id" name="etapa_id" key={tipo} defaultValue={doTipo[0]?.id ?? ""}>
              {doTipo.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {resultado.estado === "erro" && (
          <p className="alerta" role="alert">
            {resultado.mensagem}
          </p>
        )}

        <div className="form-acoes">
          <button className="btn btn-aco" type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Cadastrar pedido"}
          </button>
          <a className="btn btn-borda" href="/app">
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}
