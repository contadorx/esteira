import {
  brl,
  brlReais,
  percentualDoChao,
  type AcaoDoNegocio,
  type Negocio,
} from "@/lib/negocio";

/**
 * Componentes no escopo do MÓDULO (regra 6).
 *
 * `Bloco` mostra "—" quando o valor é nulo, e nunca 0. É a regra 3 aplicada a
 * dinheiro: numa base recém-nascida, quase tudo aqui é "ainda não" — e "ainda
 * não" desenhado como zero faz um produto que nem começou parecer um produto
 * que fracassou.
 */
function Bloco({
  titulo,
  valor,
  nota,
  tom,
}: {
  titulo: string;
  valor: string | null;
  nota?: string;
  tom?: "dinheiro" | "atencao" | "apagado";
}) {
  return (
    <div className={`neg-bloco${tom ? " t-" + tom : ""}`}>
      <p className="neg-bloco-t">{titulo}</p>
      <p className="neg-bloco-v mono">{valor ?? "—"}</p>
      {nota && <p className="neg-bloco-n">{nota}</p>}
    </div>
  );
}

const ROTULO_URGENCIA: Record<AcaoDoNegocio["urgencia"], string> = {
  alta: "agora",
  media: "esta semana",
  baixa: "quando der",
};

export default function PainelDoNegocio({ n }: { n: Negocio }) {
  const c = n.contagens;
  const pctChao = percentualDoChao(n.chao_30d, n.escritorio_30d);
  const baseVazia = c.total === 0;

  return (
    <div className="wrap-app neg-pagina">
      <h1>O negócio</h1>
      <p className="ajuda">
        Tudo nesta tela sai de uma consulta só, então a soma do topo confere com
        a lista de baixo, linha por linha.
      </p>

      {/*
        A HONESTIDADE QUE VEM ANTES DOS NÚMEROS.

        Com zero cliente pagando, este painel mostra R$ 0 — e R$ 0 aqui não
        significa que a receita caiu: significa que ela ainda não começou. Dizer
        isso na tela é mais útil do que qualquer gráfico.
      */}
      {n.mrr_centavos === 0 && (
        <p className="neg-nota-base" role="status">
          <b>Nenhuma oficina pagando ainda.</b> Os números de receita abaixo são
          zero porque a cobrança não começou, não porque alguém saiu. O que move
          isso não é esta tela — são as ligações.
        </p>
      )}

      {/* ── RECEITA RECORRENTE: promessa ───────────────────────────────── */}
      <h2 className="neg-secao">
        Receita recorrente <span>— o que a base vale por mês, se todo mundo ficar</span>
      </h2>
      <div className="neg-grade">
        <Bloco
          titulo="MRR"
          valor={brl(n.mrr_centavos)}
          nota={`${c.ativa} oficina(s) com pagamento confirmado`}
          tom="dinheiro"
        />
        <Bloco
          titulo="Em teste"
          valor={brl(n.mrr_teste_centavos)}
          nota={`${c.teste} em avaliação — vira MRR se pagarem`}
        />
        <Bloco
          titulo="Churn"
          valor={null}
          nota="precisa de histórico de pelo menos dois meses"
          tom="apagado"
        />
        <Bloco
          titulo="Base"
          valor={String(c.total)}
          nota={`${c.ativa} pagando · ${c.teste} testando · ${c.cancelada} canceladas`}
        />
      </div>

      {/* ── CAIXA: fato ─────────────────────────────────────────────────
          MRR é o que a base VALE; caixa é o que ENTROU. São dois blocos
          separados e nunca se somam (D33) — quem olha o extrato do banco faz
          a segunda pergunta, não a primeira. */}
      <h2 className="neg-secao">
        Caixa <span>— o que entrou de verdade, conferido no Asaas</span>
      </h2>
      <div className="neg-grade">
        <Bloco
          titulo="Recebido no mês"
          valor={brlReais(n.caixa.recebido_mes)}
          nota={`${n.caixa.pagas} cobrança(s) paga(s) no total`}
          tom="dinheiro"
        />
        <Bloco titulo="Recebido total" valor={brlReais(n.caixa.recebido_total)} nota="desde o começo" />
        <Bloco
          titulo="Em aberto"
          valor={brlReais(n.caixa.aberto)}
          nota="cobrança emitida, ainda no prazo"
        />
        <Bloco
          titulo="Vencido"
          valor={brlReais(n.caixa.vencido)}
          nota={`${n.caixa.vencidas} cobrança(s) venceram sem pagamento`}
          tom={Number(n.caixa.vencido) > 0 ? "atencao" : undefined}
        />
      </div>

      {/* ── A MÉTRICA QUE DECIDE O PRODUTO ──────────────────────────────── */}
      <h2 className="neg-secao">
        Quem faz o pedido andar <span>— a métrica que decide o produto</span>
      </h2>
      <div className="neg-metrica">
        {pctChao === null ? (
          <>
            <p className="neg-metrica-v mono">—</p>
            <p className="obs">
              Nenhum avanço de etapa em 30 dias. Isto <b>não é 0% de adoção do
              chão</b>: é ainda não ter o que medir. A conta começa no primeiro
              avanço gravado.
            </p>
          </>
        ) : (
          <>
            <p className="neg-metrica-v mono">{pctChao}%</p>
            <p className="obs">
              dos {n.chao_30d + n.escritorio_30d} avanços dos últimos 30 dias
              vieram do celular do chão ({n.chao_30d} do chão ·{" "}
              {n.escritorio_30d} do escritório). O portão 1 → 2 pede{" "}
              <b>≥ 70%</b>; abaixo de 40% depois de dois ajustes, a premissa do
              produto está errada.
            </p>
          </>
        )}
      </div>

      {/* ── A FILA DE AÇÃO ─────────────────────────────────────────────── */}
      <h2 className="neg-secao">
        O que fazer hoje <span>— nenhuma linha aqui é decorativa</span>
      </h2>

      {n.acoes.length === 0 ? (
        <p className="neg-vazio">
          {baseVazia
            ? "Nenhuma oficina cadastrada ainda — não há o que cobrar nem quem ativar."
            : "Nenhuma oficina precisa de você hoje. Nada vencendo, nada parado, nada no limite."}
        </p>
      ) : (
        <ul className="neg-acoes">
          {n.acoes.map((a, i) => (
            <li key={`${a.oficina_id}-${a.tipo}-${i}`} className={`neg-acao u-${a.urgencia}`}>
              {/* Nunca só a cor: a urgência vem escrita ao lado (regra 5). */}
              <span className={`selo-urg u-${a.urgencia}`}>{ROTULO_URGENCIA[a.urgencia]}</span>
              <div className="neg-acao-txt">
                <b>{a.tipo}</b>
                <p>
                  <a href={`/negocio/oficinas#of-${a.oficina_id}`}>{a.oficina}</a> ·{" "}
                  {a.detalhe}
                </p>
              </div>
              {a.valor_centavos ? (
                <span className="neg-acao-valor mono">{brl(a.valor_centavos)}/mês</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
