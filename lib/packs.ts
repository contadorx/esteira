/**
 * packs.ts — etapas sugeridas por setor (D6).
 *
 * O que estes packs são: um ponto de partida para a implantação durar uma
 * tarde em vez de uma reunião. O que eles NÃO são: a verdade sobre o setor.
 *
 * Os nomes aqui foram escritos de fora da oficina. A fase 0 (as conversas de
 * campo que colheriam os nomes reais) foi pulada por decisão — então cada
 * pack é HIPÓTESE até um piloto confirmar. Por isso a tela deixa renomear,
 * reordenar e remover tudo depois de aplicar: a expectativa é que o dono
 * mexa, não que aceite.
 *
 * Quando um piloto disser os nomes de verdade, corrija aqui — e anote no
 * 07-estado-do-projeto o que mudou. É informação de produto, não detalhe.
 */

export interface Pack {
  id: string;
  setor: string;
  /** Uma linha sobre quem é esse setor, para o dono se reconhecer. */
  paraQuem: string;
  etapas: string[];
}

export const PACKS: Pack[] = [
  {
    id: "marmoraria",
    setor: "Marmoraria e granito",
    paraQuem: "Bancadas, soleiras, tampos, escadas.",
    etapas: ["Recebido", "Medição", "Corte", "Acabamento", "Montagem", "Pronto", "Entregue"],
  },
  {
    id: "vidracaria",
    setor: "Vidraçaria",
    paraQuem: "Box, janelas, portas de vidro, guarda-corpo.",
    etapas: ["Recebido", "Medição", "Corte", "Lapidação", "Têmpera", "Instalação", "Entregue"],
  },
  {
    id: "grafica",
    setor: "Gráfica rápida",
    paraQuem: "Cartões, banners, panfletos, adesivos.",
    etapas: ["Arte recebida", "Aprovação do cliente", "Impressão", "Acabamento", "Pronto", "Entregue"],
  },
  {
    id: "esquadria",
    setor: "Esquadria e serralheria",
    paraQuem: "Portões, grades, janelas de alumínio, estruturas.",
    etapas: ["Recebido", "Medição", "Corte", "Solda", "Pintura", "Instalação", "Entregue"],
  },
  {
    id: "marcenaria",
    setor: "Marcenaria e planejados",
    paraQuem: "Móveis sob medida, cozinhas, closets.",
    etapas: ["Recebido", "Projeto", "Corte", "Montagem", "Acabamento", "Instalação", "Entregue"],
  },
  {
    id: "confeccao",
    setor: "Confecção e malharia",
    paraQuem: "Uniformes, enxoval, peças sob medida.",
    etapas: ["Recebido", "Modelagem", "Corte", "Costura", "Acabamento", "Pronto", "Entregue"],
  },
  {
    id: "mecanica",
    setor: "Oficina mecânica e funilaria",
    paraQuem: "Reparo de veículos, funilaria e pintura.",
    etapas: ["Recebido", "Diagnóstico", "Orçamento aprovado", "Em serviço", "Teste", "Pronto", "Entregue"],
  },
  {
    id: "assistencia",
    setor: "Assistência técnica",
    paraQuem: "Eletrônicos, eletrodomésticos, equipamentos.",
    etapas: [
      "Recebido",
      "Diagnóstico",
      "Orçamento aprovado",
      "Aguardando peça",
      "Em reparo",
      "Testado",
      "Pronto",
      "Entregue",
    ],
  },
];

export function acharPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}
