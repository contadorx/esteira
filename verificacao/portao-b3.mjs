/**
 * Portão do B3 — o quadro.
 *
 * O portão do bloco: abrir com massa e MEDIR que a soma dos cartões
 * renderizados = o contador de cada coluna = o KPI. Foi assim que apareceram,
 * no FinanceiroX, a barra que encolhia e a cor invertida — números que só
 * discordam quando alguém os soma.
 *
 * Verifica também os dois caminhos de mover (botão e arrasto), a trava de
 * concorrência e a regra 5 (cor só por prazo).
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b3.mjs
 *
 * Variáveis: BASE, EMAIL, SENHA.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "saojorge@esteira.dev";
const SENHA = process.env.SENHA ?? "esteira123";

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 950 } });
const pg = await ctx.newPage();

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("button[type=submit]");
await pg.waitForSelector(".quadro, .vazio, .falha", { timeout: 30000 });
checa("o quadro é a tela inicial do escritório", pg.url().endsWith("/app"), pg.url());

// ── 1) O PORTÃO: cartões = contador de coluna = KPI ────────────────
const medida = async () =>
  pg.evaluate(() => {
    const colunas = [...document.querySelectorAll(".coluna")].map((c) => ({
      nome: c.querySelector("h2")?.textContent ?? "?",
      contador: Number(c.querySelector(".coluna-qtd")?.textContent ?? "-1"),
      cartoes: c.querySelectorAll(".cartao").length,
    }));
    const kpis = [...document.querySelectorAll(".kpi")].map((k) => ({
      rotulo: k.querySelector(".r")?.textContent ?? "?",
      valor: Number(k.querySelector(".v")?.textContent ?? "-1"),
    }));
    return { colunas, kpis, totalCartoes: document.querySelectorAll(".cartao").length };
  });

const m = await medida();
const discordantes = m.colunas.filter((c) => c.contador !== c.cartoes);
checa(
  "PORTÃO B3: o contador de cada coluna = os cartões renderizados nela",
  discordantes.length === 0,
  discordantes.map((c) => `${c.nome}: ${c.contador}≠${c.cartoes}`).join("; ") ||
    m.colunas.map((c) => `${c.nome}=${c.cartoes}`).join(" "),
);

const kpiTotal = m.kpis.find((k) => /no quadro/i.test(k.rotulo))?.valor ?? -1;
const somaColunas = m.colunas.reduce((s, c) => s + c.cartoes, 0);
checa(
  "PORTÃO B3: o KPI 'No quadro' = a soma de todas as colunas",
  kpiTotal === somaColunas && somaColunas === m.totalCartoes,
  `KPI ${kpiTotal} × soma ${somaColunas} × DOM ${m.totalCartoes}`,
);

// Os KPIs de prazo têm que bater com as pills pintadas — a cor e o número
// vêm da mesma função, e é aqui que uma inversão apareceria.
const pills = await pg.evaluate(() => ({
  estourou: document.querySelectorAll(".cartao .pill.estourou").length,
  aperta: document.querySelectorAll(".cartao .pill.aperta").length,
  bordaEstourou: [...document.querySelectorAll(".cartao.estourou")].length,
}));
const kpiVenceu = m.kpis.find((k) => /venceu/i.test(k.rotulo))?.valor ?? -1;
const kpiAperta = m.kpis.find((k) => /aperta/i.test(k.rotulo))?.valor ?? -1;
checa("cor e número concordam: KPI 'Venceu' = pills vermelhas", kpiVenceu === pills.estourou, `${kpiVenceu} × ${pills.estourou}`);
checa("cor e número concordam: KPI 'Aperta' = pills âmbar", kpiAperta === pills.aperta, `${kpiAperta} × ${pills.aperta}`);
checa(
  "regra 5: a borda do cartão segue a mesma situação da pill",
  pills.bordaEstourou === pills.estourou,
  `${pills.bordaEstourou} × ${pills.estourou}`,
);

// ── 2) Mover pelo BOTÃO — o caminho garantido ─────────────────────
const primeiraColuna = pg.locator(".coluna").first();
const segundaColuna = pg.locator(".coluna").nth(1);
const antes1 = Number(await primeiraColuna.locator(".coluna-qtd").textContent());
const antes2 = Number(await segundaColuna.locator(".coluna-qtd").textContent());
const numeroMovido = (
  await primeiraColuna.locator(".cartao").first().locator(".cartao-num").textContent()
)?.replace("#", "");

await primeiraColuna.locator(".cartao").first().locator(".mini-btn.avancar").click();
await pg.waitForFunction(
  (esperado) =>
    Number(document.querySelector(".coluna .coluna-qtd")?.textContent) === esperado,
  antes1 - 1,
  { timeout: 30000 },
);
const depois1 = Number(await primeiraColuna.locator(".coluna-qtd").textContent());
const depois2 = Number(await segundaColuna.locator(".coluna-qtd").textContent());
checa(
  "botão ›: o cartão saiu da coluna e entrou na seguinte",
  depois1 === antes1 - 1 && depois2 === antes2 + 1,
  `${antes1}→${depois1} e ${antes2}→${depois2}`,
);
const ondeEsta = await pg.evaluate((num) => {
  const cartao = [...document.querySelectorAll(".cartao")].find((c) =>
    c.querySelector(".cartao-num")?.textContent?.includes(num),
  );
  return cartao?.closest(".coluna")?.querySelector("h2")?.textContent ?? null;
}, numeroMovido);
const nomeSegunda = await segundaColuna.locator("h2").textContent();
checa("botão ›: o cartão certo mudou de coluna", ondeEsta === nomeSegunda, `${numeroMovido} está em ${ondeEsta}`);

const m2 = await medida();
checa(
  "após mover: os números continuam concordando",
  m2.colunas.every((c) => c.contador === c.cartoes) &&
    m2.kpis.find((k) => /no quadro/i.test(k.rotulo))?.valor ===
      m2.colunas.reduce((s, c) => s + c.cartoes, 0),
);

// ── 3) Mover por ARRASTO — o acelerador ───────────────────────────
const alvoCol = pg.locator(".coluna").nth(2);
const antesAlvo = Number(await alvoCol.locator(".coluna-qtd").textContent());
const cartaoArrastar = segundaColuna.locator(".cartao").first();
const numArrastado = (await cartaoArrastar.locator(".cartao-num").textContent())?.replace("#", "");

const origem = await cartaoArrastar.locator(".cartao-alca").boundingBox();
const destino = await alvoCol.boundingBox();
await pg.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
await pg.mouse.down();
await pg.mouse.move(destino.x + destino.width / 2, destino.y + 60, { steps: 12 });
const voando = await pg.locator(".cartao-voando").count();
checa("arrasto: o cartão fantasma aparece durante o arrasto", voando === 1, `${voando}`);
const marcouAlvo = await alvoCol.evaluate((el) => el.classList.contains("alvo"));
checa("arrasto: a coluna sob o cursor se marca como alvo", marcouAlvo);
await pg.mouse.up();

await pg.waitForFunction(
  (esperado) =>
    Number(document.querySelectorAll(".coluna .coluna-qtd")[2]?.textContent) === esperado,
  antesAlvo + 1,
  { timeout: 30000 },
);
const ondeArrastado = await pg.evaluate((num) => {
  const cartao = [...document.querySelectorAll(".cartao")].find((c) =>
    c.querySelector(".cartao-num")?.textContent?.includes(num),
  );
  return cartao?.closest(".coluna")?.querySelector("h2")?.textContent ?? null;
}, numArrastado);
checa(
  "arrasto: o cartão foi para a coluna onde foi solto",
  ondeArrastado === (await alvoCol.locator("h2").textContent()),
  `${numArrastado} está em ${ondeArrastado}`,
);

// ── 4) A trava de concorrência (regra 7) ──────────────────────────
// Duas abas com o mesmo quadro: a segunda ainda acha que o pedido está onde
// estava. Ao movê-lo, precisa ouvir que perdeu — nunca um "pronto" mentiroso.
const pg2 = await ctx.newPage();
await pg2.goto(`${BASE}/app`, { waitUntil: "networkidle" });
await pg2.waitForSelector(".cartao", { timeout: 30000 });

const alvoConcorrencia = await pg2.evaluate(() => {
  const c = document.querySelector(".coluna .cartao");
  return c?.querySelector(".cartao-num")?.textContent?.replace("#", "") ?? null;
});
// A aba 1 move o cartão primeiro.
await pg.reload({ waitUntil: "networkidle" });
await pg.evaluate((num) => {
  const cartao = [...document.querySelectorAll(".cartao")].find((c) =>
    c.querySelector(".cartao-num")?.textContent?.includes(num),
  );
  cartao?.querySelector(".mini-btn.avancar")?.click();
}, alvoConcorrencia);
await pg.waitForTimeout(2500);

// A aba 2, desatualizada, tenta mover o mesmo cartão.
await pg2.evaluate((num) => {
  const cartao = [...document.querySelectorAll(".cartao")].find((c) =>
    c.querySelector(".cartao-num")?.textContent?.includes(num),
  );
  cartao?.querySelector(".mini-btn.avancar")?.click();
}, alvoConcorrencia);
await pg2.waitForSelector(".aviso-conflito, .falha", { timeout: 30000 });
const textoConflito = (await pg2.textContent(".aviso-conflito, .falha"))?.replace(/\s+/g, " ").trim();
checa(
  "trava: a aba desatualizada é avisada de que perdeu a disputa",
  /já tinha saído|não está mais aqui/i.test(textoConflito ?? ""),
  textoConflito,
);
await pg2.close();

// ── 5) Layout medido (regra 9) ────────────────────────────────────
for (const [nome, w, h] of [
  ["desktop", 1440, 950],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const sobra = await pg.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checa(`layout ${nome}: a página não rola de lado`, sobra <= 0, `${sobra}px`);
}
// O quadro largo precisa rolar DENTRO da própria faixa, não empurrar a página.
const rolaDentro = await pg.evaluate(() => {
  const rolo = document.querySelector(".quadro-rolo");
  return rolo ? getComputedStyle(rolo).overflowX : "";
});
checa("o quadro rola dentro da própria faixa", rolaDentro === "auto", rolaDentro);

console.log("\n=== PORTÃO B3 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
