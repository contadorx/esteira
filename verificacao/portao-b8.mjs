/**
 * Portão do B8 — a previsão aprendida do histórico (fase 2).
 *
 * ── A divisão de trabalho, para ninguém confundir o que está provado ──
 *
 * A ARITMÉTICA é provada pela fumaça em `BEGIN…ROLLBACK` contra o banco de
 * verdade, com histórico montado e medianas conferidas na mão
 * (`supabase/fumaca-tempos.sql`). Lá se prova que Corte com permanências de
 * 1, 2 e 3 dias tem mediana 2,0; que amostra de 2 devolve NULO e não zero; e
 * que a previsão de um pedido é o que falta da etapa atual mais a mediana das
 * seguintes.
 *
 * ESTE roteiro prova a outra metade: que a tela mostra o que a função
 * devolveu, e — principalmente — que ela **não mostra o que a função não
 * sabe**. Um número inventado onde falta amostra é o pior defeito possível
 * neste bloco, porque data na tela é promessa (regra 2).
 *
 * ── Por que existe "PULADO" aqui ──
 *
 * Vários itens só podem ser provados se a base TIVER o caso (uma etapa com
 * amostra curta, um pedido sem previsão). Numa oficina nova não tem. Passar
 * calado nesses casos seria o defeito do portão B5 de novo: teste que procura
 * o que não existe passa vazio e dá sensação de segurança. Então ele **avisa
 * que pulou**, com o motivo.
 *
 * COMO RODAR
 *   npm run build && npm run start
 *   node verificacao/portao-b8.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "saojorge@esteira.dev";
const SENHA = process.env.SENHA ?? "esteira123";

const ok = [];
const falhas = [];
const pulados = [];
const checa = (nome, cond, detalhe = "") =>
  (cond ? ok : falhas).push(`${nome}${detalhe ? " — " + detalhe : ""}`);
const pula = (nome, motivo) => pulados.push(`${nome} — ${motivo}`);

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 950 } });
const pg = await ctx.newPage();

await pg.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
await pg.fill("#email", EMAIL);
await pg.fill("#senha", SENHA);
// `form.entrar-caixa` e não `button[type=submit]` solto: o botão "sair" do
// cabeçalho também casa com o seletor genérico, e o roteiro já se deslogou
// sozinho uma vez por causa disso (ver verificacao/LEIA.md).
await pg.click("form.entrar-caixa button[type=submit]");
await pg.waitForSelector(".cartao, .vazio, .falha", { timeout: 30000 });

await pg.goto(`${BASE}/app/tempos`, { waitUntil: "networkidle" });
await pg.waitForSelector(".tabela, .falha, .tempos-vazio", { timeout: 30000 });
checa("a tela de tempos carrega", (await pg.locator(".falha").count()) === 0);

/** Lê a tela inteira de uma vez: os KPIs e as duas tabelas. */
const ler = () =>
  pg.evaluate(() => {
    const num = (sel) => {
      const t = document.querySelector(`[data-teste="${sel}"]`)?.textContent ?? "";
      const m = /^\s*(\d+)/.exec(t);
      return m ? Number(m[1]) : null;
    };
    const etapas = [...document.querySelectorAll('[data-teste="linha-etapa"]')].map((tr) => {
      const med = tr.querySelector('[data-teste="mediana"]')?.textContent?.trim() ?? "";
      const tds = [...tr.querySelectorAll("td")];
      return {
        etapa: tr.getAttribute("data-etapa"),
        medianaTexto: med,
        // "Tem número" quer dizer TEM DURAÇÃO MEDIDA — "1,8 d" ou "no mesmo
        // dia". Procurar dígito solto reprovava "ainda não sei · faltam 1",
        // que é exatamente a frase certa: o roteiro acusava o produto pelo
        // próprio defeito (regra 15).
        temNumero: /\d+,\d\s*d\b/.test(med) || /no mesmo dia/i.test(med),
        naoSabe: /ainda não sei/i.test(med),
        ultima: /última etapa/i.test(med),
        // "Medições" é a penúltima coluna; o texto dela é só o n.
        n: Number(tds[tds.length - 2]?.textContent?.trim()),
        vies: /8 em cada 10 levam/i.test(tr.textContent ?? ""),
        linha: tr.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    });
    const previsoes = [...document.querySelectorAll('[data-teste="linha-previsao"]')].map((tr) => ({
      numero: tr.getAttribute("data-numero"),
      previsao: tr.querySelector('[data-teste="previsao"]')?.textContent?.trim() ?? "",
      pill: tr.querySelector(".pill")?.textContent?.trim() ?? "",
      classe: tr.querySelector(".pill")?.className ?? "",
    }));
    return {
      aprendidas: num("etapas-aprendidas"),
      comPrevisao: num("com-previsao"),
      atrasaTexto:
        document.querySelector('[data-teste="atrasa"]')?.textContent?.trim() ?? "",
      etapas,
      previsoes,
      semPrevisao:
        document.querySelector('[data-teste="sem-previsao"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      corpo: document.body.innerText,
      temBlocoVazio: !!document.querySelector(".tempos-vazio"),
    };
  });

const t = await ler();

// ── 1) O PORTÃO: o KPI e a tabela contam a mesma coisa (regra 4) ──
const comNumero = t.etapas.filter((e) => e.temNumero).length;
checa(
  "PORTÃO B8: o KPI “etapas aprendidas” = as etapas com número na tabela",
  t.aprendidas === comNumero,
  `KPI ${t.aprendidas} × tabela ${comNumero}`,
);
checa(
  "PORTÃO B8: o KPI “pedidos com previsão” = as linhas da tabela de previsão",
  t.comPrevisao === t.previsoes.length,
  `KPI ${t.comPrevisao} × tabela ${t.previsoes.length}`,
);
const atrasando = t.previsoes.filter((p) => /depois do prazo/i.test(p.pill)).length;
if (t.comPrevisao === 0) {
  checa(
    "PORTÃO B8: sem previsão nenhuma, “atrasam pela conta” é um traço, não 0",
    t.atrasaTexto === "—",
    `mostrou “${t.atrasaTexto}”`,
  );
} else {
  checa(
    "PORTÃO B8: o KPI “atrasam pela conta” = as linhas que dizem “depois do prazo”",
    Number(t.atrasaTexto) === atrasando,
    `KPI ${t.atrasaTexto} × linhas ${atrasando}`,
  );
}

// ── 2) Amostra curta NUNCA vira número (regra 3) ──────────────────
const curtas = t.etapas.filter((e) => !e.ultima && e.n < 3);
if (curtas.length === 0) {
  pula(
    "etapa com amostra curta diz “ainda não sei”",
    "nenhuma etapa desta base está abaixo da amostra mínima",
  );
} else {
  const mentiu = curtas.filter((e) => e.temNumero);
  checa(
    "PORTÃO B8: etapa com amostra curta diz “ainda não sei”, e nunca um número",
    mentiu.length === 0,
    mentiu.map((e) => `${e.etapa}: “${e.medianaTexto}”`).join(" | "),
  );
  const semQuantoFalta = curtas.filter((e) => !/falta/i.test(e.medianaTexto));
  checa(
    "a etapa que não sabe diz quantos pedidos faltam para saber",
    semQuantoFalta.length === 0,
    semQuantoFalta.map((e) => e.etapa).join(", "),
  );
}

// ── 3) Última etapa: "não se mede" ≠ "não sei" ────────────────────
const ultimas = t.etapas.filter((e) => e.ultima);
if (ultimas.length === 0) {
  pula("a última etapa se explica", "nenhuma linha marcada como última etapa");
} else {
  checa(
    "a última etapa diz que nada sai dela, em vez de fingir que falta amostra",
    ultimas.every((e) => !e.naoSabe && !e.temNumero),
    ultimas.map((e) => `${e.etapa}: “${e.medianaTexto}”`).join(" | "),
  );
}

// ── 4) O viés da conta aparece onde ele existe ────────────────────
const comVies = t.etapas.filter((e) => e.vies);
if (comVies.length === 0) {
  pula(
    "o viés da conta aparece",
    "nenhuma etapa tem pedido parado há mais tempo que o p80 dela",
  );
} else {
  checa(
    "onde o mais antigo da fila passa do p80, a tela avisa que o número está otimista",
    comVies.every((e) => e.temNumero),
    comVies.map((e) => e.etapa).join(", "),
  );
}

// ── 5) Pedido sem previsão NÃO ganha data ─────────────────────────
if (!t.semPrevisao) {
  pula("pedido sem histórico não ganha data", "todos os pedidos têm previsão nesta base");
} else {
  checa(
    "PORTÃO B8: os pedidos sem previsão são contados e explicados, não escondidos",
    /\d+ pedido\(s\)/.test(t.semPrevisao) && /falta/i.test(t.semPrevisao),
    t.semPrevisao.slice(0, 110),
  );
  // Nenhum número da tabela de previsão pode ser um pedido "sem previsão":
  // a tabela só existe para quem tem data.
  checa(
    "nenhuma linha da tabela de previsão está sem data",
    t.previsoes.every((p) => /\d{2}\/\d{2}/.test(p.previsao)),
    t.previsoes.find((p) => !/\d{2}\/\d{2}/.test(p.previsao))?.numero ?? "",
  );
}

// ── 6) A cor sempre vem com texto (regra 5) ───────────────────────
if (t.previsoes.length === 0) {
  pula("cor com rótulo em texto", "não há linha de previsão nesta base");
} else {
  const semTexto = t.previsoes.filter((p) => p.pill.length < 3);
  checa(
    "toda pill de situação traz a frase junto, nunca só a cor",
    semTexto.length === 0,
    semTexto.map((p) => p.numero).join(", "),
  );
  const classesValidas = t.previsoes.every((p) =>
    /\b(ok|aperta|estourou)\b/.test(p.classe),
  );
  checa("a classe da pill é uma das três situações de prazo", classesValidas);
}

// ── 7) A conta está escrita na tela, para o dono conferir ─────────
const explicacao = (await pg.textContent(".formato")) ?? "";
checa(
  "a tela explica a conta em palavras (mediana, não média)",
  /mediana/i.test(explicacao) && /média/i.test(explicacao),
);
checa(
  "a tela avisa que só fala quando tem amostra suficiente",
  /não ganha data/i.test(explicacao),
);
checa(
  "a tela diz que são dias corridos",
  /dias corridos/i.test(explicacao),
);

// ── 8) O radar: a segunda régua não repete a primeira ─────────────
await pg.goto(`${BASE}/app/radar`, { waitUntil: "networkidle" });
await pg.waitForSelector('[data-teste="pela-conta"]', { timeout: 30000 });
const r = await pg.evaluate(() => {
  const sec = document.querySelector('[data-teste="pela-conta"]');
  const numeros = (raiz, sel) =>
    [...raiz.querySelectorAll(sel)].map((x) => x.textContent.trim());
  return {
    noRadar: numeros(document, '[data-teste="lista-radar"] .radar-titulo .mono'),
    pelaConta: numeros(document, '[data-teste="lista-conta"] .radar-titulo .mono'),
    motivos: [...document.querySelectorAll('[data-teste="lista-conta"] .radar-motivo')].map((m) =>
      m.textContent.replace(/\s+/g, " ").trim(),
    ),
    texto: sec.innerText.replace(/\s+/g, " ").trim(),
    classes: [...sec.querySelectorAll(".pill")].map((p) => p.className),
  };
});

const repetidos = r.pelaConta.filter((n) => r.noRadar.includes(n));
checa(
  "PORTÃO B8: nenhum pedido aparece nas duas listas do radar",
  repetidos.length === 0,
  repetidos.join(", "),
);

if (r.pelaConta.length === 0) {
  // Aqui mora o erro que este bloco existe para não cometer: quando não há
  // previsão nenhuma, a seção NÃO pode dizer "nenhum pedido atrasa".
  if (t.comPrevisao === 0) {
    checa(
      "PORTÃO B8: sem histórico, o radar diz que NÃO SABE — nunca que está tudo bem",
      /ainda não sei/i.test(r.texto) && !/nenhum outro chega depois/i.test(r.texto),
      r.texto.slice(0, 120),
    );
  } else {
    checa(
      "com previsão e nada atrasando, o radar diz isso com o número na frente",
      /nenhum outro chega depois do prazo/i.test(r.texto),
      r.texto.slice(0, 120),
    );
  }
} else {
  checa(
    "cada item da segunda lista diz a data prevista e o quanto passa do prazo",
    r.motivos.every((m) => /\d{2}\/\d{2}/.test(m) && /depois do prazo/i.test(m)),
    r.motivos[0] ?? "",
  );
  // Âmbar, não vermelho: o prazo ainda não passou.
  checa(
    "a segunda lista é âmbar (aviso), não vermelha (estouro consumado)",
    r.classes.every((c) => /\baperta\b/.test(c) && !/\bestourou\b/.test(c)),
    r.classes.join(" | "),
  );
  checa(
    "o radar avisa que esta lista não entra na mensagem copiada",
    /não.{0,3} entra na mensagem copiada/i.test(r.texto),
    r.texto.slice(-140),
  );
}

// ── 9) Layout medido (regra 9) ────────────────────────────────────
for (const [nome, w, h] of [
  ["desktop", 1280, 950],
  ["celular", 390, 844],
]) {
  await pg.setViewportSize({ width: w, height: h });
  await pg.goto(`${BASE}/app/tempos`, { waitUntil: "networkidle" });
  const sobra = await pg.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checa(`layout ${nome}: sem rolagem lateral`, sobra <= 0, `${sobra}px`);
}

console.log("\n=== PORTÃO B8 ===");
ok.forEach((o) => console.log("  ✓", o));
pulados.forEach((p) => console.log("  ~ PULADO:", p));
falhas.forEach((f) => console.log("  ✗", f));
console.log(
  `\n${ok.length} passaram, ${falhas.length} falharam, ${pulados.length} pulados por falta de caso na base`,
);
await navegador.close();
process.exit(falhas.length ? 1 : 0);
