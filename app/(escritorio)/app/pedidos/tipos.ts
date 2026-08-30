export interface LinhaPedido {
  id: string;
  numero: string;
  clienteNome: string;
  /**
   * Nome que vai na MENSAGEM. Completo de propósito: é a oficina escrevendo
   * para o próprio cliente, pelo WhatsApp dela. A régua curta (nada de nome)
   * vale para a página pública, que pode ser reencaminhada.
   */
  clientePrimeiroNome: string;
  fone: string | null;
  descricao: string | null;
  prazo: string | null;
  origem: string;
  tipo: string;
  tokenPublico: string;
  etapaNome: string | null;
  /** Decide entre a mensagem de "avançou" e a de "está pronto". */
  naUltimaEtapa: boolean;
}
