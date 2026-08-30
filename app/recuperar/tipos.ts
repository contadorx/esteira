/**
 * Estados nomeados, nunca um booleano (regra 1). "ociosa" e "enviado" não são
 * a mesma coisa que "erro com mensagem vazia".
 */
export type ResultadoRecuperacao =
  | { estado: "ociosa"; mensagem: null }
  | { estado: "enviado"; mensagem: string }
  | { estado: "erro"; mensagem: string };

export const RECUPERACAO_OCIOSA: ResultadoRecuperacao = { estado: "ociosa", mensagem: null };
