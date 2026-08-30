/**
 * Portão do B9/B10 — conta, pessoas e o cadastro sozinho.
 *
 * O que este bloco entrega é o que separa "software que existe" de "produto
 * que se vende": a oficina nasce sem você, tem mais de uma pessoa, e sabe
 * dizer em que pé está o plano. Cada uma dessas três coisas tem um jeito
 * conhecido de dar errado, e é isso que o roteiro mede:
 *
 *  · **plano**: os números do cartão e da barra têm que contar a mesma coisa
 *    (regra 4), e o aviso de bloqueio tem que dizer o que CONTINUA
 *    funcionando — senão a pessoa acha que perdeu os dados;
 *  · **pessoas**: quem não é dono não pode ver a tela de gente, e a lista
 *    nunca pode parecer vazia por falha de leitura (regra 3);
 *  · **preço**: a landing e a tela de conta têm que dizer o MESMO número. A
 *    landing é estática (texto) e a conta lê do banco — é a divergência mais
 *    fácil de acontecer e a mais cara de descobrir pelo cliente.
 *
 * O roteiro roda a tela em quatro estados de assinatura, trocados por
 * arquivo: teste normal, teste acabando, teste vencido e plano pago.
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b9.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "saojorge@esteira.dev";
const SENHA = process.env.SENHA ?? "esteira123";

const ok = [];
const falhas = [];
const pulados = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);
const pula = (nome, motivo) => pulados.push(`${nome} — ${motivo}`);

/** Os estados de assinatura do stub são arquivos; só um vale por vez. */
const ESTADOS = ["/tmp/plano-acabando", "/tmp/plano-vencido", "/tmp/plano-pago"];
const porEstado = (arquivo) => {
  for (const e of ESTADOS) if (fs.existsSync(e)) fs.unlinkSync(e);
  if (arquivo) fs.writeFileSync(arquivo, "1");
};
const comoEscritorio = (sim) => {
  const f = "/tmp/papel-escritorio";
  if (sim) fs.writeFileSync(f, "1");
  else if (fs.existsSync(f)) fs.unlinkSync(f);
};

porEstado(null);
comoEscritorio(false);

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
const pg = await ctx.newPage();

// ── 0) O cadastro existe e mostra o que vai criar ─────────────
await pg.goto(`${BASE}/criar-conta`, { waitUntil: "networkidle" });
checa("a tela de criar conta abre", (await pg.locator("form.cadastro").count()) === 1);

const etapasAntes = (await pg.textContent(".cadastro-etapas")) ?? "";
await pg.selectOption("#pack", { index: 2 });
const etapasDepois = (await pg.textContent(".cadastro-etapas")) ?? "";
checa(
  "PORTÃO B10: trocar de setor troca as etapas mostradas ANTES de criar",
  etapasAntes.length > 0 && etapasDepois.length > 0 && etapasAntes !== etapasDepois,
  `${etapasAntes.slice(0, 34)} → ${etapasDepois.slice(0, 34)}`,
);
const textoCadastro = (await pg.innerText("form.cadastro")) ?? "";
checa(
  "o cadastro promete teste sem cartão e diz que as etapas são editáveis",
  /sem cart[ãa]o/i.test(textoCadastro) && /renomeie/i.test(textoCadastro),
);

// ── login ─────────────────────────────────────────────────────
await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
await pg.click("form.entrar-caixa button[type=submit]");
await pg.waitForSelector(".cartao, .coluna, .vazio, .falha", { timeout: 30000 });

// ── 1) A tela de conta, no teste normal ───────────────────────
await pg.goto(`${BASE}/app/conta`, { waitUntil: "networkidle" });
await pg.waitForSelector(".plano-cartao, .falha", { timeout: 30000 });
checa("a tela de conta carrega", (await pg.locator(".falha").count()) === 0);

const plano = await pg.evaluate(() => {
  const t = (s) => document.querySelector(s)?.textContent?.trim() ?? "";
  const uso = document.querySelector(".plano-uso-linha")?.textContent ?? "";
  const m = /(\d+)\s+de\s+(\d+)/.exec(uso);
  const barra = document.querySelector(".barra i");
  return {
    nome: t(".plano-nome"),
    status: t(".plano-cartao .pill"),
    prazo: t(".plano-prazo"),
    usados: m ? Number(m[1]) : null,
    limite: m ? Number(m[2]) : null,
    pct: Number((/(\d+)%/.exec(uso) ?? [])[1] ?? NaN),
    larguraBarra: barra ? barra.getAttribute("style") : null,
    membros: document.querySelectorAll('[data-teste="linha-membro"]').length,
    temFormularioDeGente: !!document.querySelector(".conta-convite"),
    precos: [...document.querySelectorAll(".plano-opcao-preco")].map((x) =>
      x.textContent.replace(/\s+/g, " ").trim(),
    ),
    corpo: document.body.innerText,
  };
});

checa("o cartão do plano diz o nome e a situação", plano.nome.length > 0 && plano.status.length > 0,
  `${plano.nome} · ${plano.status}`);
checa("o prazo é dito em dias, não em jargão", /dia|hoje|Terminou/i.test(plano.prazo), plano.prazo);

// Regra 4: o par de números e a barra vêm da mesma consulta — então a
// porcentagem tem que ser exatamente a razão entre eles.
if (plano.usados === null || !plano.limite) {
  pula("uso e barra concordam", "este plano não tem limite de pedidos");
} else {
  const esperado = Math.min(100, Math.round((plano.usados / plano.limite) * 100));
  checa(
    "PORTÃO B9: a barra de uso é a razão entre os dois números mostrados",
    plano.pct === esperado && (plano.larguraBarra ?? "").includes(`${esperado}%`),
    `${plano.usados}/${plano.limite} = ${esperado}% · tela ${plano.pct}% · barra ${plano.larguraBarra}`,
  );
}

checa("a lista de pessoas aparece para o dono", plano.membros >= 1, `${plano.membros} pessoa(s)`);
checa("o dono tem como adicionar gente", plano.temFormularioDeGente);
checa(
  "a tela diz que o chão NÃO precisa de conta",
  /chão de fábrica.{0,40}não.{0,20}precisa de conta/is.test(plano.corpo),
);

// ── 2) O preço não pode divergir entre a landing e a conta ────
if (plano.precos.length === 0) {
  pula("preço da landing = preço da conta", "cobrança desligada: a tela não lista planos");
} else {
  const naConta = plano.precos.map((p) => (/R\$\s*([\d.]+)/.exec(p) ?? [])[1]).filter(Boolean);
  const outra = await ctx.newPage();
  await outra.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const naLanding = await outra.evaluate(() =>
    [...document.querySelectorAll(".preco-valor")].map(
      (x) => (/R\$\s*([\d.]+)/.exec(x.textContent) ?? [])[1],
    ),
  );
  await outra.close();
  checa(
    "PORTÃO B11: a landing cobra o mesmo que a tela de conta",
    naConta.length > 0 &&
      naConta.length === naLanding.length &&
      naConta.every((v, i) => v === naLanding[i]),
    `conta ${naConta.join("/")} × landing ${naLanding.join("/")}`,
  );
}

// ── 3) Teste acabando: a faixa avisa ANTES de travar ──────────
porEstado("/tmp/plano-acabando");
await pg.goto(`${BASE}/app`, { waitUntil: "networkidle" });
const faixaAcabando = (await pg.locator(".faixa-plano").first().textContent().catch(() => "")) ?? "";
checa(
  "PORTÃO B9: com o teste acabando, a faixa aparece em qualquer tela",
  /termina/i.test(faixaAcabando),
  faixaAcabando.replace(/\s+/g, " ").trim().slice(0, 90),
);
checa(
  "a faixa diz o que continua funcionando depois — não só que vai acabar",
  /continua|chão continua/i.test(faixaAcabando),
);

// ── 4) Teste vencido: trava o cadastro e explica o que sobra ──
porEstado("/tmp/plano-vencido");
await pg.goto(`${BASE}/app`, { waitUntil: "networkidle" });
const faixaTravada = (await pg.locator(".faixa-plano").first().textContent().catch(() => "")) ?? "";
checa(
  "PORTÃO B9: teste vencido mostra faixa de travado com o motivo",
  /travado/i.test(faixaTravada) && /terminou/i.test(faixaTravada),
  faixaTravada.replace(/\s+/g, " ").trim().slice(0, 100),
);
checa(
  "a faixa de travado diz que o resto continua",
  /resto continua/i.test(faixaTravada),
);

// O produto tem que RECUSAR o cadastro, e com a frase do banco.
await pg.goto(`${BASE}/app/novo`, { waitUntil: "networkidle" });
await pg.fill("#numero", `T-PLANO-${Date.now() % 100000}`);
await pg.fill("#cliente_nome", "Cliente do teste vencido");
await pg.click("form.form button[type=submit]");
await pg.waitForSelector(".alerta", { timeout: 20000 });
const recusa = (await pg.textContent(".alerta"))?.replace(/\s+/g, " ").trim() ?? "";
checa(
  "PORTÃO B9: com o plano vencido, cadastrar pedido é recusado",
  recusa.length > 0,
  recusa.slice(0, 90),
);
checa(
  "a recusa explica o motivo, não diz só “erro”",
  /teste terminou|plano|pagamento/i.test(recusa),
  recusa.slice(0, 90),
);

await pg.goto(`${BASE}/app/conta`, { waitUntil: "networkidle" });
const contaTravada = (await pg.innerText(".plano-cartao")) ?? "";
checa(
  "a tela de conta diz que NADA foi apagado",
  /nada foi apagado/i.test(contaTravada) && /chão/i.test(contaTravada),
  contaTravada.replace(/\s+/g, " ").slice(-110),
);

// ── 5) Quem não é dono não vê a tela de gente ─────────────────
porEstado(null);
comoEscritorio(true);
await pg.goto(`${BASE}/app/conta`, { waitUntil: "networkidle" });
const comoOperador = await pg.evaluate(() => ({
  membros: document.querySelectorAll('[data-teste="linha-membro"]').length,
  convite: !!document.querySelector(".conta-convite"),
  senha: !!document.querySelector('input[name="nova"]'),
  menu: [...document.querySelectorAll(".app-menu a")].map((a) => a.textContent.trim()),
}));
checa(
  "PORTÃO B9: quem é do escritório não vê a lista de pessoas",
  comoOperador.membros === 0 && !comoOperador.convite,
  `${comoOperador.membros} linha(s), convite=${comoOperador.convite}`,
);
checa("mas continua podendo trocar a própria senha", comoOperador.senha);
checa(
  "e o menu não oferece Conta para quem não é dono",
  !comoOperador.menu.includes("Conta"),
  comoOperador.menu.join(" · "),
);
comoEscritorio(false);

// ── 6) Layout medido ──────────────────────────────────────────
for (const [nome, w, h] of [
  ["desktop", 1280, 1000],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  for (const rota of ["/app/conta", "/criar-conta"]) {
    await pg.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
    const sobra = await pg.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    checa(`layout ${nome} ${rota}: sem rolagem lateral`, sobra <= 0, `${sobra}px`);
  }
}

console.log("\n=== PORTÃO B9/B10 ===");
ok.forEach((o) => console.log("  ✓", o));
pulados.forEach((p) => console.log("  ~ PULADO:", p));
falhas.forEach((f) => console.log("  ✗", f));
console.log(
  `\n${ok.length} passaram, ${falhas.length} falharam, ${pulados.length} pulados`,
);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
