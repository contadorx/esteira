"use client";

/**
 * Painel de "avisar o cliente" (B5).
 *
 * A regra que manda aqui é a nº 2, e ela é o motivo deste bloco existir: na
 * fase 1 **não há envio automático**. Quem manda a mensagem é a pessoa, pelo
 * WhatsApp dela, e o aplicativo não tem como saber se ela apertou enviar.
 *
 * Então esta tela nunca diz "cliente avisado". Diz "mensagem copiada às
 * 14h22" — que é o que se prova. O toast do mockup dizia "cliente avisado"
 * sem nada por trás; é exatamente esse furo que morre aqui.
 */

import { useState, useTransition } from "react";
import { linkWa, renderizarTexto, type TipoMensagem } from "@/lib/mensagem";
import { registrarAviso } from "./avisos";

export interface DadosAviso {
  pedidoId: string;
  numero: string;
  cliente: string;
  fone: string | null;
  descricao: string | null;
  etapaAtual: string;
  previsao: string | null;
  tokenPublico: string;
  oficina: string;
  base: string;
  ultima: TipoMensagem;
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function montarTexto(d: DadosAviso): string {
  return renderizarTexto(d.ultima, {
    nome: d.cliente,
    descricao: d.descricao ?? `#${d.numero}`,
    etapaAtual: d.etapaAtual,
    previsao: d.previsao
      ? `Previsão de conclusão: ${d.previsao.split("-").reverse().join("/")}.`
      : "Assim que tivermos a data de conclusão, avisamos.",
    link: `${d.base}/p/${d.tokenPublico}`,
    remetente: d.oficina,
  });
}

export default function PainelAviso({ dados }: { dados: DadosAviso }) {
  const [pendente, iniciar] = useTransition();
  const [copiadoEm, setCopiadoEm] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const texto = montarTexto(dados);

  const registrar = () =>
    iniciar(async () => {
      const r = await registrarAviso(dados.pedidoId, dados.fone, dados.ultima);
      if (r.estado === "ok" && r.quando) setCopiadoEm(r.quando);
      else setFalha(r.mensagem ?? "Não consegui registrar a cópia.");
    });

  const copiar = async () => {
    setFalha(null);
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sem confirmação da área de transferência, não afirmamos que copiou.
      setFalha("Não consegui copiar sozinho — selecione o texto acima e copie.");
      return;
    }
    registrar();
  };

  return (
    <div className="aviso-painel">
      <div className="aviso-cab">
        <b>Mensagem para {dados.cliente}</b>
        <span className="aviso-fone">
          {dados.fone ? `WhatsApp ${dados.fone}` : "sem telefone cadastrado"}
        </span>
      </div>

      <textarea className="aviso-texto" value={texto} readOnly rows={6} />

      <div className="aviso-acoes">
        <button className="btn btn-borda" onClick={copiar} disabled={pendente}>
          Copiar mensagem
        </button>
        {dados.fone ? (
          <a
            className="btn btn-aco"
            href={linkWa(dados.fone, texto)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={registrar}
          >
            Abrir no WhatsApp
          </a>
        ) : (
          <span className="aviso-sem-fone">
            Cadastre o WhatsApp no pedido para abrir a conversa direto.
          </span>
        )}
      </div>

      {/* O ÚNICO estado que esta tela pode afirmar. */}
      {copiadoEm && (
        <p className="aviso-ok" role="status">
          Mensagem copiada às <b>{horaCurta(copiadoEm)}</b>. O envio é você quem
          faz — a Esteira não manda sozinha ainda.
        </p>
      )}
      {falha && (
        <p className="alerta" role="alert">
          {falha}
        </p>
      )}
    </div>
  );
}
