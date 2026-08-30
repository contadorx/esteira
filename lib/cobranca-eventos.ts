/**
 * cobranca-eventos.ts — do aviso do Asaas até o que gravar.
 *
 * Continua sem rede, sem chave e sem efeito colateral: são funções puras de
 * payload → decisão. É o que as torna testáveis sem conta em provedor nenhum,
 * e o portão B11 as exercita com eventos montados à mão, inclusive torcidos.
 *
 * ── A mudança que o Asaas trouxe ──────────────────────────────
 * A Stripe assinava cada evento com HMAC; dava para provar que o corpo veio
 * dela e não foi mexido. O Asaas autentica com um **token estático** no
 * cabeçalho: quem descobrir o token forja qualquer evento, para sempre.
 *
 * Por isso o caminho aqui tem DUAS etapas, e não uma:
 *   1. `interpretarEvento` diz apenas **o que ir conferir** (uma cobrança ou
 *      uma assinatura). Ele não produz mais nenhum estado sozinho.
 *   2. `patchDaCobranca` / `patchDaAssinatura` transformam em gravação o que
 *      voltou da **consulta autenticada** ao Asaas.
 *
 * Ou seja: o aviso virou um "vá olhar". O que decide é a API. Um POST forjado
 * com o token certo, no máximo, faz o servidor perguntar ao Asaas — e ouvir
 * que a cobrança não existe ou não está paga.
 */

import { diaMaior, mesSeguinte } from "@/lib/datas";

export type StatusAssinatura = "teste" | "ativa" | "vencida" | "cancelada";

export interface PatchAssinatura {
  status?: StatusAssinatura;
  periodo_ate?: string | null;
  provedor?: string;
  provedor_cliente?: string | null;
  provedor_assinatura?: string | null;
}

export type LeituraDoEvento =
  | { acao: "conferir_cobranca"; cobrancaId: string; motivo: string }
  | { acao: "conferir_assinatura"; assinaturaId: string; motivo: string }
  | { acao: "ignorar"; motivo: string };

type Json = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const objeto = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;

/**
 * Eventos de cobrança que MEXEM no acesso. Os outros (boleto visualizado,
 * split liquidado, análise de risco…) existem e não dizem nada sobre estar
 * pago — não vale acordar o servidor por eles.
 */
const COBRANCA_RELEVANTE = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_RECEIVED_IN_CASH",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_UPDATED",
]);

const ASSINATURA_RELEVANTE = new Set([
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_UPDATED",
]);

export function interpretarEvento(evento: unknown): LeituraDoEvento {
  const evt = objeto(evento);
  const tipo = texto(evt?.event);
  if (!tipo) return { acao: "ignorar", motivo: "evento sem tipo" };

  if (COBRANCA_RELEVANTE.has(tipo)) {
    const cobranca = objeto(evt?.payment);
    const id = texto(cobranca?.id);
    if (!id) return { acao: "ignorar", motivo: `${tipo} sem id de cobrança` };
    return { acao: "conferir_cobranca", cobrancaId: id, motivo: tipo };
  }

  if (ASSINATURA_RELEVANTE.has(tipo)) {
    const assinatura = objeto(evt?.subscription);
    const id = texto(assinatura?.id);
    if (!id) return { acao: "ignorar", motivo: `${tipo} sem id de assinatura` };
    return { acao: "conferir_assinatura", assinaturaId: id, motivo: tipo };
  }

  return { acao: "ignorar", motivo: `evento "${tipo}" não é usado por este produto` };
}

/** Os status de cobrança do Asaas que significam "o dinheiro entrou". */
const PAGOS = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
/** Os que significam "não entrou, e a conta está em atraso". */
const ATRASADOS = new Set([
  "OVERDUE",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

export interface CobrancaConferida {
  status: string | null;
  vencimento: string | null;
  assinatura: string | null;
  cliente: string | null;
}

/**
 * O que gravar a partir de uma cobrança já CONFERIDA na API.
 *
 * `hoje` entra por parâmetro, e vem de `lib/datas.hoje()` — o único relógio
 * do produto (regra 8). Não existe `new Date()` aqui dentro.
 *
 * **Até quando vale o período pago:** um mês a partir do vencimento OU de
 * hoje, o que for maior. Só o vencimento puniria quem pagou com quarenta dias
 * de atraso — o dinheiro entrou, e a pessoa ficaria travada mesmo assim.
 */
export function patchDaCobranca(
  c: CobrancaConferida,
  hoje: string,
): { patch: PatchAssinatura | null; motivo: string } {
  const s = c.status ?? "";
  if (PAGOS.has(s)) {
    const base = c.vencimento ? diaMaior(c.vencimento, hoje) : hoje;
    return {
      patch: {
        status: "ativa",
        periodo_ate: mesSeguinte(base),
        provedor: "asaas",
        provedor_cliente: c.cliente,
        provedor_assinatura: c.assinatura,
      },
      motivo: `cobrança ${s.toLowerCase()} — acesso até ${mesSeguinte(base)}`,
    };
  }
  if (ATRASADOS.has(s)) {
    return {
      patch: { status: "vencida", provedor: "asaas" },
      motivo: `cobrança ${s.toLowerCase()} — pagamento não confirmado`,
    };
  }
  // PENDING, AWAITING_RISK_ANALYSIS, DELETED… são estados legítimos que não
  // dizem nada sobre acesso. Ignorar com motivo é a terceira porta (regra 14).
  return { patch: null, motivo: `cobrança em "${s || "?"}" — nada a mudar` };
}

/**
 * O que gravar a partir de uma assinatura conferida.
 *
 * `sumiu` (404 na API) é a **confirmação** do cancelamento, não uma falha:
 * assinatura removida no Asaas não existe mais para ser consultada.
 *
 * Cancelar NÃO tira o acesso na hora — `periodo_ate` continua valendo, e
 * `conta_da_oficina` respeita isso. Quem cancela no dia 2 pagou até o fim do
 * período; travar na hora seria ficar com o dinheiro e tirar o serviço.
 */
export function patchDaAssinatura(a: {
  status: string | null;
  sumiu: boolean;
}): { patch: PatchAssinatura | null; motivo: string } {
  if (a.sumiu) {
    return {
      patch: { status: "cancelada", provedor: "asaas" },
      motivo: "assinatura removida no Asaas — cancelada, sem tirar o período já pago",
    };
  }
  const s = (a.status ?? "").toUpperCase();
  if (s === "INACTIVE" || s === "EXPIRED") {
    return {
      patch: { status: "cancelada", provedor: "asaas" },
      motivo: `assinatura ${s.toLowerCase()} no Asaas`,
    };
  }
  if (s === "ACTIVE") {
    // Assinatura ativa não é o mesmo que mensalidade paga: quem diz isso é a
    // cobrança. Gravar "ativa" aqui liberaria acesso sem dinheiro nenhum.
    return { patch: null, motivo: "assinatura ativa — quem libera acesso é a cobrança paga" };
  }
  return { patch: null, motivo: `assinatura em "${s || "?"}" — nada a mudar` };
}
