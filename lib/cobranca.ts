/**
 * cobranca.ts — a porta única do pagamento (B11, agora no **Asaas**).
 *
 * O D24 dizia que trocar de provedor seria reescrever este arquivo, e não
 * caçar chamadas pelo aplicativo. Foi: a troca de Stripe para Asaas mexeu
 * aqui, no `cobranca-eventos.ts` e na rota do webhook. Nenhuma tela precisou
 * saber o nome do provedor.
 *
 * ── Três diferenças que MUDAM o desenho, não só a URL ─────────
 *
 * 1. **O preço não vive no provedor.** Na Stripe cada plano era um `price_id`
 *    lá dentro, e o valor podia divergir do nosso. No Asaas a assinatura é
 *    criada com o `value` que NÓS mandamos — a tabela `planos` passa a ser a
 *    única fonte do preço, e a divergência deixa de ser possível.
 *
 * 2. **O webhook do Asaas não é assinado.** Ele autentica com um **token
 *    estático** no cabeçalho `asaas-access-token`. Não há HMAC, não há
 *    janela de tempo: quem descobrir o token forja qualquer evento, para
 *    sempre. Isso é um degrau abaixo do que a Stripe dava, e a resposta está
 *    escrita na rota do webhook — **nenhum evento vira acesso sem ser
 *    conferido de volta na API do Asaas**. O aviso do provedor passa a ser
 *    só um "vá olhar"; quem decide é a consulta autenticada.
 *
 * 3. **Criar cliente exige CPF/CNPJ.** É obrigatório na API do Asaas. Então
 *    ele é pedido no momento de assinar (não no cadastro — o teste continua
 *    sem fricção) e **não é guardado no nosso banco**: vai direto para o
 *    Asaas e some. O produto não guarda cadastro; essa é a fronteira escrita
 *    no `02-produto`, e ela vale também para o que é nosso.
 */

import { timingSafeEqual } from "node:crypto";

const PADRAO = "https://api.asaas.com/v3";

export const PLANOS_PAGOS = ["base", "medio", "grande"] as const;
export type PlanoPago = (typeof PLANOS_PAGOS)[number];

export function ehPlanoPago(codigo: string): codigo is PlanoPago {
  return (PLANOS_PAGOS as readonly string[]).includes(codigo);
}

function chave(): string | null {
  const k = process.env.ASAAS_API_KEY?.trim();
  return k ? k : null;
}

/** Sandbox e produção têm endereços diferentes; o ambiente escolhe. */
export function enderecoDaApi(): string {
  return (process.env.ASAAS_URL?.trim() || PADRAO).replace(/\/$/, "");
}

export function tokenDoWebhook(): string | null {
  const t = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  return t ? t : null;
}

/**
 * Cobrança está configurada? A tela precisa saber ANTES de mostrar um botão
 * de assinar — botão que sempre falha é pior que a frase "ainda não dá".
 */
export function cobrancaLigada(): boolean {
  return Boolean(chave());
}

/** O que falta para ligar. Serve ao diagnóstico, sem expor valor nenhum. */
export function faltaParaCobrar(): string[] {
  const falta: string[] = [];
  if (!chave()) falta.push("ASAAS_API_KEY");
  if (!tokenDoWebhook()) falta.push("ASAAS_WEBHOOK_TOKEN");
  return falta;
}

export function enderecoDoSite(): string {
  const site = process.env.SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

type Json = Record<string, unknown>;

/**
 * Uma chamada à API do Asaas. Rede fora e resposta estranha viram `erro` com
 * texto — nunca um `null` que o chamador confunda com "não existe" (regra 3).
 */
async function chamar(
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: Json,
): Promise<{ dados: Json | null; erro: string | null; httpStatus: number | null }> {
  const k = chave();
  if (!k) return { dados: null, erro: "cobrança não configurada (falta ASAAS_API_KEY)", httpStatus: null };

  let resposta: Response;
  try {
    resposta = await fetch(`${enderecoDaApi()}${caminho}`, {
      method: metodo,
      headers: {
        access_token: k,
        "Content-Type": "application/json",
        "User-Agent": "Esteira",
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    return {
      dados: null,
      httpStatus: null,
      erro: `não consegui falar com o Asaas (${e instanceof Error ? e.message : String(e)})`,
    };
  }

  let json: Json;
  try {
    json = (await resposta.json()) as Json;
  } catch {
    json = {};
  }

  if (!resposta.ok) {
    // O Asaas devolve { errors: [{ code, description }] }.
    const erros = json.errors;
    const primeiro = Array.isArray(erros) ? (erros[0] as Json | undefined) : undefined;
    const texto =
      (typeof primeiro?.description === "string" && primeiro.description) ||
      `o Asaas respondeu ${resposta.status}`;
    return { dados: null, erro: texto, httpStatus: resposta.status };
  }
  return { dados: json, erro: null, httpStatus: resposta.status };
}

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * O valor da cobrança, para o extrato (D30).
 *
 * O Asaas manda `value` como número em JSON, mas um valor que chega como
 * string ("139.00") não pode virar `null` em silêncio — seria uma fatura
 * gravada sem valor, e o painel somaria menos do que entrou sem dizer nada.
 * Devolve `null` só quando realmente não dá para ler um número.
 */
const numero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

/** Só dígitos: o Asaas recusa CPF/CNPJ com ponto e traço em alguns fluxos. */
export function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/**
 * CPF (11) ou CNPJ (14) com dígito verificador conferido.
 *
 * Vale a conta em vez de só contar caracteres: um número inventado passa no
 * tamanho, é aceito aqui, e só falha lá no Asaas — com uma mensagem em inglês
 * no meio do checkout. Conferir antes é o que permite dizer "esse CPF não
 * confere" na hora, no campo certo.
 */
export function documentoValido(bruto: string): boolean {
  const d = soDigitos(bruto);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const dig = (ate: number, peso: number) => {
      let s = 0;
      for (let i = 0; i < ate; i++) s += Number(d[i]) * (peso - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dig(9, 10) === Number(d[9]) && dig(10, 11) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (ate: number) => {
      const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
                               : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let s = 0;
      for (let i = 0; i < ate; i++) s += Number(d[i]) * pesos[i];
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

/** Cria o cliente no Asaas. `externalReference` é a nossa oficina. */
export async function criarCliente(opcoes: {
  oficinaId: string;
  nome: string;
  documento: string;
  email: string | null;
}): Promise<{ id: string | null; erro: string | null }> {
  const { dados, erro } = await chamar("POST", "/customers", {
    name: opcoes.nome,
    cpfCnpj: soDigitos(opcoes.documento),
    email: opcoes.email ?? undefined,
    externalReference: opcoes.oficinaId,
    notificationDisabled: false,
  });
  if (erro) return { id: null, erro };
  const id = texto(dados?.id);
  return id ? { id, erro: null } : { id: null, erro: "o Asaas não devolveu o id do cliente" };
}

/**
 * Cria a assinatura mensal.
 *
 * `billingType: UNDEFINED` de propósito: é o que deixa a pessoa escolher Pix,
 * boleto ou cartão na hora de pagar. Travar em cartão excluiria boa parte de
 * quem tem oficina.
 *
 * `externalReference` = oficina. É por ele (e pelo id da assinatura, que
 * guardamos) que o webhook descobre de quem é o pagamento — e pagamento sem
 * dono não vira acesso para ninguém.
 */
export async function criarAssinatura(opcoes: {
  oficinaId: string;
  clienteId: string;
  plano: PlanoPago;
  planoNome: string;
  centavos: number;
  primeiroVencimento: string;
}): Promise<{ id: string | null; erro: string | null }> {
  const { dados, erro } = await chamar("POST", "/subscriptions", {
    customer: opcoes.clienteId,
    billingType: "UNDEFINED",
    value: opcoes.centavos / 100,
    nextDueDate: opcoes.primeiroVencimento,
    cycle: "MONTHLY",
    description: `Esteira — plano ${opcoes.planoNome}`,
    externalReference: opcoes.oficinaId,
  });
  if (erro) return { id: null, erro };
  const id = texto(dados?.id);
  return id ? { id, erro: null } : { id: null, erro: "o Asaas não devolveu o id da assinatura" };
}

/**
 * O endereço da fatura em aberto — é para onde o dono vai pagar.
 * Devolve a cobrança mais recente que ainda não foi paga; se todas estiverem
 * pagas, devolve a última (serve de recibo).
 */
export async function faturaDaAssinatura(
  assinaturaId: string,
): Promise<{ url: string | null; status: string | null; erro: string | null }> {
  const { dados, erro } = await chamar("GET", `/subscriptions/${assinaturaId}/payments`);
  if (erro) return { url: null, status: null, erro };
  const lista = Array.isArray(dados?.data) ? (dados.data as Json[]) : [];
  if (lista.length === 0) {
    return { url: null, status: null, erro: "a assinatura ainda não gerou cobrança" };
  }
  const emAberto = lista.find((p) => {
    const s = texto(p.status);
    return s === "PENDING" || s === "OVERDUE" || s === "AWAITING_RISK_ANALYSIS";
  });
  const escolhida = emAberto ?? lista[lista.length - 1];
  const url = texto(escolhida.invoiceUrl);
  return url
    ? { url, status: texto(escolhida.status), erro: null }
    : { url: null, status: texto(escolhida.status), erro: "a cobrança não trouxe endereço de pagamento" };
}

/** Cancelar é remover a assinatura no Asaas: para de gerar cobrança nova. */
export async function cancelarAssinatura(
  assinaturaId: string,
): Promise<{ ok: boolean; erro: string | null }> {
  const { erro } = await chamar("DELETE", `/subscriptions/${assinaturaId}`);
  return erro ? { ok: false, erro } : { ok: true, erro: null };
}

/**
 * A conferência que substitui a assinatura criptográfica.
 *
 * O aviso do Asaas não prova nada — é um POST com um token que pode vazar.
 * Então, antes de liberar acesso, perguntamos à API **autenticada** qual é o
 * estado daquela cobrança. Um evento forjado morre aqui: ou a cobrança não
 * existe, ou ela não está paga.
 *
 * Devolve `erro` (e não "não pago") quando não consegue perguntar — a rota
 * transforma isso em 500 para o Asaas tentar de novo. Rede fora não pode
 * virar "não pagou" (regra 3).
 */
export async function conferirCobranca(cobrancaId: string): Promise<{
  status: string | null;
  vencimento: string | null;
  assinatura: string | null;
  cliente: string | null;
  referencia: string | null;
  /** os três campos abaixo existem para o extrato (D30), não para liberar acesso */
  valor: number | null;
  pagoEm: string | null;
  link: string | null;
  sumiu: boolean;
  erro: string | null;
}> {
  const vazio = {
    status: null, vencimento: null, assinatura: null, cliente: null, referencia: null,
    valor: null, pagoEm: null, link: null,
  };
  const { dados, erro, httpStatus } = await chamar("GET", `/payments/${cobrancaId}`);
  // 404 é resposta, não falha: essa cobrança não existe no Asaas — é o que
  // acontece com um aviso forjado. Devolver erro faria o Asaas reenviar para
  // sempre algo que nunca vai existir.
  if (httpStatus === 404) return { ...vazio, sumiu: true, erro: null };
  if (erro) return { ...vazio, sumiu: false, erro };
  return {
    status: texto(dados?.status),
    vencimento: texto(dados?.dueDate),
    assinatura: texto(dados?.subscription),
    cliente: texto(dados?.customer),
    referencia: texto(dados?.externalReference),
    valor: numero(dados?.value),
    // `paymentDate` é quando o Asaas registrou o pagamento; `clientPaymentDate`
    // é quando o cliente diz que pagou. Para o extrato vale o primeiro, e o
    // segundo só quando o primeiro não veio. Cobrança em aberto não tem
    // nenhum dos dois — e aí `pago_em` fica nulo, que é a verdade.
    pagoEm: texto(dados?.paymentDate) ?? texto(dados?.clientPaymentDate),
    link: texto(dados?.invoiceUrl),
    sumiu: false,
    erro: null,
  };
}

/** O mesmo, para a assinatura (usado quando o evento é de assinatura). */
export async function conferirAssinaturaNoProvedor(assinaturaId: string): Promise<{
  status: string | null;
  referencia: string | null;
  sumiu: boolean;
  erro: string | null;
}> {
  const { dados, erro, httpStatus } = await chamar("GET", `/subscriptions/${assinaturaId}`);
  // 404 não é falha: é a CONFIRMAÇÃO de que a assinatura foi removida. Tratar
  // como erro faria o Asaas reenviar para sempre um evento de cancelamento
  // que nunca seria aplicado.
  if (httpStatus === 404) return { status: null, referencia: null, sumiu: true, erro: null };
  if (erro) return { status: null, referencia: null, sumiu: false, erro };
  return {
    status: texto(dados?.status),
    referencia: texto(dados?.externalReference),
    sumiu: false,
    erro: null,
  };
}

/**
 * Confere o token do webhook.
 *
 * Comparação em tempo constante mesmo sendo "só" um token: `===` vaza, pelo
 * tempo de resposta, quantos caracteres iniciais bateram — e com um segredo
 * estático, que não muda a cada requisição, isso é explorável com paciência.
 */
export function conferirToken(recebido: string | null): { ok: boolean; motivo: string | null } {
  const esperado = tokenDoWebhook();
  if (!esperado) return { ok: false, motivo: "falta ASAAS_WEBHOOK_TOKEN no servidor" };
  if (!recebido) return { ok: false, motivo: "requisição sem token" };
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return { ok: false, motivo: "token não confere" };
  return timingSafeEqual(a, b)
    ? { ok: true, motivo: null }
    : { ok: false, motivo: "token não confere" };
}
