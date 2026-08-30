import type { Metadata } from "next";
import { clienteDoServidor } from "@/lib/supabase/server";
import { curtaBR, diasAteOPrazo, situacaoDoPrazo } from "@/lib/datas";

export const metadata: Metadata = { title: "Pedidos — Esteira" };
export const dynamic = "force-dynamic";

interface Busca {
  novo?: string;
}

const ROTULO = {
  ok: "no prazo",
  aperta: "aperta",
  estourou: "venceu",
} as const;

export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const { novo } = await searchParams;
  const supabase = await clienteDoServidor();

  // Contagem e lista saem da MESMA consulta (regra 4): dois números que
  // precisam concordar não podem nascer em lugares diferentes.
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, numero, cliente_nome, descricao, prazo, origem, tipo_pedido, etapas(nome, ordem)")
    .order("criado_em", { ascending: false });

  // Regra 3: falha NÃO vira lista vazia. "Ainda não perguntei" e "não consegui"
  // são estados distintos de "não há pedidos".
  if (error) {
    return (
      <div className="wrap-app">
        <h1>Pedidos</h1>
        <div className="falha" role="alert">
          <b>Não consegui carregar os pedidos.</b>
          <p>{error.message}</p>
          <p className="obs">
            A tela não sabe quantos pedidos existem — este número não é zero, é
            desconhecido.
          </p>
        </div>
      </div>
    );
  }

  const pedidos = data ?? [];
  const total = pedidos.length;
  // A coluna Tipo só aparece quando existe mais de um caminho — numa oficina
  // com um tipo só ela seria uma coluna repetindo a mesma palavra.
  const tipos = new Set(pedidos.map((p) => p.tipo_pedido ?? "padrao"));
  const mostrarTipo = tipos.size > 1;
  const vencidos = pedidos.filter(
    (p) => p.prazo && situacaoDoPrazo(p.prazo) === "estourou",
  ).length;
  const apertando = pedidos.filter(
    (p) => p.prazo && situacaoDoPrazo(p.prazo) === "aperta",
  ).length;

  return (
    <div className="wrap-app">
      {novo && (
        <p className="ok-faixa" role="status">
          Pedido <b>#{novo}</b> cadastrado.
        </p>
      )}

      <div className="app-cab">
        <div>
          <h1>Pedidos</h1>
          <p className="ajuda">
            Todos os pedidos em uma tabela. Para trabalhar o dia, o{" "}
            <a href="/app">quadro</a> é melhor.
          </p>
        </div>
        <div className="app-acoes">
          <a className="btn btn-aco" href="/app/novo">
            Novo pedido
          </a>
          <a className="btn btn-borda" href="/app/importar">
            Importar CSV
          </a>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="r">Pedidos</div>
          <div className="v">{total}</div>
        </div>
        <div className="kpi risco">
          <div className="r">Aperta o prazo</div>
          <div className="v">{apertando}</div>
        </div>
        <div className="kpi mal">
          <div className="r">Venceu</div>
          <div className="v">{vencidos}</div>
        </div>
      </div>

      {total === 0 ? (
        <p className="vazio">
          Nenhum pedido ainda. Comece cadastrando um ou importando o CSV da sua
          planilha.
        </p>
      ) : (
        <div className="tabela-rolo">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Descrição</th>
                {mostrarTipo && <th>Tipo</th>}
                <th>Etapa</th>
                <th>Prazo</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const etapa = Array.isArray(p.etapas) ? p.etapas[0] : p.etapas;
                const situacao = p.prazo ? situacaoDoPrazo(p.prazo) : null;
                const dias = p.prazo ? diasAteOPrazo(p.prazo) : null;
                return (
                  <tr key={p.id}>
                    <td className="mono">{p.numero}</td>
                    <td>{p.cliente_nome}</td>
                    <td className="desc">{p.descricao ?? "—"}</td>
                    {mostrarTipo && (
                      <td className="origem">
                        {(p.tipo_pedido ?? "padrao").replace(/_/g, " ")}
                      </td>
                    )}
                    <td>{etapa?.nome ?? "—"}</td>
                    <td>
                      {p.prazo && situacao ? (
                        <span className={`pill ${situacao}`}>
                          {ROTULO[situacao]} · {curtaBR(p.prazo)}
                          {dias !== null && dias < 0 ? ` (${Math.abs(dias)}d)` : ""}
                        </span>
                      ) : (
                        <span className="sem-prazo">sem prazo</span>
                      )}
                    </td>
                    <td className="origem">{p.origem}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
