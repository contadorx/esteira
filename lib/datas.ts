/**
 * datas.ts — o ÚNICO "hoje" do produto (regra 8 do 05-regras-de-engenharia).
 *
 * Tudo aqui trabalha com datas-calendário no formato ISO "YYYY-MM-DD",
 * SEMPRE no fuso America/Sao_Paulo. Nenhum outro arquivo pode chamar
 * `new Date()` para decidir vencimento — importa daqui.
 *
 * Armadilhas que este arquivo existe para matar:
 * - `new Date("2026-08-13")` devolve o dia ANTERIOR em fuso negativo;
 * - tela em UTC e mensagem em SP discordam sobre "venceu" entre 21h e 0h;
 * - regex aceita 31/02 — validação é de calendário, não de formato.
 */

const FUSO = "America/Sao_Paulo";

/** Hoje como "YYYY-MM-DD" no fuso de São Paulo. */
export function hoje(): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** True se a string é uma data-calendário real (2026-02-31 → false). */
export function ehDataValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

/**
 * Dias de `deIso` até `ateIso` (positivo = futuro). Ambos "YYYY-MM-DD".
 * Meio-dia UTC nos dois lados: imune a horário de verão e a fuso.
 */
export function diasEntre(deIso: string, ateIso: string): number {
  const meioDia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  return Math.round((meioDia(ateIso) - meioDia(deIso)) / 86_400_000);
}

/** Dias de hoje (SP) até o prazo. 0 = vence hoje; negativo = estourou. */
export function diasAteOPrazo(prazoIso: string): number {
  return diasEntre(hoje(), prazoIso);
}

/** "DD/MM" para exibição, sem passar por Date (corte de string). */
export function curtaBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/**
 * "Agora" em hora de São Paulo, no formato HH:MM. Existe aqui pelo mesmo
 * motivo que `hoje()`: para não haver um segundo relógio no projeto (regra 8).
 * Use apenas para exibir um instante do NAVEGADOR — hora vinda do servidor se
 * formata a partir do timestamp que ele devolveu.
 */
export function agoraHoraCurta(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

/** Formata um instante conhecido (ISO do servidor) como HH:MM em São Paulo. */
export function horaCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * O mesmo dia do mês seguinte, aparando o que não existe: 31/01 vira 28/02
 * (ou 29/02 em ano bissexto). Existe para a cobrança calcular até quando o
 * período pago vale, sem inventar 31 de fevereiro.
 */
export function mesSeguinte(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const anoAlvo = mes === 12 ? ano + 1 : ano;
  const mesAlvo = mes === 12 ? 1 : mes + 1;
  // Dia 0 do mês seguinte ao alvo = último dia do mês alvo.
  const ultimoDia = new Date(Date.UTC(anoAlvo, mesAlvo, 0)).getUTCDate();
  const dd = String(Math.min(dia, ultimoDia)).padStart(2, "0");
  const mm = String(mesAlvo).padStart(2, "0");
  return `${anoAlvo}-${mm}-${dd}`;
}

/** O maior de dois dias ISO — comparação de string basta neste formato. */
export function diaMaior(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Situação de prazo — a ÚNICA fonte da cor do produto (regra 5). */
export type SituacaoPrazo = "ok" | "aperta" | "estourou";

/**
 * A régua, a partir de uma FOLGA em dias — quantos dias sobram entre o que se
 * espera e o que foi prometido. Negativo = já estourou.
 *
 * Existe separada de `situacaoDoPrazo` porque a fase 2 trouxe uma segunda
 * folga: a que compara a data PREVISTA pelo histórico com o prazo prometido.
 * Duas telas calculando o mesmo limiar por conta própria é a regra 12
 * esperando para cobrar — e, na regra 5, um limiar diferente em cada tela
 * significa que verde deixou de querer dizer a mesma coisa.
 */
export function situacaoDaFolga(dias: number): SituacaoPrazo {
  if (dias < 0) return "estourou";
  if (dias <= 2) return "aperta";
  return "ok";
}

export function situacaoDoPrazo(prazoIso: string): SituacaoPrazo {
  return situacaoDaFolga(diasAteOPrazo(prazoIso));
}
