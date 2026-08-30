/**
 * O contrato de `tempos()` (migration 20260830_tempos.sql).
 *
 * `null` aqui quer dizer "ainda não sei", nunca zero (regra 3). Os campos que
 * podem vir nulos estão tipados como tal de propósito: assim o compilador
 * obriga a tela a decidir o que dizer quando não se sabe, em vez de deixar o
 * `??  0` acontecer sozinho.
 */

export interface EtapaAprendida {
  etapa_id: string;
  tipo: string;
  etapa: string;
  ordem: number;
  /** Quantas permanências COMPLETAS foram observadas nesta etapa. */
  n: number;
  /** Saídas para uma etapa anterior — retrabalho. Não entram na mediana. */
  voltas: number;
  /** Nulo até bater a amostra mínima. */
  mediana_dias: number | null;
  p80_dias: number | null;
  maior_dias: number | null;
  /** Quantos pedidos estão nesta etapa AGORA. */
  na_fila: number;
  /** Há quantos dias está aqui o mais antigo da fila. Nulo = fila vazia. */
  mais_antigo_dias: number | null;
  /** Última etapa do caminho: nada sai dela, então não há o que medir. */
  ultima: boolean;
}

export type EstadoPrevisao = "previsto" | "sem_historico" | "chegou";

export interface PedidoPrevisto {
  id: string;
  numero: string;
  cliente: string;
  etapa: string;
  dias_aqui: number;
  prazo: string | null;
  estado: EstadoPrevisao;
  previsao_dias: number | null;
  previsao_data: string | null;
  /** prazo − previsão. Negativo = pela conta, sai DEPOIS do prometido. */
  folga_dias: number | null;
  /** Por que não há data. Preenchido só quando `estado = sem_historico`. */
  sem_previsao: string | null;
}

export interface ResumoTempos {
  /** Etapas que PODEM ser aprendidas (a última de cada caminho não conta). */
  etapas_total: number;
  etapas_aprendidas: number;
  observacoes: number;
  voltas: number;
  pedidos_total: number;
  com_previsao: number;
  ja_chegaram: number;
  atrasa_pela_conta: number;
}

export interface RespostaTempos {
  hoje: string;
  min_amostra: number;
  janela_dias: number;
  etapas: EtapaAprendida[];
  pedidos: PedidoPrevisto[];
  resumo: ResumoTempos;
}

/** "1,8" — vírgula, que é como se lê número em português. */
export function emDias(v: number | null): string {
  if (v === null) return "—";
  if (v < 0.5) return "no mesmo dia";
  return `${v.toFixed(1).replace(".", ",")} d`;
}

/**
 * Quanto tempo faz, em dias inteiros. "há 0 d" é jeito de máquina de dizer
 * "chegou hoje" — e a tela é lida por quem está no chão, não pelo banco.
 */
export function desdeQuando(dias: number): string {
  if (dias <= 0) return "chegou hoje";
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}
