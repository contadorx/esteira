"use client";

/**
 * O celular do chão de fábrica.
 *
 * A regra que governa esta tela: **dois toques**. Toque 1 no botão grande do
 * pedido, toque 2 em "Confirmar". Não é burocracia — é o que impede o celular
 * no bolso de empurrar meia produção sozinho, e ainda cabe entre duas peças.
 *
 * Alvos grandes (≥56px), texto grande, nada de menu. Quem usa isto está de pé,
 * com a mão suja, no barulho.
 *
 * Nada de dado sensível (D1): número, descrição, prazo e primeiro nome.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { curtaBR, diasAteOPrazo, situacaoDoPrazo } from "@/lib/datas";
import { avancar, registrarProblema, type RespostaChao } from "./acoes";
import type { PedidoChao } from "./tipos";

const ROTULO = { ok: "no prazo", aperta: "aperta", estourou: "atrasado" } as const;

function diasNaEtapa(desde: string): number {
  return Math.max(0, -diasAteOPrazo(desde.slice(0, 10)));
}

function Pedido({
  pedido,
  aberto,
  modo,
  ocupado,
  podeFoto,
  aoAbrir,
  aoFechar,
  aoConfirmar,
  aoProblema,
}: {
  pedido: PedidoChao;
  aberto: boolean;
  modo: "avancar" | "problema" | null;
  ocupado: boolean;
  podeFoto: boolean;
  aoAbrir: (modo: "avancar" | "problema") => void;
  aoFechar: () => void;
  aoConfirmar: (form: FormData) => void;
  aoProblema: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const situacao = pedido.prazo ? situacaoDoPrazo(pedido.prazo) : null;
  const dias = diasNaEtapa(pedido.etapa_desde);

  return (
    <li className={`chao-item ${situacao ?? ""}`}>
      <div className="chao-cab">
        <span className="mono chao-num">#{pedido.numero}</span>
        {pedido.prazo && situacao ? (
          <span className={`pill ${situacao}`}>
            {ROTULO[situacao]} · {curtaBR(pedido.prazo)}
          </span>
        ) : (
          <span className="sem-prazo">sem prazo</span>
        )}
      </div>

      <div className="chao-desc">{pedido.descricao ?? "—"}</div>
      <div className="chao-meta">
        {pedido.cliente} · {dias === 0 ? "entrou hoje" : `${dias}d nesta etapa`}
      </div>

      {!aberto && (
        <div className="chao-acoes">
          {/* Toque 1 */}
          <button
            className="chao-btn principal"
            onClick={() => aoAbrir("avancar")}
            disabled={ocupado}
          >
            Avançar para {pedido.proxima_nome}
          </button>
          <button
            className="chao-btn secundario"
            onClick={() => aoAbrir("problema")}
            disabled={ocupado}
          >
            Deu problema
          </button>
        </div>
      )}

      {aberto && modo === "avancar" && (
        <form
          className="chao-confirma"
          action={(fd) => aoConfirmar(fd)}
        >
          <p className="chao-pergunta">
            Mandar o <b>#{pedido.numero}</b> para <b>{pedido.proxima_nome}</b>?
          </p>

          {podeFoto && (
            <label className="chao-foto">
              <input type="file" name="foto" accept="image/*" capture="environment" />
              <span>📷 Anexar foto (opcional)</span>
            </label>
          )}

          <div className="chao-acoes">
            {/* Toque 2 */}
            <button className="chao-btn principal" type="submit" disabled={ocupado}>
              {ocupado ? "Marcando…" : "Confirmar"}
            </button>
            <button
              className="chao-btn secundario"
              type="button"
              onClick={aoFechar}
              disabled={ocupado}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {aberto && modo === "problema" && (
        <div className="chao-confirma">
          <p className="chao-pergunta">O que houve com o #{pedido.numero}?</p>
          <textarea
            className="chao-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: peça trincou no corte"
            rows={2}
          />
          <div className="chao-acoes">
            <button
              className="chao-btn principal"
              onClick={() => aoProblema(texto)}
              disabled={ocupado || !texto.trim()}
            >
              {ocupado ? "Anotando…" : "Anotar"}
            </button>
            <button className="chao-btn secundario" onClick={aoFechar} disabled={ocupado}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function Painel({
  token,
  nome,
  oficina,
  posto,
  pedidos,
  podeFoto,
}: {
  token: string;
  nome: string;
  oficina: string;
  posto: string | null;
  pedidos: PedidoChao[];
  podeFoto: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [modo, setModo] = useState<"avancar" | "problema" | null>(null);
  const [recado, setRecado] = useState<RespostaChao | null>(null);

  const fechar = () => {
    setAbertoId(null);
    setModo(null);
  };

  const confirmar = (pedido: PedidoChao, form: FormData) => {
    setRecado(null);
    iniciar(async () => {
      const r = await avancar(token, pedido.id, pedido.etapa_id, form);
      setRecado(r);
      fechar();
      router.refresh();
    });
  };

  const problema = (pedido: PedidoChao, texto: string) => {
    setRecado(null);
    iniciar(async () => {
      const r = await registrarProblema(token, pedido.id, texto);
      setRecado(r);
      fechar();
      router.refresh();
    });
  };

  return (
    <main className="chao">
      <header className="chao-topo">
        <div>
          <div className="chao-nome">{nome}</div>
          <div className="chao-posto">
            {oficina}
            {posto ? ` · ${posto}` : ""}
          </div>
        </div>
        <span className="chao-contador">{pedidos.length}</span>
      </header>

      {recado && (
        <div
          className={`chao-recado ${recado.estado === "ok" ? "bom" : "ruim"}`}
          role="status"
        >
          <b>{recado.mensagem}</b>
          {/* Regra 2: o destino da foto é dito, não presumido. */}
          {recado.foto === "enviada" && <span> · foto anexada</span>}
          {recado.foto === "falhou" && (
            <span> · a foto NÃO subiu — marque de novo se precisar dela</span>
          )}
        </div>
      )}

      {pedidos.length === 0 ? (
        <p className="chao-vazio">
          Nada com você agora. Quando chegar pedido nesta etapa, ele aparece
          aqui.
        </p>
      ) : (
        <ul className="chao-lista">
          {pedidos.map((p) => (
            <Pedido
              key={p.id}
              pedido={p}
              aberto={abertoId === p.id}
              modo={abertoId === p.id ? modo : null}
              ocupado={pendente}
              podeFoto={podeFoto}
              aoAbrir={(m) => {
                setAbertoId(p.id);
                setModo(m);
              }}
              aoFechar={fechar}
              aoConfirmar={(fd) => confirmar(p, fd)}
              aoProblema={(t) => problema(p, t)}
            />
          ))}
        </ul>
      )}

      <footer className="chao-rodape">Esteira · não precisa de senha</footer>
    </main>
  );
}
