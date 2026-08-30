/**
 * MEDIÇÃO DO B15 — abre as telas novas e confere o que elas mostram.
 *
 * Não é portão de bloco: é a regra 9 aplicada de forma barata. `next build`
 * aprova bug com naturalidade; só abrir a tela com massa e MEDIR pega
 * número que discorda de si mesmo, tela que mostra zero quando devia dizer
 * "não sei", e menu que promete rota que não existe.
 *
 * COMO RODAR (com o stub do sandbox no ar e o .env.local apontado para ele):
 *   npm run build && npm run start
 *   node verificacao/medir-b15.mjs
 */
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL_TESTE ?? "escritorio@saojorge.test";
const SENHA = process.env.SENHA_TESTE ?? "esteira123";

const ok = [];
const falhas = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
const pg = await ctx.newPage();

const entrar = async () => {
  await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await pg.fill("#email", EMAIL);
  await pg.fill("#senha", SENHA);
  await pg.click("form.entrar-caixa button[type=submit]");
  await pg.waitForSelector(".cartao, .coluna, .vazio, .falha", { timeout: 30000 });
};

const soNumeros = (t) => Number((t ?? "").replace(/[^\d]/g, "")) || 0;

await entrar();

// ── 1) O MENU FOI CORTADO (D29) ───────────────────────────────
{
  const itens = await pg.locator(".app-menu a").allTextContents();
  checa(
    "menu do app tem 5 itens, não 9",
    itens.length === 5,
    itens.join(" · "),
  );
  checa(
    "“Novo pedido” e “Importar CSV” saíram do menu (são ação, não lugar)",
    !itens.some((i) => /novo pedido|importar/i.test(i)),
    itens.join(" · "),
  );
  // Cortar do menu só é honesto se o caminho continuar existindo na tela.
  await pg.goto(`${BASE}/app/pedidos`, { waitUntil: "networkidle" });
  const temNovo = await pg.locator('a[href="/app/novo"]').count();
  const temImportar = await pg.locator('a[href="/app/importar"]').count();
  checa(
    "os dois continuam alcançáveis por botão na tela de Pedidos",
    temNovo > 0 && temImportar > 0,
    `novo=${temNovo} importar=${temImportar}`,
  );
}

// ── 2) AJUSTES existe e leva aos três ─────────────────────────
{
  await pg.goto(`${BASE}/app/ajustes`, { waitUntil: "networkidle" });
  const destinos = await pg.locator(".ajuste-cartao").evaluateAll((as) =>
    as.map((a) => a.getAttribute("href")),
  );
  checa(
    "Ajustes reúne etapas, acessos e conta",
    ["/app/etapas", "/app/acessos", "/app/conta"].every((h) => destinos.includes(h)),
    destinos.join(" · "),
  );
}

// ── 3) A TRAVA: quem não é da equipe não vê nada ──────────────
// O arquivo faz o stub responder como a função de banco responde a um usuário
// logado que não está em `equipe`: `sou_equipe` falso e `painel_negocio` nulo.
{
  fs.writeFileSync("/tmp/nao-sou-equipe", "1");
  await pg.goto(`${BASE}/negocio`, { waitUntil: "networkidle" });
  const texto = (await pg.locator("body").textContent()) ?? "";
  checa(
    "usuário logado fora da equipe recebe “Área restrita”",
    /área restrita/i.test(texto),
    texto.slice(0, 80),
  );
  checa(
    "e o menu lateral do negócio nem é desenhado para ele",
    (await pg.locator(".neg-lado").count()) === 0,
  );
  checa(
    "nenhum número da base vaza na tela restrita",
    !/R\$/.test(texto),
    texto.slice(0, 120),
  );

  // A rota interna também não pode entregar nada.
  await pg.goto(`${BASE}/negocio/faturas`, { waitUntil: "networkidle" });
  const t2 = (await pg.locator("body").textContent()) ?? "";
  checa(
    "a rota de faturas, acessada direto, também é restrita",
    /área restrita/i.test(t2),
    t2.slice(0, 80),
  );
  fs.unlinkSync("/tmp/nao-sou-equipe");
}

// ── 4) FALHA NÃO VIRA R$ 0 (regra 3) ─────────────────────────
// O defeito mais caro que um painel de receita pode ter.
{
  fs.writeFileSync("/tmp/negocio-explode", "1");
  await pg.goto(`${BASE}/negocio`, { waitUntil: "networkidle" });
  const texto = (await pg.locator("body").textContent()) ?? "";
  checa(
    "consulta que falha mostra o motivo, não um painel zerado",
    /não consegui ler os dados do negócio/i.test(texto),
    texto.slice(0, 90),
  );
  checa(
    "e NENHUM valor em reais é desenhado nessa tela",
    !/R\$\s*0/.test(texto),
    texto.slice(0, 120),
  );
  fs.unlinkSync("/tmp/negocio-explode");
}

// ── 5) REGRA 4: o MRR do topo bate com a lista ───────────────
{
  await pg.goto(`${BASE}/negocio`, { waitUntil: "networkidle" });
  const mrrTopo = soNumeros(
    await pg.locator(".neg-bloco").first().locator(".neg-bloco-v").textContent(),
  );

  await pg.goto(`${BASE}/negocio/oficinas`, { waitUntil: "networkidle" });
  // Soma o preço das oficinas marcadas como "pagando" — que é o mesmo
  // conjunto que o MRR conta.
  const somaLista = await pg.locator(".neg-oficina").evaluateAll((cards) =>
    cards
      .filter((c) => /pagando/.test(c.querySelector(".selo-neg")?.textContent ?? ""))
      .reduce((total, c) => {
        const dds = Array.from(c.querySelectorAll("dd")).map((d) => d.textContent ?? "");
        const plano = dds[0] ?? "";
        const m = /R\$\s*([\d.]+),(\d{2})\/mês/.exec(plano);
        return total + (m ? Number(m[1].replace(/\./g, "")) * 100 + Number(m[2]) : 0);
      }, 0),
  );
  checa(
    "REGRA 4: MRR do painel = soma dos planos das oficinas pagando",
    mrrTopo === somaLista && mrrTopo > 0,
    `topo=${mrrTopo} lista=${somaLista}`,
  );
}

// ── 6) A fila separa "o chão já usa" de "só o escritório usa" ─
{
  await pg.goto(`${BASE}/negocio`, { waitUntil: "networkidle" });
  const tipos = await pg.locator(".neg-acao-txt b").allTextContents();
  checa(
    "duas oficinas em teste, motivos DIFERENTES na fila",
    tipos.some((t) => /o ch[aã]o j[aá] usa/i.test(t)) &&
      tipos.some((t) => /s[oó] o escrit[oó]rio/i.test(t)),
    tipos.join(" · "),
  );
  const urgencias = await pg.locator(".selo-urg").allTextContents();
  checa(
    "a urgência vem ESCRITA, não só colorida (regra 5)",
    urgencias.length > 0 && urgencias.every((u) => u.trim().length > 0),
    urgencias.join(" · "),
  );
}

// ── 7) A métrica nº 1 aparece, e sabe dizer quando não sabe ──
{
  const metrica = (await pg.locator(".neg-metrica-v").textContent())?.trim() ?? "";
  checa(
    "a métrica que decide o produto está na tela",
    /^\d+%$|^—$/.test(metrica),
    metrica,
  );
  await pg.goto(`${BASE}/negocio/oficinas`, { waitUntil: "networkidle" });
  const corpo = (await pg.locator("body").textContent()) ?? "";
  checa(
    "oficina sem avanço nenhum diz “nenhum avanço”, não 0%",
    /nenhum avanço em 30 dias/i.test(corpo) || !/0%\s*pelo chão/.test(corpo),
    "",
  );
  checa(
    "oficina sem acesso de chão é apontada como tal",
    /nenhum entregue/i.test(corpo),
  );
}

// ── 8) O extrato ─────────────────────────────────────────────
{
  await pg.goto(`${BASE}/negocio/faturas`, { waitUntil: "networkidle" });
  const linhas = await pg.locator("table.tabela tbody tr").count();
  checa("o extrato lista as cobranças gravadas", linhas > 0, `${linhas} linha(s)`);
  const corpo = (await pg.locator("body").textContent()) ?? "";
  checa(
    "cada linha mostra a situação E o status cru do Asaas (a evidência)",
    /paga/.test(corpo) && /CONFIRMED/.test(corpo),
  );
}

// ── 8b) A OUTRA METADE DA FATURA: a oficina vê a dela ───────
// O extrato serve a dois leitores. Aqui é o do cliente: "cadê o meu boleto",
// que é a pergunta que mais gera ligação numa assinatura. Só existe resposta
// porque o webhook passou a gravar a cobrança conferida (D30) — antes, o
// pagamento sobrescrevia o anterior e não sobrava nada para mostrar.
{
  // Faz o webhook gravar uma cobrança de verdade, pelo caminho de verdade.
  const r = await fetch(`${BASE}/api/cobranca/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": process.env.ASAAS_WEBHOOK_TOKEN ?? "token-de-webhook-da-fumaca",
    },
    body: JSON.stringify({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_confirmada" } }),
  });
  const j = await r.json().catch(() => ({}));
  checa(
    "o webhook grava a fatura no mesmo evento que libera o acesso",
    r.status === 200 && j.estado === "aplicado" && j.fatura === "registrada",
    `${r.status} ${j.estado} fatura=${j.fatura}`,
  );

  await pg.goto(`${BASE}/app/conta`, { waitUntil: "networkidle" });
  const corpo = (await pg.locator("body").textContent()) ?? "";
  checa(
    "a oficina vê a própria cobrança em /app/conta",
    /minhas cobranças/i.test(corpo) && /paga/i.test(corpo),
    corpo.slice(corpo.indexOf("Minhas cobranças"), corpo.indexOf("Minhas cobranças") + 90),
  );
  checa(
    "e tem link para abrir o boleto/Pix sem precisar ligar",
    (await pg.locator('a:has-text("abrir no Asaas")').count()) > 0,
  );
}

// ── 9) A recuperação de senha existe e é alcançável ─────────
// ATENÇÃO: precisa de uma aba SEM sessão. /entrar redireciona para /app quando
// já há login — a primeira versão deste teste reprovou o produto por causa
// disso, e o link estava lá o tempo todo (regra 15: a varredura erra também).
{
  const anon = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
  const pgAnon = await anon.newPage();
  await pgAnon.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  const link = await pgAnon.locator('a[href="/recuperar"]').count();
  checa("o login oferece “Esqueci minha senha”", link > 0, `${link} link(s)`);
  await anon.close();

  await pg.goto(`${BASE}/api/auth/recuperar`, { waitUntil: "networkidle" });
  checa(
    "link de recuperação sem código volta com o motivo, não com erro cru",
    pg.url().includes("/recuperar?falhou="),
    pg.url(),
  );
  const corpo = (await pg.locator("body").textContent()) ?? "";
  checa("e o motivo aparece escrito na tela", /o link não funcionou/i.test(corpo));
}

// ── 10) As páginas legais estão no ar e ligadas no rodapé ───
{
  await pg.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const t = await pg.locator("footer.pe a").evaluateAll((as) =>
    as.map((a) => a.getAttribute("href")),
  );
  checa(
    "o rodapé da landing leva a termos e privacidade",
    t.includes("/termos") && t.includes("/privacidade"),
    t.join(" · "),
  );
  await pg.goto(`${BASE}/termos`, { waitUntil: "networkidle" });
  const corpo = (await pg.locator("body").textContent()) ?? "";
  checa(
    "os termos avisam quando falta a identificação da empresa, em vez de inventar CNPJ",
    /falta preencher a identificação da empresa/i.test(corpo) ||
      /CNPJ \d/.test(corpo),
  );
}

await navegador.close();

console.log("\n=== MEDIÇÃO B15 ===");
ok.forEach((o) => console.log("  ✓", o));
falhas.forEach((f) => console.log("  ✗", f));
console.log(`\n${ok.length} passaram, ${falhas.length} falharam`);
console.log(
  "\nNÃO provado aqui: o isolamento real entre oficinas e a trava de equipe\n" +
    "contra o BANCO DE VERDADE — este roteiro roda contra o servidor de\n" +
    "mentira do sandbox. A prova definitiva é abrir /negocio em produção com\n" +
    "um usuário que não está em `equipe` (regra 11).",
);
process.exit(falhas.length ? 1 : 0);
