/**
 * Portão do B2 — etapas configuráveis e packs de setor.
 *
 * O portão do bloco é um CRONÔMETRO: "oficina nova configurada em menos de 30
 * minutos". A promessa de venda é implantação numa tarde, então a configuração
 * tem que sobrar tempo — e tempo se mede, não se estima.
 *
 * Mede também as travas que a regra 13 exige: mexer em etapa é mexer em onde
 * os pedidos estão, e o conserto não pode sair pior que o problema.
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b2.mjs
 *
 * Variáveis: BASE, EMAIL, SENHA.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "saojorge@esteira.dev";
const SENHA = process.env.SENHA ?? "esteira123";
const LIMITE_MINUTOS = 30;

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

const navegador = await chromium.launch();
const pg = await navegador.newPage({ viewport: { width: 1280, height: 900 } });

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("button[type=submit]");
// `/app` é o QUADRO desde o B3 — esperar por `.tabela` aqui só passava
// quando a oficina não tinha etapa nenhuma (regra 15).
await pg.waitForSelector(".cartao, .coluna, .vazio, .falha", { timeout: 30000 });

// ── 1) A tela carrega e mostra a carga de cada etapa ──────────────
// Tudo daqui até o item 3 é escopado ao bloco do tipo "padrao": a tela tem
// um bloco por tipo de pedido, e `.etapa-linha` solto atravessa todos eles.
await pg.goto(`${BASE}/app/etapas`, { waitUntil: "networkidle" });
const padrao = pg.locator("section.tipo-bloco").filter({ hasText: "Padrao" });
const linhas = await padrao.locator(".etapa-linha").count();
checa("etapas: a tela lista as etapas configuradas", linhas > 0, `${linhas} linhas`);

const comCarga = await padrao.locator(".etapa-carga.tem").count();
checa("etapas: mostra quantos pedidos estão em cada etapa", comCarga > 0, `${comCarga} com carga`);

// ── 2) Remover etapa EM USO precisa ser recusada, com número real ──
const idxOcupada = await padrao.evaluate((bloco) => {
  const linhas = [...bloco.querySelectorAll(".etapa-linha")];
  return linhas.findIndex((l) => l.querySelector(".etapa-carga.tem"));
});
if (idxOcupada >= 0) {
  const antes = await padrao.locator(".etapa-linha").count();
  await padrao.locator(".etapa-linha").nth(idxOcupada).locator(".mini-btn.remover").click();
  await pg.waitForSelector(".falha", { timeout: 20000 });
  const recado = (await pg.textContent(".falha p"))?.trim() ?? "";
  const depois = await padrao.locator(".etapa-linha").count();
  checa("trava: remover etapa em uso é recusado", depois === antes, `${antes} → ${depois}`);
  checa(
    "trava: o motivo traz o número apurado de pedidos",
    /\d+ pedido/.test(recado),
    recado,
  );
} else {
  falhas.push("não achei etapa com pedidos para testar a trava");
}

// ── 3) Reordenar persiste (a função do banco renumera em transação) ──
await pg.goto(`${BASE}/app/etapas`, { waitUntil: "networkidle" });
const nomes = () =>
  padrao.locator(".etapa-nome").evaluateAll((els) => els.map((e) => e.value));
const primeiroNome = () =>
  padrao.locator(".etapa-nome").first().inputValue();
const antesOrdem = await nomes();
await padrao.locator(".etapa-linha").first().locator('button[aria-label="Descer"]').click();
await pg.waitForFunction(
  (esperado) => {
    const blocos = [...document.querySelectorAll("section.tipo-bloco")];
    const b = blocos.find((x) => /padrao/i.test(x.querySelector("h2")?.textContent ?? ""));
    return b && b.querySelector(".etapa-nome")?.value !== esperado;
  },
  antesOrdem[0],
  { timeout: 20000 },
);
const depoisOrdem = await nomes();
checa(
  "reordenar: as duas primeiras trocaram de lugar",
  depoisOrdem[0] === antesOrdem[1] && depoisOrdem[1] === antesOrdem[0],
  `${antesOrdem.slice(0, 2).join(",")} → ${depoisOrdem.slice(0, 2).join(",")}`,
);

await pg.reload({ waitUntil: "networkidle" });
const recarregada = await nomes();
checa(
  "reordenar: a ordem sobrevive à recarga (gravou no banco)",
  recarregada[0] === depoisOrdem[0] && recarregada[1] === depoisOrdem[1],
  recarregada.slice(0, 2).join(","),
);

// desfaz, para a base voltar como estava
await padrao.locator(".etapa-linha").first().locator('button[aria-label="Descer"]').click();
await pg.waitForFunction(
  (esperado) => {
    const blocos = [...document.querySelectorAll("section.tipo-bloco")];
    const b = blocos.find((x) => /padrao/i.test(x.querySelector("h2")?.textContent ?? ""));
    return b && b.querySelector(".etapa-nome")?.value !== esperado;
  },
  recarregada[0],
  { timeout: 20000 },
);
void primeiroNome;

// ── 4) O CRONÔMETRO: tipo novo, vazio, configurado por um pack ──────
const tipo = `crono${Date.now().toString().slice(-5)}`;
const t0 = Date.now();

// O caminho real de implantação: nomear o tipo e escolher o pack do setor.
await pg.fill('input[aria-label="Nome do tipo de pedido"]', tipo);
await pg.selectOption('select[aria-label="Pack inicial"]', { label: "Marmoraria e granito" });
await pg.click("section.tipo-novo button.btn-aco");
await pg.waitForFunction(
  (t) => {
    const blocos = [...document.querySelectorAll("section.tipo-bloco")];
    // O rótulo aparece capitalizado ("Crono123"): comparar em minúsculas.
    const alvo = blocos.find((b) =>
      (b.querySelector("h2")?.textContent ?? "").toLowerCase().includes(t),
    );
    return alvo && alvo.querySelectorAll(".etapa-linha").length > 0;
  },
  tipo,
  { timeout: 30000 },
);

const segundos = (Date.now() - t0) / 1000;
const bloco = pg.locator("section.tipo-bloco").filter({ hasText: tipo });
const quantas = await bloco.locator(".etapa-linha").count();
checa("pack: aplicou as 7 etapas da marmoraria", quantas === 7, `${quantas} etapas`);
checa(
  `PORTÃO B2: configurar um tipo levou menos de ${LIMITE_MINUTOS} min`,
  segundos < LIMITE_MINUTOS * 60,
  `${segundos.toFixed(1)}s`,
);

// ── 4b) Tipo criado sem pack nasce com exatamente a etapa prometida ──
const tipoSo = `crono${(Date.now() + 1).toString().slice(-5)}`;
await pg.fill('input[aria-label="Nome do tipo de pedido"]', tipoSo);
await pg.selectOption('select[aria-label="Pack inicial"]', { index: 0 });
await pg.click("section.tipo-novo button.btn-aco");
await pg.waitForFunction(
  (t) => {
    const blocos = [...document.querySelectorAll("section.tipo-bloco")];
    const alvo = blocos.find((b) =>
      (b.querySelector("h2")?.textContent ?? "").toLowerCase().includes(t),
    );
    return alvo && alvo.querySelectorAll(".etapa-linha").length > 0;
  },
  tipoSo,
  { timeout: 30000 },
);
const soBloco = pg.locator("section.tipo-bloco").filter({ hasText: tipoSo });
const soQuantas = await soBloco.locator(".etapa-linha").count();
const soNome = await soBloco.locator(".etapa-nome").first().inputValue();
checa(
  "sem pack: nasce com exatamente a etapa que o rótulo promete",
  soQuantas === 1 && soNome === "Recebido",
  `${soQuantas} etapa(s), "${soNome}"`,
);

// ── 5) Aplicar pack por cima é recusado (regra 13) ──────────────────
await pg.goto(`${BASE}/app/etapas`, { waitUntil: "networkidle" });
const jaConfigurado = pg.locator("section.tipo-bloco").filter({ hasText: tipo });
const temPacks = await jaConfigurado.locator(".pack-cartao").count();
checa(
  "pack: tipo já configurado não oferece pack por cima",
  temPacks === 0,
  `${temPacks} cartões`,
);

// ── 6) Renomear etapa persiste ─────────────────────────────────────
const primeiraDoNovo = jaConfigurado.locator(".etapa-linha").first();
await primeiraDoNovo.locator(".etapa-nome").fill("Chegou na oficina");
await primeiraDoNovo.locator(".mini-btn.salvar").click();
await pg.waitForTimeout(1500);
await pg.reload({ waitUntil: "networkidle" });
const nomeSalvo = await pg
  .locator("section.tipo-bloco")
  .filter({ hasText: tipo })
  .locator(".etapa-nome")
  .first()
  .inputValue();
checa("renomear: o nome novo sobrevive à recarga", nomeSalvo === "Chegou na oficina", nomeSalvo);

// ── 7) Layout medido, não olhado (regra 9) ─────────────────────────
for (const [nome, w, h] of [
  ["desktop", 1280, 900],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto(`${BASE}/app/etapas`, { waitUntil: "networkidle" });
  const sobra = await pg.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checa(`layout ${nome}: sem overflow horizontal`, sobra <= 0, `${sobra}px`);
}

// ── 8) Limpar o que este roteiro criou ─────────────────────────────
// Um portão que deixa resíduo quebra o próximo: o tipo `crono*` entra antes
// de "Padrao" na ordenação e desloca a primeira coluna do quadro, e o B3
// passava a medir a coluna errada. Limpar aqui é parte do roteiro, não
// higiene opcional — e é feito PELA TELA, que é o único caminho que o
// usuário tem (a limpeza por SQL continua no rodapé, para o banco real).
await pg.setViewportSize({ width: 1280, height: 900 });
await pg.goto(`${BASE}/app/etapas`, { waitUntil: "networkidle" });
let sobrou = 0;
for (let volta = 0; volta < 40; volta++) {
  const bloco = pg.locator("section.tipo-bloco").filter({ hasText: "Crono" });
  if ((await bloco.count()) === 0) break;
  const botao = bloco.first().locator(".etapa-linha .remover").first();
  if ((await botao.count()) === 0) { sobrou = 1; break; }
  await botao.click();
  await pg.waitForTimeout(350);
}
const restante = await pg.locator("section.tipo-bloco").filter({ hasText: "Crono" }).count();
checa(
  "o roteiro não deixa resíduo para o próximo portão",
  restante === 0 && sobrou === 0,
  `${restante} bloco(s) crono ainda na tela`,
);

console.log("\n=== PORTÃO B2 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
console.log(`\nLimpeza: delete from etapas where tipo_pedido like 'crono%';`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
