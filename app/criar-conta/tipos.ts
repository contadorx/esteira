export interface ResultadoCadastro {
  estado: "ocioso" | "erro" | "parcial";
  mensagem: string | null;
  /** Campo do formulário que causou o erro, para o foco e o aria-invalid. */
  campo: string | null;
}

export const CADASTRO_OCIOSO: ResultadoCadastro = {
  estado: "ocioso",
  mensagem: null,
  campo: null,
};
