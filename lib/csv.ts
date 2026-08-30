/**
 * csv.ts — leitura tolerante de CSV para o import de pedidos (B1).
 *
 * Tolerante NÃO quer dizer silenciosa (regra 1): tudo que não entra volta com
 * o número da linha e o motivo. Sucesso parcial tem porta própria (regra 14).
 *
 * Realidade do campo: Excel brasileiro exporta com ponto-e-vírgula, salva em
 * UTF-8 com BOM e escreve data como DD/MM/AAAA. Nada disso pode fazer o
 * arquivo ser recusado inteiro.
 */
import { ehDataValida } from "./datas";

export interface LinhaCsv {
  /** Número da linha no arquivo como a pessoa vê no Excel (1 = cabeçalho). */
  linha: number;
  campos: Record<string, string>;
}

export interface LeituraCsv {
  cabecalho: string[];
  linhas: LinhaCsv[];
  separador: ";" | ",";
  /** Erro que impede ler o arquivo inteiro (arquivo vazio, sem cabeçalho). */
  erro: string | null;
}

/** Divide respeitando aspas: "Bancada 2,40 m" não vira duas colunas. */
function dividir(linha: string, sep: string): string[] {
  const saida: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (entreAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        entreAspas = !entreAspas;
      }
    } else if (c === sep && !entreAspas) {
      saida.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  saida.push(atual);
  return saida.map((s) => s.trim());
}

function normalizarChave(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function lerCsv(texto: string): LeituraCsv {
  const semBom = texto.replace(/^\uFEFF/, "");
  const brutas = semBom.split(/\r\n|\n|\r/);
  const indiceCabecalho = brutas.findIndex((l) => l.trim() !== "");

  if (indiceCabecalho === -1) {
    return { cabecalho: [], linhas: [], separador: ",", erro: "Arquivo vazio." };
  }

  const linhaCabecalho = brutas[indiceCabecalho];
  const separador: ";" | "," =
    (linhaCabecalho.match(/;/g)?.length ?? 0) >
    (linhaCabecalho.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const cabecalho = dividir(linhaCabecalho, separador).map(normalizarChave);
  if (cabecalho.filter(Boolean).length < 2) {
    return {
      cabecalho,
      linhas: [],
      separador,
      erro:
        "Não reconheci o cabeçalho. A primeira linha precisa ter os nomes das " +
        "colunas separados por ponto-e-vírgula ou vírgula.",
    };
  }

  const linhas: LinhaCsv[] = [];
  for (let i = indiceCabecalho + 1; i < brutas.length; i++) {
    if (brutas[i].trim() === "") continue;
    const valores = dividir(brutas[i], separador);
    const campos: Record<string, string> = {};
    cabecalho.forEach((chave, j) => {
      if (chave) campos[chave] = valores[j] ?? "";
    });
    linhas.push({ linha: i + 1, campos });
  }

  return { cabecalho, linhas, separador, erro: null };
}

/**
 * Aceita DD/MM/AAAA, DD-MM-AAAA e AAAA-MM-DD; devolve ISO "AAAA-MM-DD".
 * Confere CALENDÁRIO, não formato: 31/02/2026 é recusado (regra 8).
 * Devolve null quando não dá para entender — quem chama diz o motivo.
 */
export function normalizarData(bruto: string): string | null {
  const s = bruto.trim();
  if (!s) return null;

  let iso: string | null = null;
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (br) {
    iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = s;
  }

  if (!iso) return null;
  return ehDataValida(iso) ? iso : null;
}

/** Deixa só dígitos e põe o DDI 55 quando o número vem como o brasileiro digita. */
export function normalizarTelefone(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.length === 12 || digitos.length === 13) return digitos;
  return null;
}
