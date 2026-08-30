/**
 * Portão do B4 — o celular do chão.
 *
 * Este é o bloco de que depende a métrica que decide o produto (≥70% dos
 * avanços feitos pelo chão). Se avançar não for trivial e confiável aqui,
 * o chão não usa, o escritório volta a atualizar, e a premissa central cai.
 *
 * O portão do roadmap, medido:
 *   1. dois avanços simultâneos do mesmo pedido → um ganha, o outro recebe
 *      estado honesto (nunca dois "pronto");
 *   2. token de outra oficina não vê nada — provado PELO APP, não pelo SQL;
 *   3. o avanço real acontece em DOIS TOQUES contados.
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b4.mjs
 *
 * Variáveis: BASE, TOKEN (acesso do chão), TOKEN_OUTRA (acesso de outra
 * oficina), TOKEN_PIN e PIN (acesso protegido).
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const TOKEN = process.env.TOKEN ?? "dev-toninho-corte";
const TOKEN_OUTRA = process.env.TOKEN_OUTRA ?? "dev-outra-oficina";
const TOKEN_PIN = process.env.TOKEN_PIN ?? "dev-ze-acabamento";
const PIN = process.env.PIN ?? "8765";

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

const navegador = await chromium.launch();
// Celular de verdade: viewport pequeno e ponteiro de toque.
const ctx = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const pg = await ctx.newPage();

// ── 1) Link inválido não abre nada ────────────────────────────────
await pg.goto(`${BASE}/c/token-que-nao-existe`, { waitUntil: "networkidle" });
const textoInvalido = (await pg.textContent("body"))?.replace(/\s+/g, " ") ?? "";
checa(
  "link inexistente: recusa sem vazar nada",
  /link sem uso|não vale mais/i.test(textoInvalido) &&
    !/pedido #|avançar para/i.test(textoInvalido),
  textoInvalido.slice(0, 60),
);

// ── 2) Sem senha: o painel abre direto ────────────────────────────
await pg.goto(`${BASE}/c/${TOKEN}`, { waitUntil: "networkidle" });
await pg.waitForSelector(".chao-item, .chao-vazio", { timeout: 30000 });
const itens = await pg.locator(".chao-item").count();
checa("painel abre sem senha e lista o que está com a pessoa", itens > 0, `${itens} pedidos`);

// D1: nada de dado sensível. Só o primeiro nome, nunca telefone.
const corpo = (await pg.textContent(".chao-lista")) ?? "";
checa(
  "D1: a tela do chão não mostra telefone do cliente",
  !/\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}/.test(corpo),
);

const alvos = await pg.evaluate(() =>
  [...document.querySelectorAll(".chao-btn.principal")].map(
    (b) => b.getBoundingClientRect().height,
  ),
);
checa(
  "alvos grandes o bastante para o polegar (≥56px)",
  alvos.length > 0 && alvos.every((h) => h >= 56),
  `menor: ${Math.min(...alvos)}px`,
);

// ── 3) O PORTÃO: avanço em DOIS TOQUES contados ───────────────────
const numeroAlvo = (await pg.locator(".chao-item").first().locator(".chao-num").textContent())
  ?.replace("#", "")
  .trim();
const antes = await pg.locator(".chao-item").count();

let toques = 0;
pg.on("console", () => {});
// toque 1 — o botão do pedido
await pg.locator(".chao-item").first().locator(".chao-btn.principal").tap();
toques++;
await pg.waitForSelector(".chao-confirma", { timeout: 10000 });
// toque 2 — confirmar
await pg.locator(".chao-confirma button[type=submit]").tap();
toques++;

await pg.waitForSelector(".chao-recado", { timeout: 30000 });
const recado = (await pg.textContent(".chao-recado"))?.replace(/\s+/g, " ").trim() ?? "";
checa("PORTÃO B4: o avanço acontece em 2 toques", toques === 2, `${toques} toques`);
checa(
  "PORTÃO B4: a confirmação diz o pedido e para onde foi",
  recado.includes(numeroAlvo ?? "###") && /→/.test(recado),
  recado,
);
// A afirmação é "ESTE pedido saiu", não "a lista encolheu um".
// Contar era um atalho, e um atalho instável: a lista revalida depois do
// recado aparecer, então a contagem pegava às vezes o render antigo e o
// portão piscava vermelho sem defeito nenhum. Portão que pisca ensina a
// rodar de novo até passar — que é o oposto do que ele serve.
const saiu = await pg
  .waitForFunction(
    (n) =>
      ![...document.querySelectorAll(".chao-num")].some((x) =>
        x.textContent.includes(n),
      ),
    numeroAlvo,
    { timeout: 15000 },
  )
  .then(() => true)
  .catch(() => false);
const depois = await pg.locator(".chao-item").count();
checa(
  "o pedido sai da lista do posto depois de avançar",
  saiu && depois <= antes - 1,
  `#${numeroAlvo}: ${antes} → ${depois}`,
);

// ── 4) CONCORRÊNCIA: dois celulares, o mesmo pedido ───────────────
const cel1 = await ctx.newPage();
const cel2 = await ctx.newPage();
await cel1.goto(`${BASE}/c/${TOKEN}`, { waitUntil: "networkidle" });
await cel2.goto(`${BASE}/c/${TOKEN}`, { waitUntil: "networkidle" });
await cel1.waitForSelector(".chao-item", { timeout: 30000 });
await cel2.waitForSelector(".chao-item", { timeout: 30000 });

const disputado = (await cel1.locator(".chao-item").first().locator(".chao-num").textContent())
  ?.replace("#", "")
  .trim();

// O celular 1 marca primeiro.
await cel1.locator(".chao-item").first().locator(".chao-btn.principal").tap();
await cel1.locator(".chao-confirma button[type=submit]").tap();
await cel1.waitForSelector(".chao-recado.bom", { timeout: 30000 });

// O celular 2 ainda tem a tela velha e marca o mesmo pedido.
await cel2.locator(".chao-item").first().locator(".chao-btn.principal").tap();
await cel2.locator(".chao-confirma button[type=submit]").tap();
await cel2.waitForSelector(".chao-recado", { timeout: 30000 });
const recado2 = (await cel2.textContent(".chao-recado"))?.replace(/\s+/g, " ").trim() ?? "";
checa(
  "PORTÃO B4: o segundo celular NÃO recebe um 'pronto' mentiroso",
  !(await cel2.locator(".chao-recado.bom").count()),
  recado2,
);
checa(
  "PORTÃO B4: o segundo celular ouve que alguém marcou antes",
  /já saiu desta etapa|marcou antes/i.test(recado2),
  recado2,
);
await cel1.close();
await cel2.close();
void disputado;

// ── 5) ISOLAMENTO: token de outra oficina não vê nada ─────────────
const outra = await ctx.newPage();
await outra.goto(`${BASE}/c/${TOKEN_OUTRA}`, { waitUntil: "networkidle" });
await outra.waitForSelector(".chao-item, .chao-vazio, .chao-aviso", { timeout: 30000 });
const corpoOutra = (await outra.textContent("body")) ?? "";
checa(
  "PORTÃO B4: token de outra oficina não vê pedido daqui (provado pelo app)",
  !corpoOutra.includes(numeroAlvo ?? "###") &&
    (await outra.locator(".chao-item").count()) === 0,
  `${await outra.locator(".chao-item").count()} itens`,
);
await outra.close();

// ── 6) PIN barra quem tem só o link ───────────────────────────────
const comPin = await ctx.newPage();
await comPin.goto(`${BASE}/c/${TOKEN_PIN}`, { waitUntil: "networkidle" });
await comPin.waitForSelector(".chao-pin, .chao-item", { timeout: 30000 });
checa(
  "PIN: o link protegido não abre sem os 4 dígitos",
  (await comPin.locator(".chao-pin").count()) === 1 &&
    (await comPin.locator(".chao-item").count()) === 0,
);

for (const d of PIN.split("")) {
  await comPin.locator(`.pin-tecla:text-is("${d}")`).tap();
}
await comPin.waitForSelector(".chao-item, .chao-vazio", { timeout: 30000 });
checa("PIN: com os 4 dígitos certos, o painel abre", (await comPin.locator(".chao-pin").count()) === 0);

await comPin.reload({ waitUntil: "networkidle" });
await comPin.waitForSelector(".chao-item, .chao-vazio, .chao-pin", { timeout: 30000 });
checa(
  "PIN: não é pedido de novo neste mesmo celular",
  (await comPin.locator(".chao-pin").count()) === 0,
);
await comPin.close();

// ── 7) Layout medido (regra 9) ────────────────────────────────────
await pg.goto(`${BASE}/c/${TOKEN}`, { waitUntil: "networkidle" });
const sobra = await pg.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
checa("layout do celular: sem rolagem lateral", sobra <= 0, `${sobra}px`);

console.log("\n=== PORTÃO B4 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
