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
import { curtaBR } from "@/lib/datas";
import { renderizarTexto } from "@/lib/mensagem";
import { registrarAviso } from "../avisos";
import type { ItemRadar, MotivoRadar, RespostaRadar } from "./tipos";

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
}: {
  dados: RespostaRadar;
  oficina: string | null;
}) {
  const [pendente, iniciar] = useTransition();
  const [copiadoEm, setCopiadoEm] = useState<string | null>(null);
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
      setCopiadoEm(new Date().toISOString());
      return;
    }
    iniciar(async () => {
      const r = await registrarAviso(lista[0].id, null, "radar_atraso");
      if (r.estado === "ok" && r.quando) setCopiadoEm(r.quando);
      else setCopiadoEm(new Date().toISOString());
    });
  };

  const pct = dados.metrica.pct_chao;

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
          <ul className="radar-lista">
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
        {copiadoEm && (
          <p className="aviso-ok" role="status">
            Radar copiado às{" "}
            <b>
              {new Date(copiadoEm).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Sao_Paulo",
              })}
            </b>
            .
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
