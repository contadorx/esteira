"use server";

/**
 * Mover pedido de etapa (B3).
 *
 * A regra 7 manda a trava para o banco: a condição "o pedido ainda está na
 * etapa que eu vi na tela" vai no `where` do update, não num `if` antes dele.
 * Duas pessoas com o quadro aberto vão empurrar o mesmo cartão — quem perder
 * precisa saber que perdeu, e não receber um "pronto" mentiroso (regra 2).
 *
 * E todo movimento grava em `avancos` com QUEM moveu, no formato
 * `escritorio:<user_id>` ou `chao:<acesso_id>`. Não é auditoria: é a métrica
 * nº 1 do produto — se o escritório for quem move, a premissa caiu.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";

export interface ResultadoMover {
  estado: "ok" | "conflito" | "erro";
  mensagem: string | null;
  /** Dados para avisar o cliente sem precisar sair do quadro. */
  avisar: {
    pedidoId: string;
    numero: string;
    cliente: string;
    fone: string | null;
    descricao: string | null;
    etapaAtual: string;
    previsao: string | null;
    tokenPublico: string;
    ultima: "pedido_avancou" | "pedido_pronto";
  } | null;
}

export async function moverPedido(
  pedidoId: string,
  etapaAtualEsperada: string,
  etapaDestino: string,
): Promise<ResultadoMover> {
  const { oficinaId, usuarioId } = await oficinaDaSessao();
  if (!oficinaId || !usuarioId) redirect("/entrar");
  const supabase = await clienteDoServidor();

  if (etapaAtualEsperada === etapaDestino) {
    return { estado: "ok", mensagem: null, avisar: null };
  }

  // A trava: só move se ainda estiver onde a tela achava que estava.
  const { data, error } = await supabase
    .from("pedidos")
    .update({ etapa_id: etapaDestino })
    .eq("id", pedidoId)
    .eq("etapa_id", etapaAtualEsperada)
    .select("id, numero, cliente_nome, cliente_fone, descricao, prazo, tipo_pedido, token_publico");

  if (error) {
    if (error.code === "23503")
      return {
        estado: "erro",
        mensagem: "Essa etapa não pertence a esta oficina.",
        avisar: null,
      };
    return { estado: "erro", mensagem: `Não consegui mover: ${error.message}`, avisar: null };
  }

  if (!data || data.length === 0) {
    // Nenhuma linha casou. Não sabemos POR QUE sem perguntar — então
    // perguntamos, em vez de chutar entre "sumiu" e "alguém moveu".
    const { data: atual } = await supabase
      .from("pedidos")
      .select("numero, etapas(nome)")
      .eq("id", pedidoId)
      .maybeSingle();

    if (!atual) {
      return {
        estado: "conflito",
        mensagem: "Este pedido não está mais aqui. Recarreguei o quadro.",
        avisar: null,
      };
    }
    const etapa = Array.isArray(atual.etapas) ? atual.etapas[0] : atual.etapas;
    return {
      avisar: null,
      estado: "conflito",
      mensagem:
        `O pedido ${atual.numero} já tinha saído dessa etapa` +
        (etapa?.nome ? ` — está em “${etapa.nome}”.` : ".") +
        " Alguém moveu antes de você.",
    };
  }

  const movido = data[0];

  // A trilha. Se ela falhar, o pedido JÁ mudou de etapa — e dizer "ok" aqui
  // esconderia um furo na métrica que decide o produto. Então falamos.
  const { error: erroTrilha } = await supabase.from("avancos").insert({
    pedido_id: pedidoId,
    etapa_id: etapaDestino,
    quem: `escritorio:${usuarioId}`,
  });

  revalidatePath("/app");
  revalidatePath("/app/pedidos");

  if (erroTrilha) {
    return {
      avisar: null,
      estado: "erro",
      mensagem:
        `O pedido ${movido.numero} mudou de etapa, mas não consegui registrar ` +
        `quem moveu (${erroTrilha.message}). O histórico ficou incompleto.`,
    };
  }

  // A etapa de destino é a última do caminho? Muda o template da mensagem.
  const { data: proximas } = await supabase
    .from("etapas")
    .select("id, ordem")
    .eq("tipo_pedido", movido.tipo_pedido ?? "padrao")
    .order("ordem", { ascending: false })
    .limit(1);
  const naUltima = proximas?.[0]?.id === etapaDestino;

  const { data: etapaDestinoInfo } = await supabase
    .from("etapas")
    .select("nome")
    .eq("id", etapaDestino)
    .maybeSingle();

  return {
    estado: "ok",
    mensagem: null,
    avisar: {
      pedidoId,
      numero: movido.numero,
      cliente: movido.cliente_nome,   // completo: vai na mensagem ao próprio cliente
      fone: movido.cliente_fone,
      descricao: movido.descricao,
      etapaAtual: etapaDestinoInfo?.nome ?? "—",
      previsao: movido.prazo,
      tokenPublico: movido.token_publico,
      ultima: naUltima ? "pedido_pronto" : "pedido_avancou",
    },
  };
}
