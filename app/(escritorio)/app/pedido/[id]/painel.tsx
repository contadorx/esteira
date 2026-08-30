/**
 * A gaveta do pedido (B12) — "o que aconteceu com este?".
 *
 * Três honestidades desta tela:
 *
 *  1. **A linha do tempo mostra o que foi gravado, e só.** Um pedido
 *     importado de planilha não tem histórico anterior à Esteira; a tela diz
 *     isso em vez de desenhar etapas com datas inventadas.
 *  2. **"Deu problema" não é avanço.** Ele grava na mesma etapa e vem
 *     marcado; misturar os dois faria a linha do tempo contar uma história
 *     que não aconteceu.
 *  3. **Aviso é "copiado", nunca "avisado"** — o produto não tem como saber
 *     se a pessoa apertou enviar no WhatsApp dela (regra 2). O furo que
 *     originou essa regra era exatamente esta tela dizendo demais.
 *
 * Componente de servidor: não há nada para clicar além de links.
 */

import { curtaBR, horaCurta, situacaoDoPrazo } from "@/lib/datas";
import type { DetalheDoPedido, PassoDoPedido } from "./tipos";

const ROTULO_ORIGEM: Record<PassoDoPedido["origem"], string> = {
  entrada: "entrada",
  chao: "chão",
  escritorio: "escritório",
  outro: "—",
};

const ROTULO_AVISO: Record<string, string> = {
  copiado: "mensagem copiada",
  enviado: "enviada pelo canal",
  falhou: "falhou",
  nao_confirmado: "não confirmada",
};

function dataHora(iso: string): string {
  return `${curtaBR(iso.slice(0, 10))} às ${horaCurta(iso)}`;
}

export default function PainelPedido({
  d,
  fotos,
  erroFoto,
  faltaChave,
}: {
  d: DetalheDoPedido;
  fotos: Record<string, string>;
  erroFoto: string | null;
  /** Distinguir "falta configurar" de "deu erro" — as duas pedem ações
   *  diferentes, e mandar configurar uma chave que já existe manda a pessoa
   *  caçar o problema errado (regra 2). */
  faltaChave: boolean;
}) {
  const situacao = d.prazo ? situacaoDoPrazo(d.prazo) : null;
  const passos = d.linha_do_tempo ?? [];
  const temFoto = passos.some((p) => p.foto);

  return (
    <div className="wrap-app estreito">
      <div className="app-cab">
        <div>
          <a className="voltar" href="/app">
            ‹ voltar ao quadro
          </a>
          <h1>
            <span className="mono">#{d.numero}</span> {d.cliente}
          </h1>
          <p className="ajuda">{d.descricao ?? "sem descrição"}</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="r">Está em</div>
          <div className="v pedido-etapa">{d.etapa ?? "—"}</div>
          <div className="kpi-pe">
            {d.dias_aqui === 0 ? "chegou hoje" : `há ${d.dias_aqui} dia${d.dias_aqui > 1 ? "s" : ""}`}
          </div>
        </div>
        <div className="kpi">
          <div className="r">Prazo</div>
          <div className="v">{d.prazo ? curtaBR(d.prazo) : "—"}</div>
          {situacao && (
            <div className="kpi-pe">
              <span className={`pill ${situacao}`}>
                {situacao === "estourou" ? "venceu" : situacao === "aperta" ? "aperta" : "no prazo"}
              </span>
            </div>
          )}
        </div>
        <div className="kpi">
          <div className="r">Entrou na Esteira</div>
          <div className="v pedido-etapa">{curtaBR(d.criado_em.slice(0, 10))}</div>
          <div className="kpi-pe">por {d.origem === "csv" ? "planilha" : d.origem}</div>
        </div>
      </div>

      <section className="pedido-bloco">
        <h2>O caminho deste pedido</h2>
        <ol className="caminho">
          {d.caminho.map((e) => {
            const estado =
              d.etapa_ordem === null
                ? "a_fazer"
                : e.ordem < d.etapa_ordem
                  ? "cumprida"
                  : e.ordem === d.etapa_ordem
                    ? "atual"
                    : "a_fazer";
            return (
              <li key={e.ordem} className={`caminho-passo ${estado}`}>
                <span className="caminho-ponto" aria-hidden="true" />
                {e.nome}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="pedido-bloco">
        <h2>Linha do tempo</h2>
        {passos.length === 0 ? (
          <p className="tempos-na tempos-nenhum">
            Nada gravado ainda. Se este pedido veio de planilha, o que aconteceu
            antes da Esteira não está aqui — e inventar data seria mentir.
          </p>
        ) : (
          <ul className="linha-tempo">
            {passos.map((p) => (
              <li
                key={p.id}
                className={`lt-item${p.problema ? " problema" : ""}`}
                data-teste="passo"
                data-origem={p.origem}
              >
                <div className="lt-quando">{dataHora(p.quando)}</div>
                <div className="lt-corpo">
                  <div className="lt-titulo">
                    {p.problema ? (
                      <>
                        <b>Deu problema</b> em {p.etapa ?? "—"}
                      </>
                    ) : p.origem === "entrada" ? (
                      <>
                        Entrou em <b>{p.etapa ?? "—"}</b>
                      </>
                    ) : (
                      <>
                        Avançou para <b>{p.etapa ?? "—"}</b>
                      </>
                    )}
                  </div>
                  <div className="lt-quem">
                    {p.quem} <span className="obs">· {ROTULO_ORIGEM[p.origem]}</span>
                  </div>
                  {p.observacao && !p.problema && (
                    <div className="lt-obs">{p.observacao}</div>
                  )}
                  {p.problema && p.observacao && (
                    <div className="lt-obs">
                      {p.observacao.replace(/^PROBLEMA:\s*/i, "")}
                    </div>
                  )}
                  {p.foto &&
                    (fotos[p.foto] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img className="lt-foto" src={fotos[p.foto]} alt={`Foto do avanço em ${p.etapa ?? ""}`} />
                    ) : (
                      <div className="lt-foto-falta">
                        Tem foto neste avanço e não consegui exibir agora. A
                        foto não se perdeu — está guardada.
                      </div>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pedido-bloco">
        <h2>Mensagens ao cliente</h2>
        {d.avisos.length === 0 ? (
          <p className="tempos-na tempos-nenhum">
            Nenhuma mensagem registrada para este pedido.
          </p>
        ) : (
          <ul className="lista-avisos">
            {d.avisos.map((a, i) => (
              <li key={i} data-teste="aviso">
                <b>{ROTULO_AVISO[a.status] ?? a.status}</b> em {dataHora(a.quando)}
                {a.destino ? ` · ${a.destino}` : ""}
                {a.erro && <div className="obs">{a.erro}</div>}
              </li>
            ))}
          </ul>
        )}
        <p className="obs">
          A Esteira registra o que ela pode provar: que a mensagem foi copiada.
          Se você apertou enviar no WhatsApp, isso acontece fora daqui.
        </p>
      </section>

      <section className="pedido-bloco">
        <h2>Link do cliente</h2>
        <p className="ajuda">
          Esta é a página que o seu cliente abre. Ela não mostra o nome dele,
          nem telefone, nem observação interna — o link pode ser reencaminhado.
        </p>
        <code className="pedido-link">/p/{d.token_publico}</code>
        <div className="form-acoes">
          <a className="btn btn-borda" href={`/p/${d.token_publico}`} target="_blank" rel="noreferrer">
            Abrir como o cliente vê
          </a>
        </div>
      </section>

      {temFoto && erroFoto && (
        <p className="aviso-parcial" role="status">
          {faltaChave ? (
            <>
              Este pedido tem foto e a exibição está desligada: falta{" "}
              <code>SUPABASE_SECRET_KEY</code> no servidor. As imagens estão
              guardadas e aparecem assim que a chave for configurada.
            </>
          ) : (
            <>
              Este pedido tem foto e não consegui gerar o endereço de exibição
              ({erroFoto}). A imagem não se perdeu — tente recarregar.
            </>
          )}
        </p>
      )}
    </div>
  );
}
