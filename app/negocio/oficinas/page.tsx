import type { Metadata } from "next";
import {
  brl,
  brlReais,
  carregarNegocio,
  percentualDoChao,
  type OficinaNoNegocio,
} from "@/lib/negocio";

export const metadata: Metadata = { title: "Oficinas — Esteira" };
export const dynamic = "force-dynamic";

/**
 * AS OFICINAS — e, ao mesmo tempo, a tela de suporte.
 *
 * "Suporte" não virou página própria de propósito. O cliente é dono de
 * marmoraria: ele não abre chamado, ele manda mensagem. O que falta quando o
 * telefone toca não é caixa de entrada — é CONTEXTO, em dois segundos, que é
 * o tempo que a ligação dá. Por isso cada oficina abre num cartão com tudo
 * junto: plano, uso, quem está fazendo o pedido andar, acessos entregues ao
 * chão e o que já foi pago.
 *
 * A busca é `<details>` + filtro no servidor? Não: a base cabe na tela por
 * muitos meses ainda, e um campo de busca que filtra 4 linhas é peça a mais
 * para manter. Quando passar de ~50 oficinas, entra a busca.
 */

const SELO: Record<string, { texto: string; classe: string }> = {
  ativa: { texto: "pagando", classe: "s-pagando" },
  teste: { texto: "em teste", classe: "s-teste" },
  vencida: { texto: "pagamento não confirmado", classe: "s-vencida" },
  cancelada: { texto: "cancelada", classe: "s-cancelada" },
};

function Selo({ status }: { status: string | null }) {
  // Sem assinatura é um estado real e ruim: cadastro que morreu no meio. Ele
  // não pode se parecer com "em teste" (regra 3).
  const s = status ? SELO[status] : { texto: "sem assinatura", classe: "s-nenhuma" };
  return <span className={`selo-neg ${s?.classe ?? "s-nenhuma"}`}>{s?.texto ?? status}</span>;
}

function Cartao({ o, hoje }: { o: OficinaNoNegocio; hoje: string }) {
  const pct = percentualDoChao(o.chao_30d, o.escritorio_30d);
  const diasAte =
    o.ate === null
      ? null
      : Math.round(
          (new Date(o.ate + "T12:00:00").getTime() - new Date(hoje + "T12:00:00").getTime()) /
            86_400_000,
        );

  return (
    <article className="neg-oficina" id={`of-${o.id}`}>
      <header>
        <h2>{o.nome}</h2>
        <Selo status={o.status} />
      </header>

      <dl className="neg-fichas">
        <div>
          <dt>Plano</dt>
          <dd>
            {o.plano_nome ?? "—"}
            {o.preco_centavos ? ` · ${brl(o.preco_centavos)}/mês` : ""}
          </dd>
        </div>
        <div>
          <dt>{o.status === "teste" ? "Teste até" : "Período até"}</dt>
          <dd>
            {o.ate
              ? `${new Date(o.ate + "T12:00:00").toLocaleDateString("pt-BR")}${
                  diasAte !== null
                    ? diasAte >= 0
                      ? ` (${diasAte} dia${diasAte === 1 ? "" : "s"})`
                      : ` (venceu há ${-diasAte})`
                    : ""
                }`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Pedidos</dt>
          <dd>
            {o.ativos} em andamento
            {o.limite ? ` de ${o.limite}` : ""} · {o.pedidos_total} no total
          </dd>
        </div>
        <div>
          <dt>Quem faz andar</dt>
          {/* O número que decide o produto, por cliente. "—" quando não houve
              avanço: zero avanços não é 0% de adoção (regra 3). */}
          <dd>
            {pct === null ? (
              <span className="incerto">nenhum avanço em 30 dias</span>
            ) : (
              <>
                <b>{pct}%</b> pelo chão ({o.chao_30d} chão · {o.escritorio_30d} escritório)
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Último avanço</dt>
          <dd>
            {o.ultimo_avanco
              ? new Date(o.ultimo_avanco + "T12:00:00").toLocaleDateString("pt-BR")
              : "nunca"}
          </dd>
        </div>
        <div>
          <dt>Acessos do chão</dt>
          <dd>
            {o.acessos === 0 ? (
              <span className="incerto">nenhum entregue</span>
            ) : (
              `${o.acessos} ativo(s)`
            )}
          </dd>
        </div>
        <div>
          <dt>Pessoas no escritório</dt>
          <dd>{o.pessoas}</dd>
        </div>
        <div>
          <dt>Já pagou</dt>
          <dd>
            {brlReais(o.pago_total)}
            {o.faturas_vencidas > 0 ? ` · ${o.faturas_vencidas} vencida(s)` : ""}
          </dd>
        </div>
      </dl>

      <footer className="neg-oficina-pe">
        <span className="obs">
          Entrou em {new Date(o.criado_em).toLocaleDateString("pt-BR")}
        </span>
        {/*
          NÃO existe botão de "entrar na conta" nem de editar nada daqui.
          A área de negócio LÊ; ela não escreve dentro da oficina. Entrar na
          conta alheia é impersonação auditada, e ela fica no B17 justamente
          porque com poucos clientes o telefone resolve — e porque a auditoria
          precisa gravar ANTES da entrada, ou não vale nada.
        */}
        <span className="obs">Somente leitura</span>
      </footer>
    </article>
  );
}

export default async function PaginaOficinas() {
  const leitura = await carregarNegocio();

  if (leitura.estado === "falha") {
    return (
      <div className="wrap-app estreito">
        <h1>Não consegui ler as oficinas</h1>
        <div className="falha" role="alert">
          <p>{leitura.erro}</p>
          <p className="obs">
            Lista vazia aqui seria mentira: pode haver oficinas que não consegui
            ler (regra 3).
          </p>
        </div>
      </div>
    );
  }
  if (leitura.estado === "restrito") {
    return (
      <div className="wrap-app estreito">
        <h1>Área restrita</h1>
      </div>
    );
  }

  const { n } = leitura;

  return (
    <div className="wrap-app neg-pagina">
      <h1>Oficinas</h1>
      <p className="ajuda">
        {n.contagens.total === 0
          ? "Nenhuma oficina cadastrada ainda."
          : `${n.contagens.total} oficina(s), da mais nova para a mais antiga. Esta é a tela para abrir quando o telefone tocar.`}
      </p>

      {n.contagens.sem_assinatura > 0 && (
        <p className="neg-nota-base" role="status">
          <b>
            {n.contagens.sem_assinatura} oficina(s) sem linha de assinatura.
          </b>{" "}
          É cadastro que morreu no meio: a oficina existe e não consegue nem
          cadastrar pedido. Ou se completa, ou se apaga — ficar é a única opção
          que não serve.
        </p>
      )}

      <div className="neg-oficinas">
        {n.oficinas.map((o) => (
          <Cartao key={o.id} o={o} hoje={n.hoje} />
        ))}
      </div>
    </div>
  );
}
