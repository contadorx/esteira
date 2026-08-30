/**
 * Portão do B11 — a cobrança (Asaas).
 *
 * ── O que este roteiro protege ────────────────────────────────
 * O webhook é a ÚNICA porta que escreve "está pago". E o Asaas, ao contrário
 * da Stripe, **não assina os eventos**: ele manda um token estático no
 * cabeçalho `asaas-access-token`. Quem descobrir esse token forja qualquer
 * aviso, para sempre — não há HMAC nem janela de tempo para impedir.
 *
 * A resposta do produto é não acreditar no aviso: todo evento é **conferido
 * de volta na API do Asaas**, autenticado, antes de virar acesso. É isso que
 * este portão mede, e é o teste que mais importa aqui:
 *
 *   **um POST com o token certo dizendo "confirmada", sobre uma cobrança que
 *   o Asaas diz estar PENDENTE, não pode liberar nada.**
 *
 * O roteiro roda contra um Asaas de mentira, no mesmo servidor do stub, onde
 * o id da cobrança escolhe a resposta (`pay_confirmada`, `pay_pendente`,
 * `pay_vencida`, `pay_explode`, id desconhecido → 404).
 *
 * ── O que este roteiro NÃO prova ──────────────────────────────
 * A conversa com o Asaas de VERDADE: criar cliente, criar assinatura e abrir
 * a fatura. Isso precisa de chave e de conta, e está no
 * `docs/ligar-a-cobranca.md` como primeira execução real — não como feito.
 *
 * COMO RODAR
 *   export ASAAS_WEBHOOK_TOKEN=<o mesmo do .env.local>
 *   npm run build && npm run start
 *   node verificacao/portao-b11.mjs
 */

import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? "token-de-webhook-da-fumaca";
const ENDERECO = `${BASE}/api/cobranca/webhook`;

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

async function bater(corpo, token) {
  const r = await fetch(ENDERECO, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "asaas-access-token": token } : {}),
    },
    body: JSON.stringify(corpo),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* resposta sem json é resposta válida de teste */
  }
  return { status: r.status, json };
}

const eventoDeCobranca = (tipo, idCobranca) => ({
  id: "evt_1",
  event: tipo,
  dateCreated: "2026-08-30 10:00:00",
  payment: { id: idCobranca, customer: "cus_teste", subscription: "sub_teste", status: "CONFIRMED" },
});

// ── 1) sem token: a porta nem abre ────────────────────────────
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_confirmada"), null);
  checa("PORTÃO B11: POST sem token é recusado", r.status === 401, `HTTP ${r.status}`);
}

// ── 2) token errado ───────────────────────────────────────────
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_confirmada"), "token-errado");
  checa("PORTÃO B11: token errado é recusado", r.status === 401, `HTTP ${r.status}`);
}

// ── 3) token quase certo (um caractere a menos) ───────────────
// Comparação de tamanho antes do conteúdo não pode virar aceite.
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_confirmada"), TOKEN.slice(0, -1));
  checa("PORTÃO B11: token truncado é recusado", r.status === 401, `HTTP ${r.status}`);
}

// ── 4) O TESTE QUE DEFINE ESTE BLOCO ──────────────────────────
// Token certo, evento dizendo "confirmada", e o Asaas dizendo PENDENTE.
// Com a Stripe isto era impossível (o corpo era assinado); aqui é o ataque
// mais barato que existe, e ele tem que morrer na conferência.
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_pendente"), TOKEN);
  checa(
    "PORTÃO B11: aviso “pago” sobre cobrança PENDENTE no Asaas não libera nada",
    r.status === 200 && r.json?.estado === "ignorado",
    `HTTP ${r.status} ${r.json?.estado} — ${r.json?.motivo ?? r.json?.erro ?? ""}`,
  );
}

// ── 5) cobrança que não existe no Asaas ───────────────────────
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_inventada_por_atacante"), TOKEN);
  checa(
    "PORTÃO B11: aviso de cobrança inexistente é ignorado, não aplicado",
    r.status === 200 && r.json?.estado === "ignorado" && /não existe/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
}

// ── 6) Asaas fora do ar: 500, para reenviar ───────────────────
// Não conseguir perguntar NÃO é "não pagou" (regra 3).
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_explode"), TOKEN);
  checa(
    "PORTÃO B11: falha ao CONFERIR devolve 500 (o Asaas reenvia), nunca 200",
    r.status === 500,
    `HTTP ${r.status} ${r.json?.erro ?? ""}`,
  );
}

// ── 7) cobrança paga de outra oficina ─────────────────────────
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_sem_dono"), TOKEN);
  checa(
    "PORTÃO B11: cobrança conferida e sem dono não libera ninguém",
    r.status === 200 && r.json?.estado === "ignorado" && /oficina/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
}

// ── 8) evento que este produto não usa ────────────────────────
{
  const r = await bater(
    { event: "PAYMENT_BANK_SLIP_VIEWED", payment: { id: "pay_confirmada" } },
    TOKEN,
  );
  checa(
    "PORTÃO B11: evento irrelevante responde 200 e diz que ignorou",
    r.status === 200 && r.json?.estado === "ignorado",
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
}

// ── 9) o caminho certo grava ──────────────────────────────────
{
  const r = await bater(eventoDeCobranca("PAYMENT_CONFIRMED", "pay_confirmada"), TOKEN);
  checa(
    "PORTÃO B11: cobrança confirmada NO ASAAS é aplicada",
    r.status === 200 && r.json?.estado === "aplicado",
    `${r.json?.estado} — ${r.json?.motivo ?? r.json?.erro ?? ""}`,
  );
  checa(
    "o motivo diz até quando o acesso vale",
    /acesso até \d{4}-\d{2}-\d{2}/.test(r.json?.motivo ?? ""),
    r.json?.motivo ?? "",
  );
}

// ── 10) vencida vira pendência, não cancelamento ──────────────
{
  const r = await bater(eventoDeCobranca("PAYMENT_OVERDUE", "pay_vencida"), TOKEN);
  checa(
    "PORTÃO B11: cobrança vencida é aplicada como pendência de pagamento",
    r.status === 200 &&
      r.json?.estado === "aplicado" &&
      /não confirmado/i.test(r.json?.motivo ?? "") &&
      !/cancel/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
}

// ── 11) assinatura ATIVA não libera acesso sozinha ────────────
// Assinatura ativa não é mensalidade paga. Quem libera é a cobrança.
{
  const r = await bater(
    { event: "SUBSCRIPTION_UPDATED", subscription: { id: "sub_teste", status: "ACTIVE" } },
    TOKEN,
  );
  checa(
    "PORTÃO B11: assinatura ativa, sozinha, não vira acesso",
    r.status === 200 && r.json?.estado === "ignorado" && /cobrança paga/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
}

// ── 12) assinatura de outra pessoa, removida: não mexe em ninguém ──
{
  const r = await bater(
    { event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_sumida" } },
    TOKEN,
  );
  checa(
    "PORTÃO B11: assinatura removida que não é de ninguém daqui não mexe em nada",
    r.status === 200 && r.json?.estado === "ignorado" && /oficina/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
}

// ── 13) a assinatura DESTA oficina, removida no Asaas ─────────
// Reproduz a sequência real: a assinatura gravada aqui (`sub_teste`) passa a
// não existir lá, e o 404 é a CONFIRMAÇÃO do cancelamento.
{
  fs.writeFileSync("/tmp/plano-pago", "1");
  fs.writeFileSync("/tmp/assinatura-removida", "1");
  const r = await bater(
    { event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_teste" } },
    TOKEN,
  );
  fs.unlinkSync("/tmp/assinatura-removida");
  fs.unlinkSync("/tmp/plano-pago");
  checa(
    "PORTÃO B11: assinatura removida no Asaas vira cancelada",
    r.status === 200 && r.json?.estado === "aplicado" && /cancelada/i.test(r.json?.motivo ?? ""),
    `${r.json?.estado} — ${r.json?.motivo ?? ""}`,
  );
  checa(
    "e o motivo diz que o período já pago não é tirado",
    /sem tirar o período/i.test(r.json?.motivo ?? ""),
    r.json?.motivo ?? "",
  );
}

console.log("\n=== PORTÃO B11 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
console.log(
  "\nNÃO provado aqui: criar cliente, criar assinatura e abrir fatura no Asaas\n" +
    "de verdade (precisa de chave e conta). Ver docs/ligar-a-cobranca.md.",
);
if (falhas.some((f) => /token sem|POST sem token/.test(f) === false && /aplicada/.test(f))) {
  console.log(
    "\nDica: o servidor lê ASAAS_WEBHOOK_TOKEN do .env.local e este roteiro lê do\n" +
      "shell. Exporte o MESMO valor antes de rodar.",
  );
}
process.exit(falhas.length ? 1 : 0);
