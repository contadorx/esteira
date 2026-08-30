export interface PedidoChao {
  id: string;
  numero: string;
  /** Apenas o primeiro nome — D1: nada de dado sensível nesta tela. */
  cliente: string;
  descricao: string | null;
  prazo: string | null;
  etapa_id: string;
  etapa_nome: string;
  etapa_desde: string;
  proxima_nome: string;
}
