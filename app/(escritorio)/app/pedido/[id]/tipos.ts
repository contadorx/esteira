export interface PassoDoPedido {
  id: string;
  etapa: string | null;
  quando: string;
  foto: string | null;
  observacao: string | null;
  problema: boolean;
  origem: "entrada" | "chao" | "escritorio" | "outro";
  quem: string;
}

export interface AvisoDoPedido {
  quando: string;
  status: "copiado" | "enviado" | "falhou" | "nao_confirmado";
  template: string;
  destino: string | null;
  erro: string | null;
}

export interface DetalheDoPedido {
  estado: "ok" | "nao_encontrado";
  id: string;
  numero: string;
  cliente: string;
  fone: string | null;
  descricao: string | null;
  prazo: string | null;
  tipo: string;
  origem: string;
  criado_em: string;
  etapa: string | null;
  etapa_ordem: number | null;
  etapa_desde: string;
  dias_aqui: number;
  token_publico: string;
  caminho: { nome: string; ordem: number }[];
  linha_do_tempo: PassoDoPedido[];
  avisos: AvisoDoPedido[];
}
