/**
 * Tipos e estados iniciais das ações do escritório.
 *
 * Ficam FORA do arquivo "use server" porque um módulo de server actions só
 * pode exportar funções async — constante exportada de lá quebra o build.
 */

export interface LinhaRejeitada {
  linha: number;
  numero: string;
  motivo: string;
}

export interface ResultadoImport {
  estado: "ocioso" | "pronto" | "recusado";
  /** Erro que impediu processar o arquivo inteiro. */
  erroGeral: string | null;
  inseridos: number;
  rejeitados: LinhaRejeitada[];
  totalLidas: number;
  separador: string | null;
}

export const IMPORT_OCIOSO: ResultadoImport = {
  estado: "ocioso",
  erroGeral: null,
  inseridos: 0,
  rejeitados: [],
  totalLidas: 0,
  separador: null,
};

export interface ResultadoCriar {
  estado: "ocioso" | "erro";
  mensagem: string | null;
  campo: string | null;
}

export const CRIAR_OCIOSO: ResultadoCriar = {
  estado: "ocioso",
  mensagem: null,
  campo: null,
};
