/** O mínimo de caracteres, num lugar só: a ação valida e o input avisa antes. */
export const MIN_SENHA = 8;

export type ResultadoNovaSenha =
  | { estado: "ociosa"; mensagem: null }
  | { estado: "erro"; mensagem: string };

export const NOVA_SENHA_OCIOSA: ResultadoNovaSenha = { estado: "ociosa", mensagem: null };
