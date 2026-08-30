"use client";

/**
 * O radar de atraso (B6) — a função que vende o produto.
 *
 * Mostrar status é o que o cliente final quer. O que muda a vida do dono é
 * chegar de manhã e já saber o que não sai no prazo se não andar hoje.
 *
 * Duas honestidades desta tela:
 *  1. A CONTA ESTÁ ESCRITA NELA. "Uma etapa por dia, no melhor caso" — o dono
 *     precisa poder conferir de cabeça, senão não confia; e radar em que não
 *     se confia é radar que ninguém lê depois da segunda semana.
 *  2. O envio automático NÃO existe ainda (D9). A tela diz isso, para ninguém
 *     ficar esperando às 7h uma mensagem que não vem — que seria pior que não
 *     ter radar nenhum, porque a pessoa passou a confiar.
 */

import { useState, useTransition } from "react";
import { agoraHoraCurta, curtaBR, horaCurta } from "@/lib/datas";
import { renderizarTexto } from "@/lib/mensagem";
import { registrarAviso } from "../avisos";
import { emDias } from "../tempos/tipos";
import type { RespostaTempos } from "../tempos/tipos";
import type { ItemRadar, MotivoRadar, RespostaRadar } from "./tipos";

/**
 * A cor da lista "pela conta do histórico": ÂMBAR, não vermelho.
 *
 * O prazo destes pedidos ainda não passou — se tivesse passado, eles estariam
 * na lista de cima como `venceu`. O que a conta diz é que ele NÃO vai ser
 * cumprido se nada mudar, e isso é aviso, não fato consumado. Pintar de
 * vermelho seria a tela afirmando um estouro que ainda não existe (regra 2),
 * e vermelho que às vezes quer dizer "vai estourar" e às vezes "estourou"
 * deixa de querer dizer alguma coisa (regra 5).
 */
const AVISO_PREVISAO = "aperta";

const ROTULO: Record<MotivoRadar, string> = {
  venceu: "venceu",
  aperta: "aperta",
  parado: "parado",
};

function explicar(item: ItemRadar): string {
  if (item.motivo === "venceu") {
    const d = item.dias_ate_o_prazo ?? 0;
    return `venceu ${d === -1 ? "ontem" : `há ${Math.abs(d)} dias`}`;
  }
  if (item.motivo === "aperta") {
    const d = item.dias_ate_o_prazo ?? 0;
    return `${d === 0 ? "vence hoje" : `faltam ${d} dia${d > 1 ? "s" : ""}`} e ${
      item.etapas_restantes
    } etapa${item.etapas_restantes > 1 ? "s" : ""}`;
  }
  return `parado há ${item.dias_parado} dias em ${item.etapa}`;
}

/**
 * "está em", nunca "está na/no": o nome da etapa é escrito pelo dono da
 * oficina, e não dá para saber o gênero de "Pronto", "Pintura" ou "Têmpera".
 * "está na Pronto" numa mensagem que o cliente vê custa credibilidade barato.
 */
function linhaDaMensagem(item: ItemRadar): string {
  const base = `#${item.numero} ${item.cliente}`;
  if (item.motivo === "parado")
    return `${base} — parado em ${item.etapa} há ${item.dias_parado} dias`;
  if (item.motivo === "venceu")
    return `${base} — VENCEU${item.prazo ? ` em ${curtaBR(item.prazo)}` : ""}, está em ${item.etapa}`;
  return `${base} — ${explicar(item)}, está em ${item.etapa}`;
}

export default function PainelRadar({
  dados,
  oficina,
  tempos,
  erroTempos,
}: {
  dados: RespostaRadar;
  oficina: string | null;
  tempos: RespostaTempos | null;
  erroTempos: string | null;
}) {
  const [pendente, iniciar] = useTransition();
  /**
   * `registro` separa três situações que antes viravam a mesma frase:
   *   "gravado"     — o servidor confirmou e devolveu a hora dele
   *   "so_copiado"  — copiou, mas não havia o que registrar (lista vazia)
   *   "sem_registro"— copiou e o registro FALHOU; a hora é a do navegador
   * Mostrar a hora local como se fosse a gravada engolia um erro e afirmava
   * o que não foi apurado (regras 1 e 2).
   */
  const [copia, setCopia] = useState<
    { hora: string; registro: "gravado" | "so_copiado" | "sem_registro"; motivo?: string } | null
  >(null);
  const [falha, setFalha] = useState<string | null>(null);

  const lista = dados.lista ?? [];
  const texto = renderizarTexto("radar_atraso", {
    qtd: String(lista.length),
    lista: lista.map(linhaDaMensagem).join("\n"),
    resumoOntem: `${dados.ontem.avancaram} pedido(s) andaram e ${dados.ontem.parados} ficaram parados.`,
  });

  const copiar = async () => {
    setFalha(null);
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      setFalha("Não consegui copiar sozinho — selecione o texto e copie.");
      return;
    }
    // O radar não é de um pedido só: registramos a cópia no primeiro da lista,
    // que é o mais urgente. Sem lista, não há o que registrar.
    if (lista.length === 0) {
      setCopia({ hora: agoraHoraCurta(), registro: "so_copiado" });
      return;
    }
    iniciar(async () => {
      const r = await registrarAviso(lista[0].id, null, "radar_atraso");
      if (r.estado === "ok" && r.quando) {
        setCopia({ hora: horaCurta(r.quando), registro: "gravado" });
      } else {
        setCopia({
          hora: agoraHoraCurta(),
          registro: "sem_registro",
          motivo: r.mensagem ?? "o servidor não confirmou",
        });
      }
    });
  };

  const pct = dados.metrica.pct_chao;

  /**
   * O que a régua otimista do radar deixa passar.
   *
   * O radar conta "uma etapa por dia" — de propósito, para não gritar demais.
   * A previsão aprendida (B8) conta o que a oficina leva de verdade, e por
   * isso enxerga pedidos que ainda têm dias de sobra no calendário mas não
   * têm dias de sobra na prática. São os que já estão na lista acima que
   * ficam de fora daqui: repetir o mesmo pedido em duas listas com dois
   * motivos diferentes ensina a pessoa a ignorar as duas.
   */
  const jaNoRadar = new Set(lista.map((i) => i.id));
  const pelaConta = (tempos?.pedidos ?? []).filter(
    (p) =>
      p.estado === "previsto" &&
      p.folga_dias !== null &&
      p.folga_dias < 0 &&
      !jaNoRadar.has(p.id),
  );

  return (
    <div className="wrap-app estreito">
      <div className="app-cab">
        <div>
          <h1>Radar de atraso</h1>
          <p className="ajuda">
            O que não sai no prazo se não andar hoje, {curtaBR(dados.hoje)}.
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi mal">
          <div className="r">Venceu</div>
          <div className="v">{dados.contagem.venceu}</div>
        </div>
        <div className="kpi risco">
          <div className="r">Aperta</div>
          <div className="v">{dados.contagem.aperta}</div>
        </div>
        <div className="kpi">
          <div className="r">Parados 2d+</div>
          <div className="v">{dados.contagem.parado}</div>
        </div>
        <div className="kpi">
          <div className="r">Em andamento</div>
          <div className="v">{dados.em_jogo}</div>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="radar-limpo">
          Nada em risco hoje. Todos os {dados.em_jogo} pedidos em andamento têm
          folga para o prazo e andaram nos últimos dois dias.
        </p>
      ) : (
        <>
          {/*
            `data-teste` aqui não é enfeite: a segunda lista (“pela conta do
            histórico”) reusa `.radar-item` e `.pill aperta` para ter o mesmo
            desenho, e um seletor solto passou a somar as duas — o portão B6
            contou 11 onde havia 9. Cada lista se identifica.
          */}
          <ul className="radar-lista" data-teste="lista-radar">
            {lista.map((item) => (
              <li key={item.id} className={`radar-item ${item.motivo}`}>
                <span className={`pill ${item.motivo === "parado" ? "" : item.motivo === "venceu" ? "estourou" : "aperta"}`}>
                  {ROTULO[item.motivo]}
                </span>
                <div className="radar-corpo">
                  <div className="radar-titulo">
                    <span className="mono">#{item.numero}</span> {item.cliente}
                  </div>
                  <div className="radar-desc">{item.descricao ?? "—"}</div>
                  <div className="radar-motivo">
                    {explicar(item)} · está em <b>{item.etapa}</b>
                  </div>
                </div>
                <a className="mini-btn" href="/app">
                  ver no quadro
                </a>
              </li>
            ))}
          </ul>

          <details className="formato">
            <summary>Como esta lista é calculada</summary>
            <p>
              <b>Uma etapa por dia, no melhor caso.</b> Se faltam menos dias até
              o prazo do que etapas até a entrega, o pedido não sai no prazo —
              é o que aparece como <i>aperta</i>. O que já passou da data
              aparece como <i>venceu</i>. E o que não anda há dois dias ou mais
              entra como <i>parado</i>, mesmo com prazo folgado: é onde a fila
              entope em silêncio.
            </p>
            <p>
              A conta usa dias corridos e não conhece a capacidade da sua
              oficina, então ela erra <b>para menos</b>: prefere deixar passar
              um pedido a encher a lista de alarme falso.
            </p>
          </details>
        </>
      )}

      <section className="radar-conta" data-teste="pela-conta">
        <h2>Pela conta do histórico</h2>
        {erroTempos ? (
          <p className="aviso-parcial" role="status">
            Não consegui fazer a segunda conta ({erroTempos}). O radar acima
            está completo — o que faltou foi a previsão aprendida. Isto{" "}
            <b>não</b> quer dizer que não há nada nela.
          </p>
        ) : !tempos || tempos.resumo.com_previsao === 0 ? (
          <p className="ajuda">
            Ainda não sei quanto cada etapa leva nesta oficina, então não tenho
            uma segunda opinião para dar. Ela aparece sozinha conforme os
            pedidos passam — <a href="/app/tempos">veja o que já aprendi</a>.
          </p>
        ) : pelaConta.length === 0 ? (
          <p className="ajuda">
            Dos {tempos.resumo.com_previsao} pedidos com previsão, nenhum outro
            chega depois do prazo pela conta do histórico.{" "}
            <a href="/app/tempos">Ver os tempos por etapa</a>.
          </p>
        ) : (
          <>
            <p className="ajuda">
              O radar acima não pega estes {pelaConta.length} — eles ainda têm
              dias de sobra no calendário. Mas pelo tempo que cada etapa leva{" "}
              <b>nesta oficina</b>, chegam depois do prazo.
            </p>
            <ul className="radar-lista" data-teste="lista-conta">
              {pelaConta.map((p) => (
                <li key={p.id} className={`radar-item ${AVISO_PREVISAO}`} data-teste="item-conta">
                  <span className={`pill ${AVISO_PREVISAO}`}>previsão</span>
                  <div className="radar-corpo">
                    <div className="radar-titulo">
                      <span className="mono">#{p.numero}</span> {p.cliente}
                    </div>
                    <div className="radar-motivo">
                      chega em <b>{curtaBR(p.previsao_data as string)}</b>,{" "}
                      {Math.abs(p.folga_dias as number)} dia
                      {Math.abs(p.folga_dias as number) > 1 ? "s" : ""} depois do
                      prazo ({curtaBR(p.prazo as string)}) · está em{" "}
                      <b>{p.etapa}</b>, faltam {emDias(p.previsao_dias)}
                    </div>
                  </div>
                  <a className="mini-btn" href="/app/tempos">
                    ver a conta
                  </a>
                </li>
              ))}
            </ul>
            <p className="radar-nota">
              Esta lista <b>não</b> entra na mensagem copiada abaixo. Ela sai de
              outra régua — a do histórico, não a de uma etapa por dia — e
              juntar as duas num texto só faria a mensagem afirmar mais do que
              cada conta sustenta.
            </p>
          </>
        )}
      </section>

      <section className="radar-copiar">
        <h2>Mandar para o seu WhatsApp</h2>
        <textarea className="aviso-texto" value={texto} readOnly rows={8} />
        <div className="aviso-acoes">
          <button className="btn btn-aco" onClick={copiar} disabled={pendente}>
            Copiar radar
          </button>
          <span className="aviso-sem-fone">
            {oficina ? `Assine como ${oficina} se for repassar.` : ""}
          </span>
        </div>
        {copia && (
          <p
            className={copia.registro === "sem_registro" ? "aviso-parcial" : "aviso-ok"}
            role="status"
          >
            Radar copiado às <b>{copia.hora}</b>.
            {copia.registro === "sem_registro" && (
              <> Mas não consegui registrar a cópia no histórico ({copia.motivo}).</>
            )}
          </p>
        )}
        {falha && (
          <p className="alerta" role="alert">
            {falha}
          </p>
        )}
        {/* D9: dizer o que NÃO existe é tão importante quanto mostrar o que existe. */}
        <p className="radar-nota">
          A Esteira <b>não</b> manda este radar sozinha ainda. Por enquanto quem
          abre esta tela é você — o envio automático das 7h entra na próxima
          fase, junto com o canal de WhatsApp.
        </p>
      </section>

      <footer className="radar-metrica">
        {pct === null ? (
          <>
            <b>Ainda não sei</b> quanto do avanço vem do chão de fábrica: nenhum
            avanço foi registrado nos últimos 7 dias.
          </>
        ) : (
          <>
            Nos últimos 7 dias, <b>{pct}%</b> dos {dados.metrica.total} avanços
            foram feitos pelo chão de fábrica.
            {pct < 70 && (
              <span className="radar-metrica-alerta">
                {" "}
                Abaixo de 70% quer dizer que o escritório ainda está atualizando
                no lugar de quem produz.
              </span>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
