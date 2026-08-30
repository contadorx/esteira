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

/** Situação de prazo — a ÚNICA fonte da cor do produto (regra 5). */
export type SituacaoPrazo = "ok" | "aperta" | "estourou";

export function situacaoDoPrazo(prazoIso: string): SituacaoPrazo {
  const dias = diasAteOPrazo(prazoIso);
  if (dias < 0) return "estourou";
  if (dias <= 2) return "aperta";
  return "ok";
}
