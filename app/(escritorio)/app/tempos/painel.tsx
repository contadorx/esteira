/**
 * Tempos e previsão (B8, fase 2) — "nesta oficina, polimento leva 1,8 dia".
 *
 * A tela existe para trocar o prazo digitado no chute pelo que a oficina
 * realmente faz. Três honestidades governam cada pedaço dela:
 *
 *  1. O QUE NÃO SE SABE APARECE. Etapa com amostra curta diz "ainda não sei"
 *     e quantos pedidos faltam — não mostra zero, não some da lista (regra 3).
 *  2. ZERO ATRASO E NENHUMA PREVISÃO SÃO COISAS DIFERENTES. Enquanto não há
 *     previsão nenhuma, o número de "atrasa pela conta" é um traço, não um 0
 *     verde — 0 ali seria a tela afirmando o que não apurou (regra 2).
 *  3. O VIÉS DA CONTA FICA À VISTA. A mediana só enxerga quem já SAIU da
 *     etapa; quem está preso nela agora não entra, e são justamente os
 *     lentos. Por isso `na fila` e `mais antigo` ficam na mesma linha da
 *     mediana, e quando o mais antigo passa do p80 a tela diz isso com todas
 *     as letras (regra 4 — os três números saíram da mesma consulta).
 *
 * Componente de servidor: não há nada para clicar aqui, e menos JavaScript no
 * navegador é menos superfície para a tela e o banco discordarem.
 */

import { curtaBR, situacaoDaFolga } from "@/lib/datas";
import { desdeQuando, emDias } from "./tipos";
import type { RespostaTempos } from "./tipos";

function rotuloTipo(tipo: string): string {
  const t = tipo.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "sai 2 dias depois do prazo" / "3 dias de folga" — nunca só a cor. */
function textoDaFolga(folga: number): string {
  if (folga === 0) return "em cima do prazo";
  if (folga < 0) {
    const d = Math.abs(folga);
    return `${d} dia${d > 1 ? "s" : ""} depois do prazo`;
  }
  return `${folga} dia${folga > 1 ? "s" : ""} de folga`;
}

export default function PainelTempos({ dados }: { dados: RespostaTempos }) {
  const { resumo, etapas, pedidos, min_amostra } = dados;

  const previstos = pedidos.filter((p) => p.estado === "previsto");
  const semHistorico = pedidos.filter((p) => p.estado === "sem_historico");
  const faltando = etapas.filter((e) => !e.ultima && e.mediana_dias === null);
  const tipos = [...new Set(etapas.map((e) => e.tipo))];
  const temPrevisao = resumo.com_previsao > 0;

  return (
    <div className="wrap-app">
      <div className="app-cab">
        <div>
          <h1>Tempos e previsão</h1>
          <p className="ajuda">
            Quanto cada etapa leva <b>nesta oficina</b>, medido do que já
            aconteceu — e, com isso, quando cada pedido deve ficar pronto.
            Hoje é {curtaBR(dados.hoje)}.
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="r">Etapas aprendidas</div>
          <div className="v" data-teste="etapas-aprendidas">
            {resumo.etapas_aprendidas}
            <span className="kpi-de"> de {resumo.etapas_total}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="r">Pedidos com previsão</div>
          <div className="v" data-teste="com-previsao">
            {resumo.com_previsao}
            <span className="kpi-de"> de {resumo.pedidos_total}</span>
          </div>
        </div>
        {/* Regra 2: sem previsão nenhuma, "0 atrasando" seria afirmação. */}
        <div className={temPrevisao && resumo.atrasa_pela_conta > 0 ? "kpi mal" : "kpi"}>
          <div className="r">Atrasam pela conta</div>
          <div className="v" data-teste="atrasa">
            {temPrevisao ? resumo.atrasa_pela_conta : "—"}
          </div>
          {!temPrevisao && <div className="kpi-pe">sem previsão ainda</div>}
        </div>
        <div className="kpi">
          <div className="r">Permanências medidas</div>
          <div className="v">{resumo.observacoes}</div>
          {resumo.voltas > 0 && (
            <div className="kpi-pe">{resumo.voltas} volta(s) de retrabalho</div>
          )}
        </div>
      </div>

      {resumo.etapas_aprendidas === 0 && (
        <div className="tempos-vazio">
          <b>Ainda não sei os tempos desta oficina.</b>
          <p>
            A conta não vem de tabela nem de estimativa: ela aprende dos pedidos
            que passam. Cada etapa precisa de <b>{min_amostra} pedidos</b>{" "}
            atravessando ela para eu ter um número — e aí a previsão aparece
            sozinha, sem você configurar nada.
          </p>
          <p>
            {resumo.observacoes === 0
              ? "Até agora nenhum pedido completou uma etapa inteira dentro da Esteira."
              : `Já contei ${resumo.observacoes} permanência(s), mas nenhuma etapa chegou a ${min_amostra} ainda.`}{" "}
            Quanto mais o chão avançar pedido no celular, mais rápido isto
            enche.
          </p>
        </div>
      )}

      <h2 className="tempos-titulo">O que cada etapa leva</h2>
      <div className="tabela-rolo">
        <table className="tabela">
          <thead>
            <tr>
              {tipos.length > 1 && <th>Tipo</th>}
              <th>Etapa</th>
              <th>Metade sai em até</th>
              <th>8 em cada 10</th>
              <th>Medições</th>
              <th>Na fila agora</th>
            </tr>
          </thead>
          <tbody>
            {etapas.map((e) => (
              <tr key={e.etapa_id} data-teste="linha-etapa" data-etapa={e.etapa}>
                {tipos.length > 1 && <td className="origem">{rotuloTipo(e.tipo)}</td>}
                <td>
                  <b>{e.etapa}</b>
                  {e.voltas > 0 && (
                    <div className="obs">
                      {e.voltas} pedido(s) voltaram desta etapa — fora da conta
                    </div>
                  )}
                </td>
                <td data-teste="mediana">
                  {e.ultima ? (
                    <span className="tempos-na">última etapa — nada sai dela</span>
                  ) : e.mediana_dias === null ? (
                    <span className="tempos-na">
                      ainda não sei · faltam {Math.max(min_amostra - e.n, 1)}
                    </span>
                  ) : (
                    <b>{emDias(e.mediana_dias)}</b>
                  )}
                </td>
                <td>
                  {e.p80_dias === null ? (
                    <span className="tempos-na">—</span>
                  ) : (
                    emDias(e.p80_dias)
                  )}
                  {e.maior_dias !== null && (
                    <div className="obs">pior caso {emDias(e.maior_dias)}</div>
                  )}
                </td>
                <td className="origem">{e.n}</td>
                <td>
                  {e.na_fila}
                  {e.mais_antigo_dias !== null && e.na_fila > 0 && (
                    <div className="obs">
                      o mais antigo {desdeQuando(e.mais_antigo_dias)}
                      {/*
                        O aviso do viés sai pelo p80, não pela mediana: passar
                        da mediana é o normal de metade dos pedidos e encheria
                        a tela de alarme. Passar do que 8 em cada 10 levam é
                        que diz "este está preso, e a conta não o está vendo".
                      */}
                      {e.p80_dias !== null && e.mais_antigo_dias > e.p80_dias && (
                        <> — passou do que 8 em cada 10 levam, e a conta só
                        enxerga quem já saiu</>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="tempos-titulo">Quando cada pedido deve ficar pronto</h2>

      {previstos.length === 0 ? (
        <p className="tempos-na tempos-nenhum">
          Nenhum pedido tem previsão ainda — falta histórico nas etapas do
          caminho deles.
        </p>
      ) : (
        <div className="tabela-rolo">
          <table className="tabela">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Está em</th>
                <th>Pela conta, chega em</th>
                <th>Prazo</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {previstos.map((p) => {
                const folga = p.folga_dias;
                return (
                  <tr key={p.id} data-teste="linha-previsao" data-numero={p.numero}>
                    <td>
                      <span className="mono">#{p.numero}</span>
                      <div className="desc">{p.cliente}</div>
                    </td>
                    <td>
                      {p.etapa}
                      <div className="obs">{desdeQuando(p.dias_aqui)}</div>
                    </td>
                    <td data-teste="previsao">
                      <b>{p.previsao_data ? curtaBR(p.previsao_data) : "—"}</b>
                      <div className="obs">
                        faltam {emDias(p.previsao_dias)}
                      </div>
                    </td>
                    <td>
                      {p.prazo ? (
                        curtaBR(p.prazo)
                      ) : (
                        <span className="sem-prazo">sem prazo</span>
                      )}
                    </td>
                    <td>
                      {folga === null ? (
                        <span className="sem-prazo">nada a comparar</span>
                      ) : (
                        <span className={`pill ${situacaoDaFolga(folga)}`}>
                          {textoDaFolga(folga)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {semHistorico.length > 0 && (
        <p className="tempos-restante" data-teste="sem-previsao">
          Outros <b>{semHistorico.length}</b> pedido(s) em andamento ainda não
          têm previsão
          {faltando.length > 0 && (
            <>
              : falta histórico em{" "}
              <b>{faltando.map((e) => e.etapa).join(", ")}</b>
            </>
          )}
          . Eles aparecem aqui assim que essas etapas completarem{" "}
          {min_amostra} medições.
        </p>
      )}

      <details className="formato">
        <summary>Como esta conta é feita</summary>
        <p>
          Para cada etapa eu meço quanto tempo os pedidos ficaram nela — do
          momento em que entraram até o momento em que saíram — e uso a{" "}
          <b>mediana</b>, o valor do meio. Média não serve: um pedido que
          atravessou um feriado a destrói, e a mediana nem sente.
        </p>
        <p>
          A previsão de um pedido é <b>o que falta da etapa atual</b> (mediana
          da etapa menos os dias que ele já está lá) <b>mais a mediana de cada
          etapa seguinte</b>, até a última. O resultado é arredondado para cima:
          data prevista é promessa, e promessa que sobra é melhor que promessa
          que falta.
        </p>
        <p>
          <b>Enquanto uma etapa do caminho não tiver {min_amostra} medições, o
          pedido não ganha data.</b> Somar mediana com chute produziria uma data
          na tela — e data na tela é promessa. Prefiro dizer que não sei.
        </p>
        <p>
          São <b>dias corridos</b>, incluindo fim de semana, porque o prazo do
          seu cliente também é em dias corridos — é essa a régua que dá para
          comparar. E a mediana só enxerga pedidos que já <b>saíram</b> da
          etapa: se tem pedido preso lá há mais tempo que a mediana, o número
          está otimista, e é por isso que a fila aparece do lado.
        </p>
        <p>
          A janela é de {dados.janela_dias} dias — o que a oficina fazia no
          semestre passado não descreve o que ela faz hoje.
        </p>
      </details>
    </div>
  );
}
