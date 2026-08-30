/**
 * Portão do B12 — a gaveta do pedido.
 *
 * Este bloco fecha a pergunta que o produto não respondia: "o que aconteceu
 * com este pedido?". E ele tem um jeito muito específico de dar errado —
 * contar uma história que não aconteceu:
 *
 *  · "Deu problema" grava na MESMA etapa. Se a tela desenhar isso como
 *    avanço, o dono lê que o pedido andou quando ele empacou. É o defeito
 *    mais caro possível numa linha do tempo, porque ela é lida como prova.
 *  · A foto sobe para bucket privado. Antes deste bloco ela existia e nunca
 *    aparecia — o que é pior que não ter foto, porque quem tirou acredita
 *    que registrou. Quando a exibição falha, a tela tem que dizer que a foto
 *    EXISTE e não se perdeu.
 *  · Aviso é "copiado", nunca "avisado" (regra 2, a que originou a regra).
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b12.mjs
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
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
const pg = await ctx.newPage();

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("form.entrar-caixa button[type=submit]");
await pg.waitForSelector(".cartao, .coluna, .vazio, .falha", { timeout: 30000 });

// ── 1) Chegar na gaveta pelo caminho que a pessoa usa ─────────
const numeroNoQuadro = (await pg.locator(".cartao-num").first().textContent())?.trim() ?? "";
await pg.locator("a.cartao-num").first().click();
await pg.waitForSelector(".linha-tempo, .tempos-nenhum, .falha", { timeout: 30000 });
checa(
  "PORTÃO B12: clicar no número do cartão abre o pedido",
  /\/app\/pedido\//.test(pg.url()) && (await pg.locator(".falha").count()) === 0,
  pg.url(),
);
const titulo = (await pg.textContent("h1"))?.replace(/\s+/g, " ").trim() ?? "";
checa("a gaveta é do pedido que foi clicado", titulo.includes(numeroNoQuadro.replace("#", "")), `${numeroNoQuadro} → ${titulo}`);

// ── 2) A linha do tempo separa problema de avanço ─────────────
const linha = await pg.evaluate(() => {
  const passos = [...document.querySelectorAll('[data-teste="passo"]')].map((li) => ({
    origem: li.getAttribute("data-origem"),
    problema: li.classList.contains("problema"),
    titulo: li.querySelector(".lt-titulo")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    quem: li.querySelector(".lt-quem")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    quando: li.querySelector(".lt-quando")?.textContent?.trim() ?? "",
    temFoto: !!li.querySelector(".lt-foto"),
    faltaFoto: !!li.querySelector(".lt-foto-falta"),
  }));
  return {
    passos,
    avisos: [...document.querySelectorAll('[data-teste="aviso"]')].map((x) =>
      x.textContent.replace(/\s+/g, " ").trim(),
    ),
    caminho: [...document.querySelectorAll(".caminho-passo")].map((x) => ({
      nome: x.textContent.trim(),
      atual: x.classList.contains("atual"),
      cumprida: x.classList.contains("cumprida"),
    })),
    corpo: document.body.innerText,
  };
});

checa("a linha do tempo tem passos", linha.passos.length > 0, `${linha.passos.length} passo(s)`);

const problemas = linha.passos.filter((p) => p.problema);
if (problemas.length === 0) {
  falhas.push("a massa não tem nenhum “deu problema” — o portão não pôde provar a separação");
} else {
  checa(
    "PORTÃO B12: “deu problema” NÃO é desenhado como avanço",
    problemas.every((p) => /deu problema/i.test(p.titulo) && !/avançou/i.test(p.titulo)),
    problemas[0].titulo,
  );
  checa(
    "o texto do problema aparece junto, sem o prefixo técnico",
    !/PROBLEMA:/.test(linha.corpo),
    (linha.corpo.match(/.{0,40}PROBLEMA:.{0,20}/) ?? [""])[0],
  );
}

const entrada = linha.passos.filter((p) => p.origem === "entrada");
checa(
  "a entrada do pedido aparece como entrada, não como avanço",
  entrada.length > 0 && entrada.every((p) => /entrou/i.test(p.titulo)),
  entrada[0]?.titulo ?? "nenhuma entrada na massa",
);

checa(
  "cada passo diz QUEM e QUANDO",
  linha.passos.every((p) => p.quem.length > 2 && /\d{2}\/\d{2}/.test(p.quando)),
  linha.passos.find((p) => !/\d{2}\/\d{2}/.test(p.quando))?.quando ?? "",
);

// ── 3) A foto: ou aparece, ou a tela diz que existe ───────────
const comFoto = linha.passos.filter((p) => p.temFoto || p.faltaFoto);
if (comFoto.length === 0) {
  falhas.push("a massa não tem avanço com foto — o portão não pôde provar a exibição");
} else {
  checa(
    "PORTÃO B12: avanço com foto ou mostra a imagem, ou avisa que ela existe",
    comFoto.every((p) => p.temFoto || p.faltaFoto),
  );
  const semImagem = comFoto.filter((p) => p.faltaFoto);
  if (semImagem.length > 0) {
    checa(
      "quando não consegue exibir, a tela diz que a foto NÃO se perdeu",
      /não se perdeu/i.test(linha.corpo),
      "",
    );
  }
}

// ── 4) O caminho marca onde o pedido está ─────────────────────
checa(
  "o caminho mostra as etapas e marca a atual",
  linha.caminho.length > 0 && linha.caminho.filter((c) => c.atual).length === 1,
  linha.caminho.map((c) => (c.atual ? `[${c.nome}]` : c.nome)).join(" › "),
);

// ── 5) A frase proibida ───────────────────────────────────────
// O mockup dizia "cliente avisado" sem nada por trás; é o furo que originou a
// regra 2. A gaveta é onde ela mais tenta voltar.
checa(
  "PORTÃO B12: a gaveta nunca diz que o cliente foi avisado",
  !/cliente avisado|avisamos o cliente|cliente foi avisado/i.test(linha.corpo),
  (linha.corpo.match(/.{0,30}avisad.{0,30}/i) ?? [""])[0],
);
if (linha.avisos.length > 0) {
  checa(
    "as mensagens aparecem como copiadas, com data e hora",
    linha.avisos.every((a) => /copiada/i.test(a) && /\d{2}\/\d{2}/.test(a)),
    linha.avisos[0],
  );
}

// ── 6) Nada do cliente vaza para a página pública ─────────────
// A gaveta mostra telefone e nome (é a oficina olhando o próprio pedido); a
// página do cliente, não. O link tem que levar à página certa.
const link = (await pg.textContent(".pedido-link")) ?? "";
// 32 caracteres, não "32 hexadecimais": a forma do token (hex de 16 bytes)
// é provada contra o banco no portão B5. Exigir hex aqui reprovava o servidor
// de mentira do sandbox por um detalhe que não é do produto.
checa("a gaveta mostra o link público do pedido", /^\/p\/\S{32}$/.test(link.trim()), link);

// ── 7) A lista de pedidos também leva à gaveta ────────────────
await pg.goto(`${BASE}/app/pedidos`, { waitUntil: "networkidle" });
const links = await pg.locator("a.link-pedido").count();
checa("a lista de pedidos também abre a gaveta", links > 0, `${links} link(s)`);

// ── 8) Layout medido ──────────────────────────────────────────
const endereco = pg.url();
for (const [nome, w, h] of [
  ["desktop", 1280, 1000],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto(endereco, { waitUntil: "networkidle" });
  await pg.locator("a.link-pedido").first().click();
  await pg.waitForSelector(".pedido-bloco", { timeout: 20000 });
  const sobra = await pg.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checa(`layout ${nome}: sem rolagem lateral`, sobra <= 0, `${sobra}px`);
}

console.log("\n=== PORTÃO B12 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
