/**
 * cobranca-eventos.ts — a tradução do evento do provedor para o nosso estado.
 *
 * Está separado do `lib/cobranca.ts` de propósito: aqui não há rede, não há
 * chave e não há efeito colateral. É uma função pura de payload → o que
 * gravar. Assim ela é **testável sem conta em provedor nenhum**, e o portão
 * B11 a exercita com eventos montados à mão, incluindo os torcidos.
 *
 * ── A regra que define o desenho ──────────────────────────────
 * Evento que não sabemos interpretar NÃO vira gravação. Ele é ignorado com
 * motivo escrito e responde 200 — porque devolver erro faria a Stripe
 * reenviar para sempre, e devolver 200 fingindo que aplicou esconderia um
 * furo. "Ignorado porque X" é a terceira porta (regra 14).
 *
 * ── Por que `vencida` e não `cancelada` quando o cartão falha ─
 * São coisas diferentes: `vencida` é "o dinheiro não veio, a conta continua
 * de pé e destravável"; `cancelada` é "essa pessoa foi embora". Misturar as
 * duas faria o produto tratar um cartão recusado como uma despedida.
 */

export type StatusAssinatura = "teste" | "ativa" | "vencida" | "cancelada";

export interface PatchAssinatura {
  status?: StatusAssinatura;
  plano?: string;
  periodo_ate?: string | null;
  provedor?: string;
  provedor_cliente?: string | null;
  provedor_assinatura?: string | null;
}

export interface LeituraDoEvento {
  acao: "atualizar" | "ignorar";
  oficinaId: string | null;
  patch: PatchAssinatura | null;
  motivo: string;
}

type Json = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const objeto = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;

/** Segundos epoch → "AAAA-MM-DD". Sem passar por fuso: a data é a do provedor. */
function dataDeEpoch(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Date(v * 1000).toISOString().slice(0, 10);
}

/**
 * O status da Stripe traduzido no nosso.
 * `trialing` vira `ativa` de propósito: quem está em teste PELO PROVEDOR já
 * deu cartão — é diferente do nosso `teste`, que é o período sem cartão.
 */
function traduzirStatus(s: string | null): StatusAssinatura | null {
  switch (s) {
    case "active":
    case "trialing":
      return "ativa";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "vencida";
    case "canceled":
      return "cancelada";
    default:
      return null;
  }
}

/** O price id de volta ao código do plano, pelo mapa do ambiente. */
export function planoDoPreco(
  precoId: string | null,
  mapa: Record<string, string | undefined>,
): string | null {
  if (!precoId) return null;
  for (const [codigo, valor] of Object.entries(mapa)) {
    if (valor && valor.trim() === precoId) return codigo;
  }
  return null;
}

export function interpretarEvento(
  evento: unknown,
  mapaDePrecos: Record<string, string | undefined>,
): LeituraDoEvento {
  const evt = objeto(evento);
  const tipo = texto(evt?.type);
  const dados = objeto(objeto(evt?.data)?.object);
  if (!tipo || !dados) {
    return { acao: "ignorar", oficinaId: null, patch: null, motivo: "evento sem tipo ou sem objeto" };
  }

  const metadata = objeto(dados.metadata);
  const oficinaId =
    texto(metadata?.oficina_id) ?? texto(dados.client_reference_id) ?? null;

  switch (tipo) {
    case "checkout.session.completed": {
      if (!oficinaId)
        return {
          acao: "ignorar",
          oficinaId: null,
          patch: null,
          motivo: "checkout sem oficina_id — pagamento sem dono não vira acesso",
        };
      // Ainda não temos o período: ele chega em `customer.subscription.*`.
      // Gravar os ids agora é o que permite abrir o portal do cliente já.
      return {
        acao: "atualizar",
        oficinaId,
        motivo: "checkout concluído: guardando cliente e assinatura",
        patch: {
          provedor: "stripe",
          provedor_cliente: texto(dados.customer),
          provedor_assinatura: texto(dados.subscription),
        },
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (!oficinaId)
        return {
          acao: "ignorar",
          oficinaId: null,
          patch: null,
          motivo: "assinatura sem oficina_id no metadata",
        };

      const cancelada = tipo.endsWith("deleted");
      const status = cancelada ? "cancelada" : traduzirStatus(texto(dados.status));
      if (!status)
        return {
          acao: "ignorar",
          oficinaId,
          patch: null,
          motivo: `status "${texto(dados.status) ?? "?"}" não reconhecido — nada gravado`,
        };

      const itens = objeto(dados.items)?.data;
      const primeiro = Array.isArray(itens) ? objeto(itens[0]) : null;
      const precoId = texto(objeto(primeiro?.price)?.id);
      const plano = planoDoPreco(precoId, mapaDePrecos);

      const patch: PatchAssinatura = {
        status,
        provedor: "stripe",
        provedor_cliente: texto(dados.customer),
        provedor_assinatura: texto(dados.id),
        periodo_ate: dataDeEpoch(dados.current_period_end),
      };
      // Plano desconhecido não sobrescreve o que está gravado: melhor manter
      // o plano antigo e o acesso de pé do que zerar por um price novo que
      // ninguém mapeou ainda.
      if (plano) patch.plano = plano;

      return {
        acao: "atualizar",
        oficinaId,
        patch,
        motivo: plano
          ? `assinatura ${status} no plano ${plano}`
          : `assinatura ${status} (price ${precoId ?? "?"} não mapeado — plano mantido)`,
      };
    }

    case "invoice.payment_failed": {
      if (!oficinaId)
        return { acao: "ignorar", oficinaId: null, patch: null, motivo: "fatura sem oficina_id" };
      return {
        acao: "atualizar",
        oficinaId,
        patch: { status: "vencida", provedor: "stripe" },
        motivo: "pagamento não confirmado",
      };
    }

    default:
      return {
        acao: "ignorar",
        oficinaId,
        patch: null,
        motivo: `evento "${tipo}" não é usado por este produto`,
      };
  }
}
