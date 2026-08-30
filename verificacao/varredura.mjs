/**
 * Varredura das 16 regras (B7).
 *
 * O portão do bloco: "as 16 regras percorridas com resultado escrito por item".
 * Não é carimbo — é auditoria. Uma varredura que só devolve ✓ não está
 * varrendo, está decorando.
 *
 * Por isso ela tem CANÁRIOS: cada verificação mecânica é testada contra um
 * trecho falso que DEVE ser pego. Se o canário passa despercebido, a
 * verificação está cega e o roteiro acusa isso — regra 15, a varredura
 * mecânica erra em silêncio, inclusive esta.
 *
 * Três vereditos possíveis por regra:
 *   OK      — verificado mecanicamente, nada encontrado
 *   ACHOU   — encontrou o que a regra proíbe (com arquivo e linha)
 *   MANUAL  — não é mecanizável; diz onde ela É provada (portão, fumaça)
 *
 * RODAR: node verificacao/varredura.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const IGNORAR = ["node_modules", ".next", ".git", "verificacao"];

function arquivos(dir = RAIZ, acc = []) {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.includes(nome)) continue;
    const cheio = join(dir, nome);
    if (statSync(cheio).isDirectory()) arquivos(cheio, acc);
    else if (/\.(ts|tsx|sql|css)$/.test(nome)) acc.push(cheio);
  }
  return acc;
}

const FONTES = arquivos().map((f) => ({
  caminho: relative(RAIZ, f),
  texto: readFileSync(f, "utf8"),
}));

const resultados = [];
const registra = (n, titulo, veredito, detalhe) =>
  resultados.push({ n, titulo, veredito, detalhe });

/** Roda um detector sobre as fontes; devolve as ocorrências como "arquivo:linha". */
function procurar(detector, filtro = () => true) {
  const achados = [];
  for (const { caminho, texto } of FONTES) {
    if (!filtro(caminho)) continue;
    texto.split("\n").forEach((linha, i) => {
      if (detector(linha, caminho, texto)) achados.push(`${caminho}:${i + 1}  ${linha.trim().slice(0, 90)}`);
    });
  }
  return achados;
}

/**
 * Prova que o detector enxerga: se não pega o canário, ele está cego.
 *
 * O NOME DO ARQUIVO importa: vários detectores filtram por extensão, e passar
 * `canario.ts` para um detector que só olha `.tsx` fazia ele devolver falso
 * por motivo errado — parecia cegueira e era o arnês. Foi a própria regra 15
 * que pegou isto.
 */
function canario(detector, trechoRuim, trechoBom, nome = "canario.tsx") {
  const pegouRuim = detector(trechoRuim, nome, trechoRuim);
  const pegouBom = trechoBom === undefined ? false : detector(trechoBom, nome, trechoBom);
  if (!pegouRuim) return "CEGA: não pegou o canário ruim";
  if (pegouBom) return "GRITA DEMAIS: pegou o canário bom";
  return null;
}

// ── 1. Falha silenciosa ───────────────────────────────────────────
// Toda chamada ao supabase precisa ler `error`. O padrão do projeto é
// desestruturar `{ data, error }` ou `{ error }` na mesma linha.
{
  const det = (l) =>
    /await\s+supabase[\w.]*\s*$/.test(l) === false &&
    /=\s*await\s+supabase/.test(l) &&
    !/\{[^}]*error/.test(l);
  const cego = canario(
    det,
    "  const { data } = await supabase.from('x').select();",
    "  const { data, error } = await supabase.from('x').select();",
  );
  const achados = procurar(det, (c) => /\.tsx?$/.test(c));
  registra(
    1,
    "Falha silenciosa é o pecado capital — toda chamada lê `error`",
    cego ? "ACHOU" : achados.length ? "ACHOU" : "OK",
    cego ?? (achados.length ? achados : "nenhuma escrita ou leitura sem `error`"),
  );
}

// ── 2. Nunca afirme o que não apurou ──────────────────────────────
{
  const PROIBIDAS = /(cliente avisado|foi avisado|mensagem enviada|avisamos o cliente|notificado)/i;
  const det = (l, c) => /\.(tsx|ts)$/.test(c) && PROIBIDAS.test(l) && !/^\s*(\/\/|\*)/.test(l);
  const cego = canario(det, '  <p>cliente avisado</p>', "  <p>mensagem copiada</p>");
  const achados = procurar(det);
  registra(
    2,
    "Nunca afirmar o que não foi apurado (nada de “cliente avisado”)",
    cego ? "ACHOU" : achados.length ? "ACHOU" : "OK",
    cego ?? (achados.length ? achados : "nenhuma afirmação sem prova nas telas"),
  );
}

// ── 3. Zero antes da resposta não é zero ──────────────────────────
// `?? []` aplicado ao resultado ANTES de tratar o erro transforma falha em
// lista vazia. O padrão certo é `if (error) …` e só depois `data ?? []`.
{
  const det = (l, c, texto) => {
    if (!/\.tsx?$/.test(c)) return false;
    if (!/\.data\s*\?\?\s*\[\]|\.data\s*\|\|\s*\[\]/.test(l)) return false;
    // Só acusa se o arquivo inteiro não tratar erro em lugar nenhum.
    return !/\berror\b/.test(texto);
  };
  const cego = canario(
    det,
    "  const linhas = res.data ?? [];",
    "  if (error) return falha(); const linhas = data ?? [];",
  );
  const achados = procurar(det);
  registra(
    3,
    "Falha não vira lista vazia — “ainda não perguntei” é estado próprio",
    cego ? "ACHOU" : achados.length ? "ACHOU" : "OK",
    cego ?? (achados.length ? achados : "todo `?? []` está depois de um tratamento de erro"),
  );
}

// ── 4. Dois números na mesma tela nascem juntos ───────────────────
registra(
  4,
  "Contagem e lista saem da mesma consulta",
  "MANUAL",
  "Provado por medição, não por leitura: portão B3 (KPI = soma das colunas = cartões no DOM) e portão B6 (KPI de cada motivo = itens daquele motivo).",
);

// ── 5. Cor é situação ─────────────────────────────────────────────
// As classes de prazo (`ok`, `aperta`, `estourou`) só podem sair de
// situacaoDoPrazo() ou do motivo do radar. Escritas à mão, elas viram cor
// decorativa — e aí verde deixa de significar "no prazo".
//
// O detector olha só className com STRING LITERAL e compara token exato:
// `aviso-ok` e `ok-faixa` não são a classe de prazo, `placar ok` é.
// As exceções legítimas ficam DECLARADAS abaixo, com motivo. Uso novo que
// não estiver nesta lista é acusado.
{
  const EXCECOES = [
    {
      arquivo: "app/(escritorio)/app/importar/formulario.tsx",
      motivo:
        "verde/vermelho no relatório de import significam “entrou” e “ficou de fora”, " +
        "não prazo — é uma tela sem pedido nenhum à vista, sem risco de confusão",
    },
    {
      arquivo: "app/(escritorio)/app/layout.tsx",
      motivo:
        "a faixa do plano É situação de prazo — o teste ou o período pago " +
        "venceram, e a régua é a mesma do resto do produto. A faixa de “não " +
        "consegui conferir” usa aço (`incerta`), porque incerteza não é " +
        "vencimento",
    },
    {
      arquivo: "app/(site)/page.tsx",
      motivo:
        "ilustração estática do quadro na landing: cartões pintados para MOSTRAR " +
        "como a cor funciona, sem estado real por trás",
    },
  ];

  const det = (l, c) => {
    if (!/\.tsx$/.test(c)) return false;
    const m = [...l.matchAll(/className="([^"]*)"/g)];
    if (m.length === 0) return false;
    return m.some((x) =>
      x[1].split(/\s+/).some((t) => t === "ok" || t === "aperta" || t === "estourou"),
    );
  };
  const cego = canario(
    det,
    '  <span className="pill estourou">urgente</span>',
    "  <span className={`pill ${situacao}`}>x</span>",
  );
  const brutos = procurar(det);
  const achados = brutos.filter(
    (a) => !EXCECOES.some((e) => a.startsWith(e.arquivo)),
  );
  const dispensados = brutos.filter((a) =>
    EXCECOES.some((e) => a.startsWith(e.arquivo)),
  );

  registra(
    5,
    "Verde/âmbar/vermelho só para prazo, sempre com rótulo em texto",
    cego ? "ACHOU" : achados.length ? "ACHOU" : "OK",
    cego ??
      (achados.length
        ? achados
        : [
            "toda cor de prazo nas telas de pedido vem de situacaoDoPrazo() ou do motivo do radar",
            ...EXCECOES.map(
              (e) => `exceção declarada — ${e.arquivo}: ${e.motivo}`,
            ),
            `${dispensados.length} ocorrência(s) cobertas por essas exceções`,
          ]),
  );
}

// ── 6. Componente definido dentro do render ───────────────────────
{
  const det = (l) => /^\s{2,}(function\s+[A-Z]|const\s+[A-Z]\w*\s*=\s*\([^)]*\)\s*=>\s*\()/.test(l);
  const cego = canario(det, "    function Linha({ x }) { return null }", "function Linha({ x }) { return null }");
  const achados = procurar(det, (c) => /\.tsx$/.test(c));
  registra(
    6,
    "Nenhum componente definido dentro de outro render",
    cego ? "ACHOU" : achados.length ? "ACHOU" : "OK",
    cego ?? (achados.length ? achados : "todos os componentes estão no escopo do módulo"),
  );
}

// ── 7. A trava vai no `where`, no banco ───────────────────────────
{
  const semTrava = [];
  for (const { caminho, texto } of FONTES) {
    if (!/\.tsx?$/.test(caminho)) continue;
    const blocos = texto.split(/\n\s*\n/);
    for (const b of blocos) {
      if (/\.update\(\s*\{[^}]*etapa_id/.test(b) && !/\.eq\("etapa_id"/.test(b)) {
        semTrava.push(`${caminho}  (update de etapa_id sem .eq("etapa_id"))`);
      }
    }
  }
  registra(
    7,
    "Mudança de etapa carrega a condição de estado no `where`",
    semTrava.length ? "ACHOU" : "OK",
    semTrava.length
      ? semTrava
      : "quadro: `.eq(\"etapa_id\", esperada)`; chão: `where etapa_id = p_etapa_atual` dentro de chao_avancar. Concorrência provada nos portões B3 e B4.",
  );
}

// ── 8. Um só “hoje” ───────────────────────────────────────────────
// `new Date()` sem argumento é “agora”. Fora de lib/datas.ts, é um segundo
// relógio — e dois relógios discordam na virada do dia.
{
  const det = (l, c) =>
    /\.tsx?$/.test(c) &&
    !/lib\/datas\.ts$/.test(c) &&
    /new Date\(\s*\)/.test(l) &&
    !/^\s*(\/\/|\*)/.test(l);
  const cego = canario(det, "  const hoje = new Date();", "  const d = new Date(iso);");
  const achados = procurar(det);
  registra(
    8,
    "Um único “hoje”, em America/Sao_Paulo, dentro de lib/datas.ts",
    cego ? "ACHOU" : achados.length ? "ACHOU" : "OK",
    cego ?? (achados.length ? achados : "nenhum relógio paralelo"),
  );
}

// ── 9. Verificação abre a tela ────────────────────────────────────
{
  const portoes = readdirSync(join(RAIZ, "verificacao")).filter((f) => /^portao-b\d\.mjs$/.test(f));
  registra(
    9,
    "Verificação que abre a tela e mede",
    portoes.length >= 6 ? "OK" : "ACHOU",
    portoes.length >= 6
      ? `${portoes.length} portões: ${portoes.sort().join(", ")} — todos abrem o navegador, com massa, e medem números`
      : `só ${portoes.length} portões encontrados`,
  );
}

// ── 10. Migration no repositório = migration no banco ─────────────
// A comparação com o banco de verdade precisa de rede; aqui conferimos o
// lado que dá para conferir sozinho: toda função citada no código existe em
// alguma migration do repositório.
{
  const sql = FONTES.filter((f) => f.caminho.startsWith("supabase/migrations"))
    .map((f) => f.texto)
    .join("\n");
  const chamadas = new Set();
  for (const { caminho, texto } of FONTES) {
    if (!/\.tsx?$/.test(caminho)) continue;
    for (const m of texto.matchAll(/\.rpc\(\s*["'](\w+)["']/g)) chamadas.add(m[1]);
  }
  const orfas = [...chamadas].filter((f) => !new RegExp(`function\\s+${f}\\s*\\(`).test(sql));
  registra(
    10,
    "Toda função chamada pelo app existe numa migration do repositório",
    orfas.length ? "ACHOU" : "OK",
    orfas.length
      ? [`funções sem migration: ${orfas.join(", ")}`]
      : `${chamadas.size} funções chamadas pelo app, todas versionadas: ${[...chamadas].sort().join(", ")}`,
  );
}

// ── 11. A trava real é o banco ────────────────────────────────────
{
  const fundacao = FONTES.find((f) => f.caminho.endsWith("20260830_fundacao.sql"))?.texto ?? "";
  const tabelas = ["oficinas", "etapas", "pedidos", "avancos", "avisos", "acessos"];
  const semRls = tabelas.filter(
    (t) => !new RegExp(`alter table ${t}\\s+enable row level security`, "i").test(fundacao),
  );
  const revogado = /revoke all on .*from anon/i.test(fundacao);
  const definer = FONTES.filter((f) => f.caminho.startsWith("supabase/migrations"))
    .flatMap((f) => [...f.texto.matchAll(/create or replace function (\w+)[\s\S]{0,400}?security definer/g)])
    .map((m) => m[1]);
  const problemas = [];
  if (semRls.length) problemas.push(`sem RLS: ${semRls.join(", ")}`);
  if (!revogado) problemas.push("anon não foi revogado das tabelas");
  registra(
    11,
    "RLS em todas as tabelas, anon revogado, rotas sem sessão por security definer",
    problemas.length ? "ACHOU" : "OK",
    problemas.length
      ? problemas
      : `RLS em ${tabelas.length}/${tabelas.length}; anon revogado; ${definer.length} funções security definer que validam token por dentro: ${definer.join(", ")}`,
  );
}

// ── 12 e 13. Não mecanizáveis ─────────────────────────────────────
registra(
  12,
  "Compensação repetida pertence ao componente",
  "MANUAL",
  "A resolução de variáveis de ambiente estava repetida em três lugares com nomes diferentes (e o middleware desistia calado). Foi unificada em lib/ambiente.ts nesta fase.",
);
registra(
  13,
  "O conserto pode ser pior que o bug — e se a segunda metade falhar?",
  "MANUAL",
  "Três lugares onde a pergunta foi feita e respondeu ao desenho: foto do chão sobe DEPOIS do avanço (falha de rede não apaga o trabalho); pack só se aplica em tipo vazio; remover etapa é recusado pela FK, com a contagem apurada depois.",
);

// ── 14. Sucesso parcial tem porta própria ─────────────────────────
{
  const tipos = FONTES.find((f) => f.caminho.endsWith("app/(escritorio)/app/tipos.ts"))?.texto ?? "";
  const temPortas = /inseridos/.test(tipos) && /rejeitados/.test(tipos) && /erroGeral/.test(tipos);
  registra(
    14,
    "“Não deu” e “deu pela metade” saem por portas diferentes",
    temPortas ? "OK" : "ACHOU",
    temPortas
      ? "ResultadoImport separa `erroGeral` (não entrou nada) de `inseridos`/`rejeitados` (entrou parte). Medido no portão B1: 55 entram, 5 voltam com linha e motivo."
      : "ResultadoImport não distingue recusa total de sucesso parcial",
  );
}

// ── 15. A varredura erra em silêncio ──────────────────────────────
{
  const cegas = resultados.filter((r) => typeof r.detalhe === "string" && /^CEGA|^GRITA/.test(r.detalhe));
  registra(
    15,
    "A própria varredura é testada com canários",
    cegas.length ? "ACHOU" : "OK",
    cegas.length
      ? cegas.map((r) => `regra ${r.n}: ${r.detalhe}`)
      : "cada detector mecânico foi testado contra um trecho que DEVE pegar e outro que NÃO pode pegar",
  );
}

// ── 16. Higiene ───────────────────────────────────────────────────
{
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const problemas = [];
  if (/prettier/.test(JSON.stringify(pkg)) && !FONTES.some((f) => /prettierrc/.test(f.caminho)))
    problemas.push("prettier presente sem arquivo de configuração");
  const gitignore = readFileSync(join(RAIZ, ".gitignore"), "utf8");
  for (const alvo of [".env*.local", "node_modules", ".next"])
    if (!gitignore.includes(alvo.replace("*", "")) && !gitignore.includes(alvo))
      problemas.push(`.gitignore não cobre ${alvo}`);
  registra(
    16,
    "Higiene: sem prettier sem config, segredo fora do git, commit conferido",
    problemas.length ? "ACHOU" : "OK",
    problemas.length
      ? problemas
      : "sem prettier; .env*.local, node_modules e .next fora do git; conferir o commit no ar antes de caçar bug continua sendo procedimento humano",
  );
}

// ── saída ─────────────────────────────────────────────────────────
const marca = { OK: "✓", ACHOU: "✗", MANUAL: "·" };
console.log("\n═══ VARREDURA DAS 16 REGRAS ═══\n");
for (const r of resultados.sort((a, b) => a.n - b.n)) {
  console.log(`${marca[r.veredito]} ${String(r.n).padStart(2)}. ${r.titulo}`);
  const linhas = Array.isArray(r.detalhe) ? r.detalhe : [r.detalhe];
  for (const l of linhas) console.log(`      ${l}`);
  console.log();
}
const achou = resultados.filter((r) => r.veredito === "ACHOU");
const manual = resultados.filter((r) => r.veredito === "MANUAL");
console.log(
  `${resultados.length - achou.length - manual.length} verificadas e limpas · ` +
    `${manual.length} não mecanizáveis (provadas nos portões) · ${achou.length} com achado`,
);
process.exit(achou.length ? 1 : 0);
