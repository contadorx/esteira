/**
 * O CANAL DE SUPORTE — um lugar só.
 *
 * O e-mail estava escrito à mão dentro da landing. Agora ele aparece em quatro
 * telas (landing, recuperação de senha, termos, privacidade) e o WhatsApp
 * entra junto — quatro cópias de um número de telefone é a regra 12 esperando
 * para acontecer: um dia o número muda e três telas continuam com o antigo.
 *
 * Vem do ambiente para poder trocar sem deploy, com um padrão que funciona
 * mesmo sem variável nenhuma configurada.
 */

/** O e-mail que responde. */
export function emailDeSuporte(): string {
  return process.env.EMAIL_SUPORTE?.trim() || "leandropucsp@gmail.com";
}

/**
 * O WhatsApp do suporte, só dígitos com DDI — vazio quando não configurado.
 * Vazio é um estado legítimo: melhor a tela omitir o WhatsApp do que exibir um
 * número inventado que ninguém atende (regra 2).
 */
export function whatsappDeSuporte(): string {
  return (process.env.WHATSAPP_SUPORTE ?? "").replace(/\D/g, "");
}

/** O mesmo número, formatado para leitura. Vazio quando não há número. */
export function whatsappLegivel(): string {
  const d = whatsappDeSuporte();
  // +55 (11) 91234-5678
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  return d ? `+${d}` : "";
}

/**
 * O canal a mostrar quando a pessoa está travada: WhatsApp se houver, e-mail
 * sempre. Devolve o texto pronto, para as telas não repetirem o `if`.
 */
export function canalDeSocorro(): string {
  const zap = whatsappLegivel();
  return zap ? `${zap} (WhatsApp) ou ${emailDeSuporte()}` : emailDeSuporte();
}

/** A razão social e o CNPJ que os termos e a privacidade precisam nomear. */
export function operadora(): { nome: string; documento: string } {
  return {
    nome: process.env.RAZAO_SOCIAL?.trim() || "",
    documento: process.env.CNPJ?.trim() || "",
  };
}
