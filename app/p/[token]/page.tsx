import type { Metadata } from "next";
import { clienteAnonimo } from "@/lib/supabase/server";
import { curtaBR, diasAteOPrazo } from "@/lib/datas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Acompanhe seu pedido",
  // Link privado que circula no WhatsApp: fora do índice de buscador.
  robots: { index: false, follow: false },
};

interface EtapaPublica {
  nome: string;
  ordem: number;
  situacao: "cumprida" | "atual" | "a_fazer";
  quando: string | null;
}

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  return curtaBR(iso.slice(0, 10));
}

export default async function PaginaPedido({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = clienteAnonimo();
  const { data, error } = await supabase.rpc("pedido_publico", { p_token: token });

  // Regra 3: falha de rede não pode virar "pedido não existe". Para o cliente
  // final, essas duas frases significam coisas MUITO diferentes.
  if (error) {
    return (
      <main className="cli cli-aviso">
        <h1>Não consegui carregar agora</h1>
        <p>Tente de novo em um minuto. Seu pedido continua onde estava.</p>
      </main>
    );
  }

  if (data?.estado !== "ok") {
    return (
      <main className="cli cli-aviso">
        <h1>Link não encontrado</h1>
        <p>
          Confira o link com quem te enviou — ele pode ter sido copiado pela
          metade.
        </p>
      </main>
    );
  }

  const etapas = (data.etapas ?? []) as EtapaPublica[];
  const atual = etapas.find((e) => e.situacao === "atual");
  const faltam = etapas.filter((e) => e.situacao === "a_fazer").length;
  const dias = data.previsao ? diasAteOPrazo(data.previsao) : null;

  return (
    <main className="cli">
      <header className="cli-topo">
        <div className="cli-oficina">{data.oficina}</div>
        <div className="cli-num mono">Pedido #{data.numero}</div>
      </header>

      <section className="cli-cartao">
        <h1>{data.descricao ?? `Pedido #${data.numero}`}</h1>
        <p className="cli-ola">Veja em que ponto ele está:</p>

        <div className="cli-agora">
          <span className="cli-rotulo">Agora em</span>
          <b>{atual?.nome ?? data.etapa_atual ?? "—"}</b>
        </div>

        {/* Previsão dita como ela é: a data que a oficina informou. Nada de
            "chega amanhã" que o sistema não tem como garantir (regra 2). */}
        <div className="cli-previsao">
          {data.previsao ? (
            <>
              <span className="cli-rotulo">Previsão informada pela oficina</span>
              <b>
                {curtaBR(data.previsao)}
                {dias !== null && dias >= 0
                  ? dias === 0
                    ? " · hoje"
                    : ` · em ${dias} dia${dias > 1 ? "s" : ""}`
                  : ""}
              </b>
              {dias !== null && dias < 0 && (
                <span className="cli-atrasado">
                  A data prevista já passou. A oficina está com o pedido em
                  andamento.
                </span>
              )}
            </>
          ) : (
            <>
              <span className="cli-rotulo">Previsão</span>
              <b className="cli-sem">ainda não informada</b>
            </>
          )}
        </div>
      </section>

      <section className="cli-cartao">
        <h2>Por onde já passou</h2>
        <ol className="cli-passos">
          {etapas.map((e) => (
            <li key={e.ordem} className={`cli-passo ${e.situacao}`}>
              <span className="cli-ponto" aria-hidden="true" />
              <span className="cli-passo-nome">{e.nome}</span>
              <span className="cli-passo-quando">
                {e.situacao === "atual"
                  ? "agora"
                  : (dataCurta(e.quando) ?? (e.situacao === "cumprida" ? "concluída" : ""))}
              </span>
            </li>
          ))}
        </ol>
        {faltam > 0 && (
          <p className="cli-faltam">
            Faltam {faltam} etapa{faltam > 1 ? "s" : ""} até a entrega.
          </p>
        )}
      </section>

      <footer className="cli-rodape">
        Esta página se atualiza sozinha conforme o pedido anda. Guarde o link.
        <br />
        Dúvidas? Fale direto com a {data.oficina}.
      </footer>
    </main>
  );
}
