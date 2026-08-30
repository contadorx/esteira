export interface ResultadoEntrada {
  estado: "ocioso" | "erro";
  mensagem: string | null;
}

export const ENTRADA_OCIOSA: ResultadoEntrada = { estado: "ocioso", mensagem: null };
