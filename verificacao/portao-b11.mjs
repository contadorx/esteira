/**
 * Portão do B11 — a cobrança.
 *
 * ── O que este roteiro protege ────────────────────────────────
 * O webhook é a ÚNICA porta que escreve "está pago". Se ela aceitar um POST
 * forjado, qualquer pessoa que descubra o endereço libera o produto para si.
 * Não existe erro mais caro neste bloco — e, ao contrário do checkout, ele é
 * **inteiramente verificável sem conta em provedor nenhum**: a assinatura é
 * um HMAC que este roteiro sabe calcular.
 *
 * Por isso o portão bate na porta de sete jeitos: sem cabeçalho, com
 * assinatura errada, com assinatura de OUTRO segredo, com corpo adulterado
 * depois de assinado, com relógio fora da janela, com evento desconhecido e,
 * por fim, do jeito certo — conferindo que só o último grava.
 *
 * ── O que este roteiro NÃO prova ──────────────────────────────
 * Criar sessão de checkout e de portal fala com a Stripe de verdade. Sem
 * chave, isso não roda aqui — e está escrito no `07-estado-do-projeto` como
 * pendência, não como feito.
 *
 * COMO RODAR
 *   STRIPE_WEBHOOK_SECRET=... npm run build && npm run start
 *   node verificacao/portao-b11.mjs
 */
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SEGREDO = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_fumaca_da_esteira";
const ENDERECO = `${BASE}/api/cobranca/webhook`;

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

const agora = () => Math.floor(Date.now() / 1000);
const assinar = (corpo, segredo, t) =>
  `t=${t},v1=${createHmac("sha256", segredo).update(`${t}.${corpo}`, "utf8").digest("hex")}`;

async function bater(corpo, cabecalho) {
  const r = await fetch(ENDERECO, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cabecalho ? { "stripe-signature": cabecalho } : {}),
    },
    body: corpo,
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* resposta sem json é resposta válida de teste */
  }
  return { status: r.status, json };
}

const OFICINA = "a0000000-0000-4000-8000-000000000001";

const assinaturaAtiva = (extra = {}) =>
  JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_123",
        object: "subscription",
        status: "active",
        customer: "cus_123",
        current_period_end: 1789000000,
        metadata: { oficina_id: OFICINA },
        items: { data: [{ price: { id: "price_medio" } }] },
        ...extra,
      },
    },
  });

// ── 1) sem assinatura: a porta nem abre ───────────────────────
{
  const r = await bater(assinaturaAtiva(), null);
  checa("PORTÃO B11: POST sem assinatura é recusado", r.status === 400, `HTTP ${r.status}`);
}

// ── 2) assinatura inventada ───────────────────────────────────
{
  const corpo = assinaturaAtiva();
  const r = await bater(corpo, `t=${agora()},v1=${"a".repeat(64)}`);
  checa("PORTÃO B11: assinatura inventada é recusada", r.status === 400, `HTTP ${r.status}`);
}

// ── 3) assinatura de OUTRO segredo ────────────────────────────
{
  const corpo = assinaturaAtiva();
  const r = await bater(corpo, assinar(corpo, "whsec_de_outra_pessoa", agora()));
  checa(
    "PORTÃO B11: assinatura feita com outro segredo é recusada",
    r.status === 400,
    `HTTP ${r.status}`,
  );
}

// ── 4) corpo trocado DEPOIS de assinado ───────────────────────
// É o ataque real: pegar um evento legítimo e mudar o oficina_id.
{
  const original = assinaturaAtiva();
  const cabecalho = assinar(original, SEGREDO, agora());
  const adulterado = original.replace(OFICINA, "b0000000-0000-4000-8000-000000000002");
  const r = await bater(adulterado, cabecalho);
  checa(
    "PORTÃO B11: corpo adulterado depois de assinado é recusado",
    r.status === 400,
    `HTTP ${r.status}`,
  );
}

// ── 5) assinatura velha (reenvio) ─────────────────────────────
{
  const corpo = assinaturaAtiva();
  const velho = agora() - 3600;
  const r = await bater(corpo, assinar(corpo, SEGREDO, velho));
  checa(
    "PORTÃO B11: assinatura fora da janela de tempo é recusada",
    r.status === 400,
    `HTTP ${r.status}`,
  );
}

// ── 6) evento válido que este produto não usa ─────────────────
{
  const corpo = JSON.stringify({
    id: "evt_2",
    type: "customer.created",
    data: { object: { id: "cus_9", metadata: {} } },
  });
  const r = await bater(corpo, assinar(corpo, SEGREDO, agora()));
  checa(
    "PORTÃO B11: evento desconhecido responde 200 e diz que ignorou",
    r.status === 200 && r.json?.estado === "ignorado",
    `HTTP ${r.status} ${r.json?.motivo ?? ""}`,
  );
}

// ── 7) assinatura sem dono ────────────────────────────────────
// Pagamento que chega sem oficina_id não pode virar acesso para ninguém.
{
  const corpo = JSON.stringify({
    id: "evt_3",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_x",
        status: "active",
        customer: "cus_x",
        metadata: {},
        items: { data: [{ price: { id: "price_medio" } }] },
      },
    },
  });
  const r = await bater(corpo, assinar(corpo, SEGREDO, agora()));
  checa(
    "PORTÃO B11: assinatura sem oficina_id é ignorada, não aplicada",
    r.status === 200 && r.json?.estado === "ignorado",
    `HTTP ${r.status} ${r.json?.motivo ?? ""}`,
  );
}

// ── 8) o caminho certo grava ──────────────────────────────────
{
  const corpo = assinaturaAtiva();
  const r = await bater(corpo, assinar(corpo, SEGREDO, agora()));
  checa(
    "PORTÃO B11: evento legítimo é aplicado",
    r.status === 200 && r.json?.estado === "aplicado",
    `HTTP ${r.status} ${r.json?.motivo ?? r.json?.erro ?? ""}`,
  );
  checa(
    "o motivo aplicado nomeia o plano reconhecido pelo price",
    /plano medio/.test(r.json?.motivo ?? ""),
    r.json?.motivo ?? "",
  );
}

// ── 9) cartão recusado vira "vencida", não "cancelada" ────────
{
  const corpo = JSON.stringify({
    id: "evt_4",
    type: "invoice.payment_failed",
    data: { object: { id: "in_1", metadata: { oficina_id: OFICINA } } },
  });
  const r = await bater(corpo, assinar(corpo, SEGREDO, agora()));
  checa(
    "PORTÃO B11: pagamento falho é aplicado como pendência, com motivo",
    r.status === 200 && r.json?.estado === "aplicado" && /não confirmado/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} ${r.json?.motivo ?? ""}`,
  );
}

// ── 10) price desconhecido não zera o plano ───────────────────
{
  const corpo = assinaturaAtiva({ items: { data: [{ price: { id: "price_que_ninguem_mapeou" } }] } });
  const r = await bater(corpo, assinar(corpo, SEGREDO, agora()));
  checa(
    "price não mapeado mantém o plano e diz isso",
    r.status === 200 && /não mapeado — plano mantido/.test(r.json?.motivo ?? ""),
    r.json?.motivo ?? "",
  );
}

console.log("\n=== PORTÃO B11 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
console.log(
  "\nNÃO provado aqui: criar checkout e portal na Stripe (precisa de chave real).",
);
// Se ATÉ o evento legítimo foi recusado, o mais provável não é defeito: é o
// roteiro e o servidor estarem usando segredos diferentes. Dizer isso poupa
// uma hora de caça ao bug errado.
if (falhas.some((f) => /evento legítimo/.test(f))) {
  console.log(
    "\nDica: o servidor lê STRIPE_WEBHOOK_SECRET do .env.local e este roteiro lê do\n" +
      "shell. Exporte o MESMO valor antes de rodar:\n" +
      "  export STRIPE_WEBHOOK_SECRET=<o mesmo do .env.local>",
  );
}
process.exit(falhas.length ? 1 : 0);
