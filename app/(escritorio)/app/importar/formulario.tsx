"use client";

import { useActionState } from "react";
import { importarCsv } from "../acoes";
import { IMPORT_OCIOSO } from "../tipos";
import type { LinhaRejeitada } from "../tipos";

const EXEMPLO = `numero;cliente_nome;cliente_fone;descricao;prazo;etapa
1058;Marli Nogueira;(11) 99999-0000;Bancada 2,40 m;05/09/2026;Corte
1059;Padaria Estrela;;Balcão 3,10 m quartzo;12/09/2026;`;

/**
 * Agrupa os motivos, tirando o valor específico entre aspas curvas para que
 * "prazo X inválido" e "prazo Y inválido" contem como o mesmo problema.
 * Ordena do mais frequente para o menos.
 */
function agruparMotivos(rejeitados: LinhaRejeitada[]): [string, number][] {
  const contagem = new Map<string, number>();
  for (const r of rejeitados) {
    const chave = r.motivo.replace(/“[^”]*”/g, "…");
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

export default function FormularioImport() {
  const [r, acao, enviando] = useActionState(importarCsv, IMPORT_OCIOSO);

  return (
    <div className="wrap-app estreito">
      <h1>Importar CSV</h1>
      <p className="ajuda">
        Exporte a sua planilha como CSV. Aceito ponto-e-vírgula ou vírgula, e
        data em <b>dd/mm/aaaa</b> ou <b>aaaa-mm-dd</b>.
      </p>

      <details className="formato">
        <summary>Colunas que eu leio</summary>
        <p>
          Obrigatórias: <code>numero</code> e <code>cliente_nome</code>. Opcionais:{" "}
          <code>cliente_fone</code>, <code>descricao</code>, <code>prazo</code>,{" "}
          <code>etapa</code> (o nome exato da etapa; em branco entra na primeira) e{" "}
          <code>tipo</code> (o tipo de pedido; em branco usa o padrão).
        </p>
        <pre>{EXEMPLO}</pre>
      </details>

      <form className="form" action={acao}>
        <div className="campo">
          <label htmlFor="arquivo">Arquivo .csv</label>
          <input id="arquivo" name="arquivo" type="file" accept=".csv,text/csv" required />
        </div>
        <div className="form-acoes">
          <button className="btn btn-aco" type="submit" disabled={enviando}>
            {enviando ? "Importando…" : "Importar"}
          </button>
          <a className="btn btn-borda" href="/app">
            Voltar
          </a>
        </div>
      </form>

      {/* Regra 14: "não deu" e "deu pela metade" saem por portas diferentes. */}
      {r.estado === "recusado" && (
        <div className="falha" role="alert">
          <b>Não importei nada.</b>
          <p>{r.erroGeral}</p>
        </div>
      )}

      {r.estado === "pronto" && (
        <div className="relatorio">
          <div className="relatorio-cab">
            <span className="placar ok">
              <b>{r.inseridos}</b> entraram
            </span>
            <span className={`placar ${r.rejeitados.length > 0 ? "mal" : "neutro"}`}>
              <b>{r.rejeitados.length}</b> ficaram de fora
            </span>
            <span className="placar neutro">
              <b>{r.totalLidas}</b> linhas lidas
            </span>
          </div>

          {r.rejeitados.length > 0 ? (
            <>
              {/* 60 linhas recusadas pelo mesmo motivo viram uma parede
                  ilegível. O agrupado diz o que houve; a tabela abaixo diz
                  onde. */}
              <ul className="resumo-motivos">
                {agruparMotivos(r.rejeitados).map(([motivo, quantas]) => (
                  <li key={motivo}>
                    <b>{quantas}</b> {quantas === 1 ? "linha" : "linhas"}: {motivo}
                  </li>
                ))}
              </ul>
              <p className="ajuda">
                Corrija estas linhas na planilha e importe de novo — as que
                entraram não voltam a entrar (o número do pedido é único).
              </p>
              <div className="tabela-rolo">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Nº</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rejeitados.map((x) => (
                      <tr key={`${x.linha}-${x.numero}`}>
                        <td className="mono">{x.linha}</td>
                        <td className="mono">{x.numero}</td>
                        <td>{x.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="ajuda">Todas as linhas entraram.</p>
          )}

          <a className="btn btn-aco" href="/app/pedidos">
            Ver os pedidos
          </a>
        </div>
      )}
    </div>
  );
}
