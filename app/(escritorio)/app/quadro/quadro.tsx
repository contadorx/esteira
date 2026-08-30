"use client";

/**
 * O quadro (B3).
 *
 * Dois caminhos para mover um pedido, de propósito:
 *  - os botões ‹ ›, que funcionam em qualquer lugar: toque, teclado, leitor de
 *    tela, mão suja, tela pequena. É o caminho GARANTIDO;
 *  - o arrasto pela alça, que é mais rápido para quem está de mouse. É o
 *    ACELERADOR — nunca a única porta.
 *
 * O arrasto usa Pointer Events (mouse, caneta e toque no mesmo código) em vez
 * do drag-and-drop nativo do HTML, que não existe em toque. A alça carrega
 * `touch-action: none` só nela: assim o dedo arrasta o cartão pela alça e
 * ainda rola a coluna em qualquer outro ponto.
 *
 * Componentes no escopo do MÓDULO (regra 6).
 * Cor apenas por prazo (regra 5): a coluna não colore nada.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { curtaBR, diasAteOPrazo, hoje, situacaoDoPrazo } from "@/lib/datas";
import { moverPedido, type ResultadoMover } from "./acoes";
import PainelAviso from "../aviso";
import type { CartaoPedido, ColunaEtapa } from "./tipos";

const ROTULO = { ok: "no prazo", aperta: "aperta", estourou: "venceu" } as const;

function rotuloTipo(tipo: string): string {
  const t = tipo.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Dias inteiros desde que o pedido entrou na etapa atual. */
function diasNaEtapa(etapaDesde: string): number {
  const dia = etapaDesde.slice(0, 10);
  return Math.max(0, -diasAteOPrazo(dia));
}

function Cartao({
  cartao,
  primeira,
  ultima,
  ocupado,
  arrastando,
  aoMover,
  aoPegar,
}: {
  cartao: CartaoPedido;
  primeira: boolean;
  ultima: boolean;
  ocupado: boolean;
  arrastando: boolean;
  aoMover: (direcao: -1 | 1) => void;
  aoPegar: (evento: React.PointerEvent) => void;
}) {
  const situacao = cartao.prazo ? situacaoDoPrazo(cartao.prazo) : null;
  const dias = diasNaEtapa(cartao.etapaDesde);

  return (
    <li
      className={`cartao ${situacao ?? "sem-prazo"} ${arrastando ? "fantasma" : ""}`}
      data-pedido={cartao.id}
    >
      <span
        className="cartao-alca"
        onPointerDown={aoPegar}
        aria-hidden="true"
        title="Arraste para outra etapa"
      >
        ⠿
      </span>

      <div className="cartao-corpo">
        <div className="cartao-topo">
          {/*
            O número do pedido é o caminho para a gaveta (B12). Fica como link
            e não como clique no cartão inteiro de propósito: o cartão é a
            área de arrasto, e um cartão que às vezes arrasta e às vezes
            navega é um cartão que a pessoa deixa de confiar.
          */}
          <a className="mono cartao-num" href={`/app/pedido/${cartao.id}`}>
            #{cartao.numero}
          </a>
          {cartao.prazo && situacao ? (
            <span className={`pill ${situacao}`}>
              {ROTULO[situacao]} · {curtaBR(cartao.prazo)}
            </span>
          ) : (
            <span className="sem-prazo">sem prazo</span>
          )}
        </div>
        <div className="cartao-cliente">{cartao.cliente}</div>
        {cartao.descricao && <div className="cartao-desc">{cartao.descricao}</div>}
        <div className="cartao-pe">
          <span className="cartao-dias">
            {dias === 0 ? "entrou hoje" : `${dias}d aqui`}
          </span>
          <span className="cartao-botoes">
            <button
              className="mini-btn"
              onClick={() => aoMover(-1)}
              disabled={primeira || ocupado}
              aria-label={`Voltar o pedido ${cartao.numero} para a etapa anterior`}
              title="Etapa anterior"
            >
              ‹
            </button>
            <button
              className="mini-btn avancar"
              onClick={() => aoMover(1)}
              disabled={ultima || ocupado}
              aria-label={`Avançar o pedido ${cartao.numero} para a próxima etapa`}
              title="Próxima etapa"
            >
              ›
            </button>
          </span>
        </div>
      </div>
    </li>
  );
}

function Coluna({
  coluna,
  cartoes,
  primeira,
  ultima,
  ocupado,
  alvo,
  idArrastado,
  aoMover,
  aoPegar,
}: {
  coluna: ColunaEtapa;
  cartoes: CartaoPedido[];
  primeira: boolean;
  ultima: boolean;
  ocupado: boolean;
  alvo: boolean;
  idArrastado: string | null;
  aoMover: (cartao: CartaoPedido, direcao: -1 | 1) => void;
  aoPegar: (cartao: CartaoPedido, evento: React.PointerEvent) => void;
}) {
  return (
    <section className={`coluna ${alvo ? "alvo" : ""}`} data-etapa={coluna.id}>
      <header className="coluna-cab">
        <h2>{coluna.nome}</h2>
        {/* Contador e lista saem do MESMO array (regra 4). */}
        <span className="coluna-qtd">{cartoes.length}</span>
      </header>
      <ul className="coluna-cartoes">
        {cartoes.map((c) => (
          <Cartao
            key={c.id}
            cartao={c}
            primeira={primeira}
            ultima={ultima}
            ocupado={ocupado}
            arrastando={idArrastado === c.id}
            aoMover={(d) => aoMover(c, d)}
            aoPegar={(e) => aoPegar(c, e)}
          />
        ))}
        {cartoes.length === 0 && <li className="coluna-vazia">nenhum pedido</li>}
      </ul>
    </section>
  );
}

export default function Quadro({
  colunas,
  cartoes,
  tipos,
  tipoAtivo,
  foraDoQuadro,
  oficina,
  base,
}: {
  colunas: ColunaEtapa[];
  cartoes: CartaoPedido[];
  tipos: string[];
  tipoAtivo: string;
  foraDoQuadro: number;
  oficina: string | null;
  base: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<ResultadoMover | null>(null);
  const [arrasto, setArrasto] = useState<{
    cartao: CartaoPedido;
    x: number;
    y: number;
    ativo: boolean;
  } | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  const executar = (cartao: CartaoPedido, destino: string) => {
    if (destino === cartao.etapaId) return;
    setAviso(null);
    iniciar(async () => {
      const r = await moverPedido(cartao.id, cartao.etapaId, destino);
      setAviso(r);
      // Mesmo em conflito recarregamos: a tela precisa mostrar onde o pedido
      // REALMENTE está, não a versão que o usuário tinha na cabeça.
      router.refresh();
    });
  };

  const moverPorBotao = (cartao: CartaoPedido, direcao: -1 | 1) => {
    const i = colunas.findIndex((c) => c.id === cartao.etapaId);
    const destino = colunas[i + direcao];
    if (destino) executar(cartao, destino.id);
  };

  // ── arrasto ─────────────────────────────────────────────────────
  const pegar = (cartao: CartaoPedido, e: React.PointerEvent) => {
    if (pendente) return;
    inicio.current = { x: e.clientX, y: e.clientY };
    setArrasto({ cartao, x: e.clientX, y: e.clientY, ativo: false });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!arrasto) return;

    const mover = (e: PointerEvent) => {
      const p = inicio.current;
      // Limiar de 6px: sem ele, um clique trêmulo na alça viraria arrasto.
      const ativo =
        arrasto.ativo ||
        (p !== null && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6);
      setArrasto((a) => (a ? { ...a, x: e.clientX, y: e.clientY, ativo } : a));
      if (ativo) {
        const sob = document.elementFromPoint(e.clientX, e.clientY);
        const col = sob?.closest("[data-etapa]") as HTMLElement | null;
        setColunaAlvo(col?.dataset.etapa ?? null);
      }
    };

    const soltar = () => {
      if (arrasto.ativo && colunaAlvo) executar(arrasto.cartao, colunaAlvo);
      setArrasto(null);
      setColunaAlvo(null);
      inicio.current = null;
    };

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [arrasto, colunaAlvo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Números da barra: todos saem de `cartoes`, o mesmo array que vira coluna.
  const hojeIso = hoje();
  const vencidos = cartoes.filter(
    (c) => c.prazo && situacaoDoPrazo(c.prazo) === "estourou",
  ).length;
  const apertando = cartoes.filter(
    (c) => c.prazo && situacaoDoPrazo(c.prazo) === "aperta",
  ).length;
  const paradosDoisDias = cartoes.filter((c) => diasNaEtapa(c.etapaDesde) >= 2).length;

  return (
    <div className="wrap-app quadro-wrap">
      <div className="app-cab">
        <div>
          <h1>Quadro</h1>
          <p className="ajuda">
            Arraste pela alça <span className="alca-exemplo">⠿</span> ou use os
            botões ‹ ›. Hoje é {curtaBR(hojeIso)}.
          </p>
        </div>
        <div className="app-acoes">
          {tipos.length > 1 && (
            <div className="tipo-abas" role="tablist" aria-label="Tipo de pedido">
              {tipos.map((t) => (
                <a
                  key={t}
                  role="tab"
                  aria-selected={t === tipoAtivo}
                  className={`tipo-aba ${t === tipoAtivo ? "ativa" : ""}`}
                  href={`/app?tipo=${encodeURIComponent(t)}`}
                >
                  {rotuloTipo(t)}
                </a>
              ))}
            </div>
          )}
          <a className="btn btn-aco" href="/app/novo">
            Novo pedido
          </a>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="r">No quadro</div>
          <div className="v">{cartoes.length}</div>
        </div>
        <div className="kpi risco">
          <div className="r">Aperta o prazo</div>
          <div className="v">{apertando}</div>
        </div>
        <div className="kpi mal">
          <div className="r">Venceu</div>
          <div className="v">{vencidos}</div>
        </div>
        <div className="kpi">
          <div className="r">Parados 2d+</div>
          <div className="v">{paradosDoisDias}</div>
        </div>
      </div>

      {aviso && aviso.estado !== "ok" && (
        <div
          className={aviso.estado === "conflito" ? "aviso-conflito" : "falha"}
          role="alert"
        >
          <b>{aviso.estado === "conflito" ? "O quadro mudou." : "Não deu."}</b>
          <p>{aviso.mensagem}</p>
        </div>
      )}

      {/* Avisar o cliente é mais provável de acontecer AQUI, no segundo
          seguinte ao movimento, do que numa tela separada depois. */}
      {aviso?.estado === "ok" && aviso.avisar && (
        <div className="moveu">
          <div className="moveu-cab">
            <b>
              #{aviso.avisar.numero} entrou em {aviso.avisar.etapaAtual}
            </b>
            <button className="mini-btn" onClick={() => setAviso(null)}>
              fechar
            </button>
          </div>
          <PainelAviso
            dados={{
              pedidoId: aviso.avisar.pedidoId,
              numero: aviso.avisar.numero,
              cliente: aviso.avisar.cliente,
              fone: aviso.avisar.fone,
              descricao: aviso.avisar.descricao,
              etapaAtual: aviso.avisar.etapaAtual,
              previsao: aviso.avisar.previsao,
              tokenPublico: aviso.avisar.tokenPublico,
              oficina: oficina ?? "sua oficina",
              base,
              ultima: aviso.avisar.ultima,
            }}
          />
        </div>
      )}

      {foraDoQuadro > 0 && (
        <p className="ajuda fora-quadro">
          {foraDoQuadro} pedido(s) deste tipo estão em uma etapa que não existe
          mais e por isso não aparecem aqui. Eles estão na{" "}
          <a href="/app/pedidos">lista</a>.
        </p>
      )}

      {colunas.length === 0 ? (
        <p className="vazio">
          Este tipo de pedido ainda não tem etapas. Configure em{" "}
          <a href="/app/etapas">Etapas</a>.
        </p>
      ) : (
        <div className="quadro-rolo">
          <div
            className="quadro"
            style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(230px, 1fr))` }}
          >
            {colunas.map((coluna, i) => (
              <Coluna
                key={coluna.id}
                coluna={coluna}
                cartoes={cartoes.filter((c) => c.etapaId === coluna.id)}
                primeira={i === 0}
                ultima={i === colunas.length - 1}
                ocupado={pendente}
                alvo={colunaAlvo === coluna.id && (arrasto?.ativo ?? false)}
                idArrastado={arrasto?.ativo ? arrasto.cartao.id : null}
                aoMover={moverPorBotao}
                aoPegar={pegar}
              />
            ))}
          </div>
        </div>
      )}

      {arrasto?.ativo && (
        <div
          className="cartao-voando"
          style={{ left: arrasto.x + 12, top: arrasto.y - 18 }}
        >
          <span className="mono">#{arrasto.cartao.numero}</span> {arrasto.cartao.cliente}
        </div>
      )}
    </div>
  );
}
