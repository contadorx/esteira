/**
 * Portão do B5 — a página do cliente e o aviso manual.
 *
 * O portão deste bloco é uma FRASE QUE NÃO PODE EXISTIR.
 *
 * O mockup tinha um toast dizendo "#1042 avançou — cliente avisado" sem nada
 * por trás: nenhuma mensagem saía. É o furo que originou a regra nº 2 deste
 * projeto — nunca afirmar o que não se apurou. Na fase 1 quem envia é a
 * pessoa, pelo WhatsApp dela, e o aplicativo não tem como saber se ela apertou
 * enviar. Então a tela só pode dizer "copiada às 14h22".
 *
 * Este roteiro varre as telas do escritório atrás de "avisado" e falha se
 * achar.
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b5.mjs
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
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage();

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("button[type=submit]");
await pg.waitForSelector(".cartao, .vazio, .falha", { timeout: 30000 });

// ── 1) A lista oferece avisar e a página pública ──────────────────
await pg.goto(`${BASE}/app/pedidos`, { waitUntil: "networkidle" });
await pg.waitForSelector(".tabela tbody tr", { timeout: 30000 });
const botoesAvisar = await pg.locator(".col-avisar button").count();
checa("cada pedido tem o botão de avisar o cliente", botoesAvisar > 0, `${botoesAvisar}`);

// ── 2) O PORTÃO: a mensagem é montada e a tela NÃO diz "avisado" ──
await pg.locator(".col-avisar button").first().click();
await pg.waitForSelector(".aviso-painel", { timeout: 15000 });

const texto = (await pg.locator(".aviso-texto").inputValue()) ?? "";
checa(
  "a mensagem traz o link público do pedido",
  /\/p\/[A-Za-z0-9_-]{20,}/.test(texto),
  texto.slice(0, 90),
);
checa("a mensagem assina com o nome da oficina", /—\s*\S/.test(texto));
checa("a mensagem não tem campo vazio", !/undefined|null/.test(texto), texto.slice(0, 90));

// Copiar de verdade (o contexto precisa de permissão de área de transferência)
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
await pg.locator(".aviso-painel .btn-borda").click();
await pg.waitForSelector(".aviso-ok", { timeout: 20000 });
const confirmacao = (await pg.textContent(".aviso-ok"))?.replace(/\s+/g, " ").trim() ?? "";
checa(
  "PORTÃO B5: a confirmação diz COPIADA e a hora",
  /copiada às \d{2}[:h]\d{2}/i.test(confirmacao),
  confirmacao,
);
checa(
  "PORTÃO B5: a confirmação NÃO afirma que o cliente foi avisado",
  !/avisad|enviad|notificad/i.test(confirmacao),
  confirmacao,
);

// A varredura: nenhuma tela do escritório pode conter a palavra proibida.
for (const rota of ["/app", "/app/pedidos"]) {
  await pg.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
  const corpo = (await pg.textContent("body")) ?? "";
  checa(
    `PORTÃO B5: ${rota} não diz "avisado" em lugar nenhum`,
    !/avisad[oa]/i.test(corpo),
    (corpo.match(/.{0,40}avisad[oa].{0,40}/i) ?? [""])[0],
  );
}

// ── 3) A página pública abre SEM cookie, em navegador limpo ───────
// Pega o link E o telefone DO MESMO pedido: para provar que o telefone não
// vaza, é preciso saber qual telefone procurar.
await pg.goto(`${BASE}/app/pedidos`, { waitUntil: "networkidle" });
const primeira = pg.locator(".tabela tbody tr").first();
const link = await primeira.locator('a[href*="/p/"]').getAttribute("href");
const token = link?.split("/p/")[1] ?? "";
await primeira.locator(".col-avisar button").click();
await pg.waitForSelector(".aviso-painel", { timeout: 15000 });
const foneTexto = (await pg.textContent(".aviso-fone")) ?? "";
const foneDigitos = foneTexto.replace(/\D/g, "");

const publico = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});
const cli = await publico.newPage();
checa("o token público não é enumerável", token.length >= 32, `${token.length} caracteres`);

await cli.goto(link, { waitUntil: "networkidle" });
await cli.waitForSelector(".cli-cartao, .cli-aviso", { timeout: 30000 });
const cookies = await publico.cookies();
checa("a página do cliente abre sem nenhum cookie", cookies.length === 0, `${cookies.length}`);
checa("a página mostra a linha do tempo", (await cli.locator(".cli-passo").count()) > 0);
checa("a linha do tempo marca onde o pedido está", (await cli.locator(".cli-passo.atual").count()) === 1);

// ── 4) A página pública não vaza nada de dentro da oficina ────────
// Vale o textContent, não o innerText: dado no payload dos <script> chega ao
// navegador do cliente do mesmo jeito, mesmo sem aparecer na tela. Só o token
// da própria página é retirado antes — ele é o endereço, não um vazamento.
const corpoCli = ((await cli.textContent("body")) ?? "").split(token).join("§");
checa(
  "página do cliente: o telefone do cliente NÃO chega ao navegador",
  foneDigitos.length < 8 || !corpoCli.replace(/\D/g, "").includes(foneDigitos),
  foneDigitos ? `procurei por ${foneDigitos}` : "pedido sem telefone cadastrado",
);
// O nome do cliente não aparece na página pública — nem inteiro, nem cortado.
const nomeNaLista = (await primeira.locator("td").nth(1).textContent())?.trim() ?? "";
checa(
  "página do cliente: o nome do cliente NÃO chega ao navegador",
  nomeNaLista.length < 4 || !corpoCli.includes(nomeNaLista),
  `procurei por “${nomeNaLista}”`,
);
checa("página do cliente: sem observação interna", !/PROBLEMA/i.test(corpoCli));
checa(
  "página do cliente: não promete o que não sabe",
  !/entregue amanhã|garantido|chega em/i.test(corpoCli),
);
const outros = await cli.locator(".cli-cartao h1").count();
checa("página do cliente: mostra um pedido só", outros === 1, `${outros}`);

// ── 5) Link inválido diz que é link inválido ──────────────────────
await cli.goto(`${BASE}/p/naoexiste123`, { waitUntil: "networkidle" });
const corpo404 = (await cli.textContent("body")) ?? "";
checa(
  "link errado: recusa sem revelar nada",
  /não encontrado/i.test(corpo404) && !/pedido #/i.test(corpo404),
  corpo404.slice(0, 60),
);

// ── 6) Layout medido (regra 9) ────────────────────────────────────
await cli.goto(link, { waitUntil: "networkidle" });
const sobra = await cli.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
checa("página do cliente: sem rolagem lateral no celular", sobra <= 0, `${sobra}px`);

console.log("\n=== PORTÃO B5 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
