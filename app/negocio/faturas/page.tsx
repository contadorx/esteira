import type { Metadata } from "next";
import { clienteDoServidor } from "@/lib/supabase/server";
import { brlReais } from "@/lib/negocio";

export const metadata: Metadata = { title: "Faturas — Esteira" };
export const dynamic = "force-dynamic";

/**
 * O EXTRATO — o histórico do dinheiro (D30).
 *
 * Cada linha aqui foi gravada pelo webhook DEPOIS de conferir a cobrança na
 * API do Asaas, autenticado. Não é o que o aviso do webhook afirmou: é o que a
 * API respondeu. `status` é a resposta crua do Asaas — a evidência —, e
 * `situacao` é a nossa leitura dela, calculada no banco por coluna gerada,
 * para não existirem duas definições (regra 12).
 *
 * Antes desta tela, `assinaturas` guardava só o estado atual e cada pagamento
 * sobrescrevia o anterior: "quanto entrou em outubro" não era uma consulta
 * difícil, era uma consulta impossível.
 */

interface LinhaFatura {
  provedor_cobranca: string;
  valor: number | string | null;
  vencimento: string | null;
  pago_em: string | null;
  situacao: "paga" | "aberta" | "vencida" | "devolvida" | "outra";
  status: string;
  link: string | null;
  oficina: string;
  oficina_id: string;
}

const SITUACAO: Record<LinhaFatura["situacao"], string> = {
  paga: "paga",
  aberta: "em aberto",
  vencida: "vencida",
  devolvida: "devolvida",
  outra: "outra",
};

const dia = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";

export default async function PaginaFaturas() {
  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    return (
      <div className="wrap-app estreito">
        <h1>Não consegui ler o extrato</h1>
        <div className="falha" role="alert">
          <p>{e instanceof Error ? e.message : String(e)}</p>
        </div>
      </div>
    );
  }

  const { data, error } = await supabase.rpc("faturas_do_negocio");

  // Regra 3: consulta que falha não vira `?? []`. Uma tabela vazia aqui diria
  // "não entrou dinheiro nenhum", que é uma afirmação diferente de "não
  // consegui perguntar".
  if (error) {
    return (
      <div className="wrap-app estreito">
        <h1>Não consegui ler o extrato</h1>
        <div className="falha" role="alert">
          <p>{error.message}</p>
          <p className="obs">
            A lista não é mostrada de propósito: lista vazia aqui pareceria
            &ldquo;nenhuma cobrança&rdquo;.
          </p>
        </div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="wrap-app estreito">
        <h1>Área restrita</h1>
      </div>
    );
  }

  const linhas = data as LinhaFatura[];

  return (
    <div className="wrap-app neg-pagina">
      <h1>Faturas</h1>
      <p className="ajuda">
        Uma linha por cobrança do Asaas, gravada pelo webhook depois de conferir
        na API. Reenvio do mesmo aviso atualiza a linha; nunca cria uma segunda.
      </p>

      {linhas.length === 0 ? (
        <p className="neg-vazio">
          Nenhuma cobrança ainda. A primeira linha aparece aqui no minuto em que
          o Asaas confirmar o primeiro pagamento — e é por isso que esta tabela
          precisava existir <b>antes</b> dele, não depois.
        </p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>Oficina</th>
              <th>Vencimento</th>
              <th>Pago em</th>
              <th className="num">Valor</th>
              <th>Situação</th>
              <th>No Asaas</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((f) => (
              <tr key={f.provedor_cobranca}>
                <td>{f.oficina}</td>
                <td>{dia(f.vencimento)}</td>
                <td>{dia(f.pago_em)}</td>
                <td className="num mono">{brlReais(f.valor ?? 0)}</td>
                <td>
                  {/* Nunca só a cor (regra 5): a situação vem escrita, e o
                      status cru do Asaas fica ao lado como evidência. */}
                  <span className={`selo-fat f-${f.situacao}`}>{SITUACAO[f.situacao]}</span>{" "}
                  <span className="obs mono">{f.status}</span>
                </td>
                <td>
                  {f.link ? (
                    <a href={f.link} target="_blank" rel="noreferrer">
                      abrir
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
