"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Resposta } from "../etapas/tipos";
import { criarAcesso, revogarAcesso, trocarPin } from "./acoes";

interface Acesso {
  id: string;
  nome: string;
  etapa_id: string | null;
  token: string;
  pin: string | null;
  ativo: boolean;
}
interface Etapa {
  id: string;
  nome: string;
  ordem: number;
  tipo_pedido: string;
}

function LinhaAcesso({
  acesso,
  etapa,
  base,
  ocupado,
  executar,
}: {
  acesso: Acesso;
  etapa: Etapa | undefined;
  base: string;
  ocupado: boolean;
  executar: (acao: () => Promise<Resposta>) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [pin, setPin] = useState(acesso.pin ?? "");
  const link = `${base}/c/${acesso.token}`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Regra 2: se a cópia não foi confirmada, não dizemos que copiou.
      setCopiado(false);
      window.prompt("Copie o link:", link);
    }
  };

  return (
    <li className={`acesso-linha ${acesso.ativo ? "" : "revogado"}`}>
      <div className="acesso-quem">
        <b>{acesso.nome}</b>
        <span className="acesso-posto">
          {etapa ? etapa.nome : "vê a oficina inteira"}
          {acesso.ativo ? "" : " · revogado"}
        </span>
      </div>

      <code className="acesso-link" title={link}>
        /c/{acesso.token.slice(0, 10)}…
      </code>

      <div className="acesso-pin">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="sem PIN"
          inputMode="numeric"
          aria-label={`PIN de ${acesso.nome}`}
        />
        {pin !== (acesso.pin ?? "") && (
          <button
            className="mini-btn salvar"
            disabled={ocupado}
            onClick={() => executar(() => trocarPin(acesso.id, pin))}
          >
            salvar
          </button>
        )}
      </div>

      <div className="acesso-botoes">
        <button className="mini-btn" onClick={copiar} disabled={!acesso.ativo}>
          {copiado ? "copiado ✓" : "copiar link"}
        </button>
        <button
          className={`mini-btn ${acesso.ativo ? "remover" : ""}`}
          disabled={ocupado}
          onClick={() => executar(() => revogarAcesso(acesso.id, !acesso.ativo))}
        >
          {acesso.ativo ? "revogar" : "reativar"}
        </button>
      </div>
    </li>
  );
}

export default function ListaAcessos({
  acessos,
  etapas,
  base,
}: {
  acessos: Acesso[];
  etapas: Etapa[];
  base: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [nome, setNome] = useState("");
  const [etapaId, setEtapaId] = useState("");
  const [pin, setPin] = useState("");

  const executar = (acao: () => Promise<Resposta>) => {
    setResposta(null);
    iniciar(async () => {
      const r = await acao();
      setResposta(r);
      if (r.estado === "ok") router.refresh();
    });
  };

  const porId = new Map(etapas.map((e) => [e.id, e]));
  const ativos = acessos.filter((a) => a.ativo);

  return (
    <div className="wrap-app estreito">
      <div className="app-cab">
        <div>
          <h1>Acessos do chão</h1>
          <p className="ajuda">
            Um link por pessoa ou por posto. Quem produz abre o link no próprio
            celular — sem instalar nada e sem senha. Se o celular sumir, revogue
            aqui e o link morre.
          </p>
        </div>
      </div>

      {resposta?.estado === "erro" && (
        <div className="falha" role="alert">
          <b>Não deu.</b>
          <p>{resposta.mensagem}</p>
        </div>
      )}

      {ativos.length === 0 && (
        <p className="vazio">
          Nenhum acesso ativo. Sem isso, os avanços só acontecem pelo escritório
          — e é o chão atualizando que faz a Esteira valer.
        </p>
      )}

      {acessos.length > 0 && (
        <ul className="acesso-lista">
          {acessos.map((a) => (
            <LinhaAcesso
              key={a.id}
              acesso={a}
              etapa={a.etapa_id ? porId.get(a.etapa_id) : undefined}
              base={base}
              ocupado={pendente}
              executar={executar}
            />
          ))}
        </ul>
      )}

      <section className="tipo-novo">
        <h2>Novo acesso</h2>
        <div className="acesso-novo">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome de quem vai usar (ex.: Toninho)"
            aria-label="Nome do acesso"
          />
          <select
            value={etapaId}
            onChange={(e) => setEtapaId(e.target.value)}
            aria-label="Posto"
          >
            <option value="">A oficina inteira</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {e.tipo_pedido !== "padrao" ? ` (${e.tipo_pedido.replace(/_/g, " ")})` : ""}
              </option>
            ))}
          </select>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="PIN (opcional)"
            inputMode="numeric"
            aria-label="PIN"
            className="campo-pin"
          />
          <button
            className="btn btn-aco"
            disabled={pendente || !nome.trim()}
            onClick={() => {
              executar(() => criarAcesso(nome, etapaId, pin));
              setNome("");
              setPin("");
            }}
          >
            Criar acesso
          </button>
        </div>
        <p className="ajuda">
          O PIN protege o link se o celular for perdido ou o link vazar num
          grupo. É pedido uma vez por celular.
        </p>
      </section>
    </div>
  );
}
