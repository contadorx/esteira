"use client";

/**
 * Editor de etapas. Componentes no escopo do MÓDULO (regra 6) — declarar
 * LinhaEtapa dentro daqui remontaria o <input> a cada tecla digitada.
 *
 * Todo botão que escreve mostra o que aconteceu: sucesso some sozinho, erro
 * fica na tela com o motivo apurado pelo servidor. Nada de "salvo" sem
 * confirmação (regras 1 e 2).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Pack } from "@/lib/packs";
import type { EtapaVista, Resposta } from "./tipos";
import {
  aplicarPack,
  criarEtapa,
  criarTipo,
  removerEtapa,
  renomearEtapa,
  reordenarEtapas,
} from "./acoes";

function rotuloTipo(tipo: string): string {
  const t = tipo.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function LinhaEtapa({
  etapa,
  primeira,
  ultima,
  ocupado,
  aoRenomear,
  aoMover,
  aoRemover,
}: {
  etapa: EtapaVista;
  primeira: boolean;
  ultima: boolean;
  ocupado: boolean;
  aoRenomear: (nome: string) => void;
  aoMover: (direcao: -1 | 1) => void;
  aoRemover: () => void;
}) {
  const [nome, setNome] = useState(etapa.nome);
  const mudou = nome.trim() !== etapa.nome;

  return (
    <li className="etapa-linha">
      <span className="etapa-ordem mono">{etapa.ordem}</span>

      <input
        className="etapa-nome"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && mudou) aoRenomear(nome);
          if (e.key === "Escape") setNome(etapa.nome);
        }}
        aria-label={`Nome da etapa ${etapa.nome}`}
      />

      {mudou && (
        <button
          className="mini-btn salvar"
          onClick={() => aoRenomear(nome)}
          disabled={ocupado}
        >
          salvar
        </button>
      )}

      <span className={`etapa-carga ${etapa.pedidos > 0 ? "tem" : ""}`}>
        {etapa.pedidos > 0 ? `${etapa.pedidos} aqui` : "vazia"}
      </span>

      <span className="etapa-botoes">
        <button
          className="mini-btn"
          onClick={() => aoMover(-1)}
          disabled={primeira || ocupado}
          aria-label="Subir"
          title="Subir"
        >
          ↑
        </button>
        <button
          className="mini-btn"
          onClick={() => aoMover(1)}
          disabled={ultima || ocupado}
          aria-label="Descer"
          title="Descer"
        >
          ↓
        </button>
        <button
          className="mini-btn remover"
          onClick={aoRemover}
          disabled={ocupado}
          aria-label={`Remover ${etapa.nome}`}
          title="Remover"
        >
          ×
        </button>
      </span>
    </li>
  );
}

function BlocoTipo({
  tipo,
  etapas,
  packs,
  ocupado,
  executar,
}: {
  tipo: string;
  etapas: EtapaVista[];
  packs: Pack[];
  ocupado: boolean;
  executar: (acao: () => Promise<Resposta>) => void;
}) {
  const [nova, setNova] = useState("");

  const mover = (indice: number, direcao: -1 | 1) => {
    const ids = etapas.map((e) => e.id);
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= ids.length) return;
    [ids[indice], ids[alvo]] = [ids[alvo], ids[indice]];
    executar(() => reordenarEtapas(tipo, ids));
  };

  return (
    <section className="tipo-bloco">
      <header className="tipo-cab">
        <h2>{rotuloTipo(tipo)}</h2>
        <span className="tipo-qtd">
          {etapas.length} {etapas.length === 1 ? "etapa" : "etapas"}
        </span>
      </header>

      {etapas.length === 0 ? (
        <div className="pack-oferta">
          <p className="ajuda">
            Sem etapas ainda. Escolha o pack do seu setor — depois é só ajustar
            os nomes para os que o seu pessoal usa.
          </p>
          <div className="pack-grade">
            {packs.map((p) => (
              <button
                key={p.id}
                className="pack-cartao"
                disabled={ocupado}
                onClick={() => executar(() => aplicarPack(tipo, p.id))}
              >
                <b>{p.setor}</b>
                <span className="pack-para">{p.paraQuem}</span>
                <span className="pack-etapas">{p.etapas.join(" › ")}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="etapa-lista">
          {etapas.map((e, i) => (
            <LinhaEtapa
              key={e.id}
              etapa={e}
              primeira={i === 0}
              ultima={i === etapas.length - 1}
              ocupado={ocupado}
              aoRenomear={(nome) => executar(() => renomearEtapa(e.id, nome))}
              aoMover={(d) => mover(i, d)}
              aoRemover={() => executar(() => removerEtapa(e.id))}
            />
          ))}
        </ul>
      )}

      <div className="etapa-nova">
        <input
          value={nova}
          onChange={(ev) => setNova(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && nova.trim()) {
              executar(() => criarEtapa(tipo, nova));
              setNova("");
            }
          }}
          placeholder="Nome da nova etapa"
          aria-label={`Nova etapa em ${rotuloTipo(tipo)}`}
        />
        <button
          className="btn btn-borda"
          disabled={ocupado || !nova.trim()}
          onClick={() => {
            executar(() => criarEtapa(tipo, nova));
            setNova("");
          }}
        >
          Adicionar etapa
        </button>
      </div>
    </section>
  );
}

export default function EditorEtapas({
  etapas,
  packs,
}: {
  etapas: EtapaVista[];
  packs: Pack[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [novoTipo, setNovoTipo] = useState("");
  const [packNovo, setPackNovo] = useState("");

  const executar = (acao: () => Promise<Resposta>) => {
    setResposta(null);
    iniciar(async () => {
      const r = await acao();
      setResposta(r);
      if (r.estado === "ok") router.refresh();
    });
  };

  const tipos = [...new Set(etapas.map((e) => e.tipo_pedido))].sort();
  if (tipos.length === 0) tipos.push("padrao");

  return (
    <div className="wrap-app estreito">
      <div className="app-cab">
        <div>
          <h1>Etapas</h1>
          <p className="ajuda">
            O caminho que um pedido percorre. É a única configuração que a
            Esteira exige — e cada tipo de pedido pode ter o seu.
          </p>
        </div>
      </div>

      {resposta?.estado === "erro" && (
        <div className="falha" role="alert">
          <b>Não deu.</b>
          <p>{resposta.mensagem}</p>
        </div>
      )}

      {tipos.map((tipo) => (
        <BlocoTipo
          key={tipo}
          tipo={tipo}
          etapas={etapas.filter((e) => e.tipo_pedido === tipo)}
          packs={packs}
          ocupado={pendente}
          executar={executar}
        />
      ))}

      <section className="tipo-novo">
        <h2>Outro tipo de pedido</h2>
        <p className="ajuda">
          Quando um tipo de serviço passa por um caminho diferente — bancada e
          escada na mesma marmoraria, por exemplo — ele vira um tipo próprio,
          com as etapas dele.
        </p>
        <div className="tipo-novo-form">
          <input
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value)}
            placeholder="Ex.: escada, manutenção, urgente"
            aria-label="Nome do tipo de pedido"
          />
          <select
            value={packNovo}
            onChange={(e) => setPackNovo(e.target.value)}
            aria-label="Pack inicial"
          >
            <option value="">Só a etapa “Recebido”</option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.setor}
              </option>
            ))}
          </select>
          <button
            className="btn btn-aco"
            disabled={pendente || !novoTipo.trim()}
            onClick={() => {
              executar(() => criarTipo(novoTipo, packNovo));
              setNovoTipo("");
            }}
          >
            Criar tipo
          </button>
        </div>
      </section>
    </div>
  );
}
