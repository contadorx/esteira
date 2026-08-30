export interface Resposta {
  estado: "ok" | "erro";
  mensagem: string | null;
}

export interface EtapaVista {
  id: string;
  nome: string;
  ordem: number;
  tipo_pedido: string;
  /** Quantos pedidos estão parados nesta etapa agora. */
  pedidos: number;
}
