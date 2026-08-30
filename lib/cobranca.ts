/**
 * cobranca.ts — a porta única do pagamento (B11).
 *
 * Mesmo espírito do `lib/mensagem.ts` (D2): um lugar só fala com o provedor,
 * e o resto do produto não sabe o nome dele. Trocar Stripe por Asaas depois é
 * reescrever este arquivo, não caçar chamadas pelo aplicativo.
 *
 * ── O que é verdade e o que ainda não foi provado ─────────────
 * A verificação de assinatura do webhook (`conferirAssinatura`) é testada de
 * ponta a ponta no portão B11, com assinatura forjada e relógio adiantado —
 * ela não depende de conta em provedor nenhum. **Criar sessão de checkout e
 * de portal fala com a Stripe de verdade e NÃO foi executado**: não há chave
 * neste ambiente. Está escrito assim no `07-estado-do-projeto`, e a tela de
 * conta diz o mesmo para quem usa (regra 2 — não afirmar o que não se apurou).
 *
 * ── A fonte da verdade do "está pago" é o BANCO ───────────────
 * Nada aqui devolve "pagou". Quem escreve `assinaturas` é o webhook, com
 * service role; a tela lê a tabela. Se a Stripe cair, o produto continua
 * sabendo o que sabia — e não passa a achar que ninguém pagou.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

/** Códigos de plano que podem ser comprados (o `teste` não se compra). */
export const PLANOS_PAGOS = ["base", "medio", "grande"] as const;
export type PlanoPago = (typeof PLANOS_PAGOS)[number];

export function ehPlanoPago(codigo: string): codigo is PlanoPago {
  return (PLANOS_PAGOS as readonly string[]).includes(codigo);
}

function chave(): string | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  return k ? k : null;
}

/** O preço (price id) de cada plano vive no ambiente, não no código. */
function precoDoPlano(codigo: PlanoPago): string | null {
  const mapa: Record<PlanoPago, string | undefined> = {
    base: process.env.STRIPE_PRECO_BASE,
    medio: process.env.STRIPE_PRECO_MEDIO,
    grande: process.env.STRIPE_PRECO_GRANDE,
  };
  const v = mapa[codigo]?.trim();
  return v ? v : null;
}

/**
 * Cobrança está configurada? A tela precisa saber ANTES de mostrar um botão
 * de assinar — botão que sempre falha é pior que a frase "ainda não dá".
 */
export function cobrancaLigada(): boolean {
  return Boolean(chave()) && PLANOS_PAGOS.every((p) => precoDoPlano(p));
}

/** O que falta para ligar. Serve ao diagnóstico, sem expor valor nenhum. */
export function faltaParaCobrar(): string[] {
  const falta: string[] = [];
  if (!chave()) falta.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) falta.push("STRIPE_WEBHOOK_SECRET");
  for (const p of PLANOS_PAGOS) {
    if (!precoDoPlano(p)) falta.push(`STRIPE_PRECO_${p.toUpperCase()}`);
  }
  return falta;
}

export function enderecoDoSite(): string {
  const site = process.env.SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** POST form-urlencoded, que é o formato que a API da Stripe fala. */
async function postar(
  caminho: string,
  campos: Record<string, string>,
): Promise<{ dados: Record<string, unknown> | null; erro: string | null }> {
  const k = chave();
  if (!k) return { dados: null, erro: "cobrança não configurada (falta STRIPE_SECRET_KEY)" };

  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${k}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(campos).toString(),
    });
  } catch (e) {
    // Rede fora não pode virar "não pagou": vira "não consegui perguntar".
    return { dados: null, erro: `não consegui falar com a Stripe (${e instanceof Error ? e.message : String(e)})` };
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = (await resposta.json()) as Record<string, unknown>;
  } catch {
    return { dados: null, erro: `a Stripe respondeu ${resposta.status} sem JSON` };
  }
  if (!resposta.ok) {
    const err = corpo.error as { message?: string } | undefined;
    return { dados: null, erro: err?.message ?? `a Stripe respondeu ${resposta.status}` };
  }
  return { dados: corpo, erro: null };
}

/**
 * Sessão de checkout. `oficina_id` vai em `client_reference_id` E em
 * `metadata` — é por ele que o webhook sabe de quem é o pagamento, e um
 * pagamento que chega sem dono é dinheiro recebido sem serviço entregue.
 */
export async function criarCheckout(opcoes: {
  oficinaId: string;
  plano: PlanoPago;
  email: string | null;
  clienteExistente: string | null;
}): Promise<{ url: string | null; erro: string | null }> {
  const preco = precoDoPlano(opcoes.plano);
  if (!preco) return { url: null, erro: `o plano ${opcoes.plano} não tem preço configurado` };

  const base = enderecoDoSite();
  const campos: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": preco,
    "line_items[0][quantity]": "1",
    client_reference_id: opcoes.oficinaId,
    "metadata[oficina_id]": opcoes.oficinaId,
    "subscription_data[metadata][oficina_id]": opcoes.oficinaId,
    success_url: `${base}/app/conta?assinou=1`,
    cancel_url: `${base}/app/conta?assinou=0`,
    allow_promotion_codes: "true",
  };
  if (opcoes.clienteExistente) campos.customer = opcoes.clienteExistente;
  else if (opcoes.email) campos.customer_email = opcoes.email;

  const { dados, erro } = await postar("/checkout/sessions", campos);
  if (erro) return { url: null, erro };
  const url = dados?.url;
  if (typeof url !== "string") return { url: null, erro: "a Stripe não devolveu o endereço do checkout" };
  return { url, erro: null };
}

/** Portal do cliente: trocar cartão, ver faturas, cancelar. */
export async function criarPortal(
  clienteId: string,
): Promise<{ url: string | null; erro: string | null }> {
  const { dados, erro } = await postar("/billing_portal/sessions", {
    customer: clienteId,
    return_url: `${enderecoDoSite()}/app/conta`,
  });
  if (erro) return { url: null, erro };
  const url = dados?.url;
  if (typeof url !== "string") return { url: null, erro: "a Stripe não devolveu o endereço do portal" };
  return { url, erro: null };
}

/**
 * Confere a assinatura do webhook.
 *
 * ⚠ Esta função é a fechadura do cofre. Sem ela, qualquer um que descubra o
 * endereço manda um POST dizendo "fulano pagou" e ganha o produto de graça.
 * Por isso ela é escrita à mão, comentada, e testada no portão com assinatura
 * forjada, corpo adulterado e relógio fora da tolerância.
 *
 * O algoritmo é o da Stripe: o cabeçalho traz `t=<segundos>,v1=<hex>`, e o
 * que se assina é a string `"<t>.<corpo cru>"`. O corpo TEM que ser o cru,
 * byte a byte — reserializar o JSON muda um espaço e derruba a conferência.
 */
export function conferirAssinatura(opcoes: {
  corpoCru: string;
  cabecalho: string | null;
  segredo: string | null;
  agoraSegundos?: number;
  toleranciaSegundos?: number;
}): { ok: boolean; motivo: string | null } {
  const { corpoCru, cabecalho, segredo } = opcoes;
  const tolerancia = opcoes.toleranciaSegundos ?? 300;
  const agora = opcoes.agoraSegundos ?? Math.floor(Date.now() / 1000);

  if (!segredo) return { ok: false, motivo: "falta STRIPE_WEBHOOK_SECRET no servidor" };
  if (!cabecalho) return { ok: false, motivo: "requisição sem cabeçalho de assinatura" };

  let t: number | null = null;
  const assinaturas: string[] = [];
  for (const parte of cabecalho.split(",")) {
    const [chaveParte, valor] = parte.trim().split("=", 2);
    if (chaveParte === "t" && valor) t = Number(valor);
    if (chaveParte === "v1" && valor) assinaturas.push(valor);
  }
  if (t === null || Number.isNaN(t)) return { ok: false, motivo: "cabeçalho sem instante (t)" };
  if (assinaturas.length === 0) return { ok: false, motivo: "cabeçalho sem assinatura (v1)" };

  // Janela de tempo: sem ela, uma requisição legítima capturada hoje pode ser
  // reenviada daqui a um mês e continuar valendo.
  if (Math.abs(agora - t) > tolerancia) {
    return { ok: false, motivo: `assinatura fora da janela de ${tolerancia}s` };
  }

  const esperado = createHmac("sha256", segredo).update(`${t}.${corpoCru}`, "utf8").digest("hex");
  const esperadoBytes = Buffer.from(esperado, "utf8");

  // Comparação em tempo constante: `===` vaza, pelo tempo de resposta, quantos
  // caracteres iniciais bateram — e isso é o bastante para adivinhar o resto.
  const bate = assinaturas.some((a) => {
    const recebido = Buffer.from(a, "utf8");
    if (recebido.length !== esperadoBytes.length) return false;
    return timingSafeEqual(recebido, esperadoBytes);
  });

  return bate ? { ok: true, motivo: null } : { ok: false, motivo: "assinatura não confere" };
}

/** Só para o roteiro de verificação montar um cabeçalho legítimo. */
export function assinarParaTeste(corpoCru: string, segredo: string, t: number): string {
  const v1 = createHmac("sha256", segredo).update(`${t}.${corpoCru}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}
