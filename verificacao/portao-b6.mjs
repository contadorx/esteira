/**
 * Portão do B6 — o radar de atraso.
 *
 * O portão do roadmap: "para a massa do seed, o radar lista EXATAMENTE os
 * pedidos que a conta manda listar — verificação por caso construído, não por
 * olhada".
 *
 * A parte aritmética já é provada pela fumaça no banco, com pedidos montados
 * para cair em cada motivo e nos limites (véspera, folga de exatamente um dia,
 * parado há 1 vs 2 dias). Ver `supabase/migrations/20260830_radar.sql`.
 *
 * O que ESTE roteiro prova é a outra metade: que a tela mostra o que a conta
 * mandou, sem inventar nem esconder, e que ela não promete o envio automático
 * que ainda não existe (D9).
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b6.mjs
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
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const pg = await ctx.newPage();

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("button[type=submit]");
await pg.waitForSelector(".cartao, .vazio, .falha", { timeout: 30000 });

await pg.goto(`${BASE}/app/radar`, { waitUntil: "networkidle" });
await pg.waitForSelector(".radar-lista, .radar-limpo, .falha", { timeout: 30000 });
checa("o radar carrega", (await pg.locator(".falha").count()) === 0);

// ── 1) O PORTÃO: os KPIs = os itens de cada motivo na lista ───────
const medida = await pg.evaluate(() => {
  const kpi = (r) =>
    [...document.querySelectorAll(".kpi")]
      .filter((k) => new RegExp(r, "i").test(k.querySelector(".r")?.textContent ?? ""))
      .map((k) => Number(k.querySelector(".v")?.textContent))[0];
  return {
    venceu: kpi("venceu"),
    aperta: kpi("^aperta$"),
    parado: kpi("parado"),
    itens: {
      venceu: document.querySelectorAll(".radar-item.venceu").length,
      aperta: document.querySelectorAll(".radar-item.aperta").length,
      parado: document.querySelectorAll(".radar-item.parado").length,
    },
    total: document.querySelectorAll(".radar-item").length,
  };
});

for (const motivo of ["venceu", "aperta", "parado"]) {
  checa(
    `PORTÃO B6: o KPI "${motivo}" = os itens desse motivo na lista`,
    medida[motivo] === medida.itens[motivo],
    `${medida[motivo]} × ${medida.itens[motivo]}`,
  );
}
checa(
  "PORTÃO B6: a soma dos motivos = o tamanho da lista",
  medida.itens.venceu + medida.itens.aperta + medida.itens.parado === medida.total,
  `${medida.total} itens`,
);

// ── 2) Cada item explica o próprio motivo, com número ─────────────
if (medida.total > 0) {
  const motivos = await pg.locator(".radar-motivo").allTextContents();
  // O motivo tem que ser CONCRETO: ou traz um número ("faltam 2 dias e 3
  // etapas"), ou uma referência de tempo exata ("venceu ontem", "vence hoje").
  // Exigir número puro reprovaria "venceu ontem", que é a frase melhor.
  const vagos = motivos.filter((m) => !/\d/.test(m) && !/\b(ontem|hoje)\b/i.test(m));
  checa(
    "cada item diz POR QUE está na lista, de forma concreta",
    vagos.length === 0,
    vagos[0] ?? motivos[0],
  );

  // Vencidos primeiro: quem já estourou tem que estar no topo.
  const ordem = await pg.evaluate(() =>
    [...document.querySelectorAll(".radar-item")].map((i) =>
      i.classList.contains("venceu") ? 1 : i.classList.contains("aperta") ? 2 : 3,
    ),
  );
  checa(
    "a lista vem por gravidade: vencidos, depois quem aperta, depois parados",
    ordem.every((v, i) => i === 0 || ordem[i - 1] <= v),
    ordem.join(""),
  );

  // ── 3) A conta está escrita na tela, para o dono conferir ───────
  const explicacao = (await pg.textContent(".formato")) ?? "";
  checa(
    "a tela explica a conta em palavras",
    /uma etapa por dia/i.test(explicacao),
    explicacao.slice(0, 60),
  );
}

// ── 4) A mensagem do radar traz os mesmos pedidos da lista ────────
const texto = await pg.locator(".radar-copiar .aviso-texto").inputValue();
const numerosNaTela = await pg.locator(".radar-titulo .mono").allTextContents();
const faltandoNoTexto = numerosNaTela.filter((n) => !texto.includes(n.replace("#", "")));
checa(
  "PORTÃO B6: a mensagem contém exatamente os pedidos da lista",
  faltandoNoTexto.length === 0,
  faltandoNoTexto.join(", "),
);
checa(
  "a mensagem não tem campo vazio",
  !/undefined|null|NaN/.test(texto),
  texto.slice(0, 80),
);
// Nome de etapa é escrito pelo dono: não dá para saber o gênero. "está na
// Pronto" é o tipo de erro que custa credibilidade de graça.
checa(
  "a mensagem não tenta concordar com o nome da etapa",
  !/est[áa] n[ao] /i.test(texto),
  (texto.match(/.{0,30}est[áa] n[ao] .{0,20}/i) ?? [""])[0],
);

// ── 5) A tela NÃO promete o envio automático (D9) ─────────────────
const corpo = (await pg.textContent("body")) ?? "";
checa(
  "PORTÃO B6: a tela avisa que o envio automático ainda não existe",
  /não.{0,10}manda este radar sozinha ainda/i.test(corpo),
);
checa(
  "PORTÃO B6: a tela não promete mensagem às 7h",
  !/enviaremos|você receberá|todo dia às 7h a esteira manda/i.test(corpo),
);

await pg.locator(".radar-copiar button").click();
await pg.waitForSelector(".aviso-ok", { timeout: 20000 });
const conf = (await pg.textContent(".aviso-ok"))?.replace(/\s+/g, " ").trim() ?? "";
checa("a confirmação diz COPIADO e a hora", /copiado às \d{2}[:h]\d{2}/i.test(conf), conf);
checa("a confirmação não diz que alguém foi avisado", !/avisad|enviad/i.test(conf), conf);

// ── 6) A métrica nº 1 aparece — e distingue "zero" de "não sei" ───
const rodape = (await pg.textContent(".radar-metrica")) ?? "";
checa(
  "o rodapé traz a métrica do chão, ou admite que não sabe",
  /% dos \d+ avanços/.test(rodape) || /ainda não sei/i.test(rodape),
  rodape.replace(/\s+/g, " ").trim().slice(0, 90),
);

// ── 7) Layout medido (regra 9) ────────────────────────────────────
for (const [nome, w, h] of [
  ["desktop", 1280, 950],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto(`${BASE}/app/radar`, { waitUntil: "networkidle" });
  const sobra = await pg.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checa(`layout ${nome}: sem rolagem lateral`, sobra <= 0, `${sobra}px`);
}

console.log("\n=== PORTÃO B6 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
