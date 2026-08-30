"use client";

import { useState } from "react";
import { curtaBR, diasAteOPrazo, situacaoDoPrazo } from "@/lib/datas";
import PainelAviso, { type DadosAviso } from "../aviso";
import type { LinhaPedido } from "./tipos";

const ROTULO = { ok: "no prazo", aperta: "aperta", estourou: "venceu" } as const;

export default function ListaPedidos({
  pedidos,
  oficina,
  base,
  novo,
  mostrarTipo,
}: {
  pedidos: LinhaPedido[];
  oficina: string | null;
  base: string;
  novo: string | null;
  mostrarTipo: boolean;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const total = pedidos.length;
  const vencidos = pedidos.filter(
    (p) => p.prazo && situacaoDoPrazo(p.prazo) === "estourou",
  ).length;
  const apertando = pedidos.filter(
    (p) => p.prazo && situacaoDoPrazo(p.prazo) === "aperta",
  ).length;

  const dadosDe = (p: LinhaPedido): DadosAviso => ({
    pedidoId: p.id,
    numero: p.numero,
    cliente: p.clientePrimeiroNome,
    fone: p.fone,
    descricao: p.descricao,
    etapaAtual: p.etapaNome ?? "—",
    previsao: p.prazo,
    tokenPublico: p.tokenPublico,
    oficina: oficina ?? "sua oficina",
    base,
    ultima: p.naUltimaEtapa ? "pedido_pronto" : "pedido_avancou",
  });

  const colunas = mostrarTipo ? 8 : 7;

  return (
    <div className="wrap-app">
      {novo && (
        <p className="ok-faixa" role="status">
          Pedido <b>#{novo}</b> cadastrado.
        </p>
      )}

      <div className="app-cab">
        <div>
          <h1>Pedidos</h1>
          <p className="ajuda">
            Todos os pedidos em uma tabela. Para trabalhar o dia, o{" "}
            <a href="/app">quadro</a> é melhor.
          </p>
        </div>
        <div className="app-acoes">
          <a className="btn btn-aco" href="/app/novo">
            Novo pedido
          </a>
          <a className="btn btn-borda" href="/app/importar">
            Importar CSV
          </a>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="r">Pedidos</div>
          <div className="v">{total}</div>
        </div>
        <div className="kpi risco">
          <div className="r">Aperta o prazo</div>
          <div className="v">{apertando}</div>
        </div>
        <div className="kpi mal">
          <div className="r">Venceu</div>
          <div className="v">{vencidos}</div>
        </div>
      </div>

      {total === 0 ? (
        <p className="vazio">
          Nenhum pedido ainda. Comece cadastrando um ou importando o CSV da sua
          planilha.
        </p>
      ) : (
        <div className="tabela-rolo">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Descrição</th>
                {mostrarTipo && <th>Tipo</th>}
                <th>Etapa</th>
                <th>Prazo</th>
                <th>Origem</th>
                <th>Cliente final</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const situacao = p.prazo ? situacaoDoPrazo(p.prazo) : null;
                const dias = p.prazo ? diasAteOPrazo(p.prazo) : null;
                const aberto = abertoId === p.id;
                return [
                  <tr key={p.id}>
                    <td className="mono">
                      <a className="link-pedido" href={`/app/pedido/${p.id}`}>
                        {p.numero}
                      </a>
                    </td>
                    <td>{p.clienteNome}</td>
                    <td className="desc">{p.descricao ?? "—"}</td>
                    {mostrarTipo && (
                      <td className="origem">{p.tipo.replace(/_/g, " ")}</td>
                    )}
                    <td>{p.etapaNome ?? "—"}</td>
                    <td>
                      {p.prazo && situacao ? (
                        <span className={`pill ${situacao}`}>
                          {ROTULO[situacao]} · {curtaBR(p.prazo)}
                          {dias !== null && dias < 0 ? ` (${Math.abs(dias)}d)` : ""}
                        </span>
                      ) : (
                        <span className="sem-prazo">sem prazo</span>
                      )}
                    </td>
                    <td className="origem">{p.origem}</td>
                    <td className="col-avisar">
                      <button
                        className="mini-btn"
                        onClick={() => setAbertoId(aberto ? null : p.id)}
                        aria-expanded={aberto}
                      >
                        {aberto ? "fechar" : "avisar"}
                      </button>
                      <a
                        className="mini-btn"
                        href={`${base}/p/${p.tokenPublico}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver a página que o cliente enxerga"
                      >
                        ver página
                      </a>
                    </td>
                  </tr>,
                  aberto ? (
                    <tr key={`${p.id}-aviso`} className="linha-aviso">
                      <td colSpan={colunas}>
                        <PainelAviso dados={dadosDe(p)} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
