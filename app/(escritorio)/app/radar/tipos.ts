export type MotivoRadar = "venceu" | "aperta" | "parado";

export interface ItemRadar {
  id: string;
  numero: string;
  cliente: string;
  descricao: string | null;
  etapa: string;
  prazo: string | null;
  dias_parado: number;
  etapas_restantes: number;
  dias_ate_o_prazo: number | null;
  motivo: MotivoRadar;
}

export interface RespostaRadar {
  hoje: string;
  lista: ItemRadar[];
  ontem: { avancaram: number; parados: number };
  /** pct_chao é NULO quando não houve avanço na janela — não é zero. */
  metrica: { total: number; chao: number; pct_chao: number | null };
  em_jogo: number;
  contagem: { venceu: number; aperta: number; parado: number };
}
