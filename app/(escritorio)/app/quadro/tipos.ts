export interface ColunaEtapa {
  id: string;
  nome: string;
  ordem: number;
}

export interface CartaoPedido {
  id: string;
  numero: string;
  cliente: string;
  descricao: string | null;
  prazo: string | null;
  etapaId: string;
  /** timestamptz de quando entrou na etapa atual — alimenta o "3d aqui". */
  etapaDesde: string;
}
