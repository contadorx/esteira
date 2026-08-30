/**
 * Portão do B1 — a verificação que abre a tela e MEDE (regra 9).
 *
 * Compilador e build aprovaram, sem hesitar, bugs que impediam a pessoa de
 * usar o formulário. O que pega defeito é isto: entrar de verdade, importar um
 * arquivo com defeitos plantados e comparar números que têm ordem obrigatória.
 *
 * COMO RODAR
 *   1. npm run build && npm run start   (servidor de produção; nunca com o
 *      dev server vivo na mesma pasta — regra 16)
 *   2. node verificacao/portao-b1.mjs
 *
 * Variáveis (opcionais):
 *   BASE=http://localhost:3000  EMAIL=...  SENHA=...
 *
 * O QUE ESTE ROTEIRO NÃO PROVA
 *   - Isolamento entre oficinas: ele entra com UM usuário. Para provar a RLS
 *     de verdade (regra 11), crie um segundo usuário em outra oficina e
 *     confira que nenhum pedido da primeira aparece.
 *   - Os pedidos T-90xx ficam na base. Para limpar:
 *       delete from pedidos where numero like 'T-9%';
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "saojorge@esteira.dev";
const SENHA = process.env.SENHA ?? "esteira123";
const CSV = new URL("./pedidos-teste.csv", import.meta.url).pathname;

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage();

// 1) Guarda de navegação: /app sem sessão não abre.
await pg.goto(`${BASE}/app`, { waitUntil: "networkidle" });
checa("guarda: /app sem sessão vai para /entrar", pg.url().includes("/entrar"), pg.url());

// 2) Senha errada é recusada, e a mensagem não inventa causa (regra 2).
await pg.fill("#email", EMAIL);
await pg.fill("#senha", "senha-errada");
await pg.click("button[type=submit]");
await pg.waitForSelector(".alerta", { timeout: 15000 });
const msg = (await pg.textContent(".alerta"))?.trim();
checa("login: senha errada é recusada", pg.url().includes("/entrar"));
checa("login: mensagem honesta", msg === "E-mail ou senha não conferem.", msg);

// 3) Login de verdade.
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("button[type=submit]");
// ⚠ `/app` era a LISTA quando este roteiro nasceu; desde o B3 é o QUADRO.
// A espera antiga (`.tabela tbody tr, .vazio`) casava com `.vazio` só quando a
// oficina não tinha etapa nenhuma — ou seja, passava por acidente numa base
// vazia e travava numa base de verdade. Regra 15: a ferramenta que previne
// defeito precisa da mesma revisão que o código.
await pg.waitForSelector(".cartao, .coluna, .vazio, .falha", { timeout: 30000 });
checa("login: sessão real entra em /app", pg.url().endsWith("/app"), pg.url());

// A contagem × KPI é da LISTA, que é onde os dois números convivem.
await pg.goto(`${BASE}/app/pedidos`, { waitUntil: "networkidle" });
await pg.waitForSelector(".tabela tbody tr, .vazio", { timeout: 30000 });
const antes = await pg.locator(".tabela tbody tr").count();
const kpiAntes = Number((await pg.textContent(".kpi .v"))?.trim());
checa("regra 4: KPI e linhas concordam", kpiAntes === antes, `KPI ${kpiAntes} × ${antes} linhas`);

// 4) O PORTÃO: 60 linhas, 5 defeituosas, uma de cada classe.
//    IMPORTANTE: clicar no botão DO FORMULÁRIO — `button[type=submit]` sozinho
//    também casa com o "sair" do cabeçalho e o roteiro sai da sessão calado.
await pg.goto(`${BASE}/app/importar`, { waitUntil: "networkidle" });
await pg.setInputFiles("#arquivo", CSV);
await pg.click("form.form button[type=submit]");
await pg.waitForSelector(".relatorio, .falha", { timeout: 120000 });

const entraram = Number((await pg.textContent(".placar.ok b"))?.trim());
const fora = Number((await pg.textContent(".placar.mal b"))?.trim());
const lidas = Number(
  (await pg.textContent(".relatorio-cab .placar:nth-child(3) b"))?.trim(),
);
checa("PORTÃO B1: 55 entraram", entraram === 55, String(entraram));
checa("PORTÃO B1: 5 ficaram de fora", fora === 5, String(fora));
checa("linha em branco não vira rejeição", lidas === 60, `${lidas} lidas`);

const motivos = await pg.locator(".relatorio .tabela tbody tr").allTextContents();
checa("relatório traz linha + motivo por rejeitada", motivos.length === 5, `${motivos.length}`);
const texto = motivos.join(" | ");
for (const [rotulo, agulha] of [
  ["data de calendário (31/02)", "não é data de calendário válida"],
  // A mensagem ficou MAIS precisa no B2 (etapa é por tipo de pedido): o
  // motivo passou a ser `etapa "X" não existe no tipo "Y"`. Quem estava
  // desatualizado era o roteiro, não o produto.
  ["etapa inexistente", "não existe no tipo"],
  ["sem número", "sem número do pedido"],
  ["sem cliente", "sem nome do cliente"],
  ["telefone quebrado", "não tem DDD"],
]) {
  checa(`motivo apurado: ${rotulo}`, texto.includes(agulha));
}

// 5) Reimportar o mesmo arquivo não duplica — e o motivo vem do banco.
await pg.setInputFiles("#arquivo", CSV);
await pg.click("form.form button[type=submit]");
await pg.waitForFunction(
  () => document.querySelector(".placar.ok b")?.textContent === "0",
  null,
  { timeout: 120000 },
);
const texto2 = (await pg.locator(".relatorio .tabela tbody tr").allTextContents()).join(" | ");
checa(
  "reimportação: motivo é o apurado do banco (unicidade)",
  texto2.includes("já existe um pedido com esse número"),
);

// 6) A lista soma exatamente o que entrou. (A LISTA, não o quadro — /app
//    virou o quadro no B3, e lá não existe `.tabela`.)
await pg.goto(`${BASE}/app/pedidos`, { waitUntil: "networkidle" });
const depois = await pg.locator(".tabela tbody tr").count();
const kpiDepois = Number((await pg.textContent(".kpi .v"))?.trim());
checa("lista: antes + 55 = depois", depois === antes + 55, `${antes} + 55 × ${depois}`);
checa("regra 4 (após import): KPI = linhas", kpiDepois === depois, `${kpiDepois} × ${depois}`);

// 7) Medida de layout — número, não olhada (regra 9).
for (const [nome, w, h] of [
  ["desktop", 1280, 900],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const sobra = await pg.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checa(`layout ${nome}: sem overflow horizontal`, sobra <= 0, `${sobra}px`);
}

console.log("\n=== PORTÃO B1 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
