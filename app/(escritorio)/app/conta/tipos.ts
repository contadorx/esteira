export interface ResultadoConta {
  estado: "ocioso" | "ok" | "erro" | "parcial";
  mensagem: string | null;
}

export const CONTA_OCIOSA: ResultadoConta = { estado: "ocioso", mensagem: null };

export interface RespostaConta {
  estado: "ok" | "sem_assinatura";
  plano?: string;
  plano_nome?: string;
  preco_centavos?: number;
  status?: "teste" | "ativa" | "vencida" | "cancelada";
  ate?: string | null;
  dias_restantes?: number | null;
  pedidos_ativos?: number;
  limite?: number | null;
  pode_criar?: boolean;
  motivo?: string | null;
  provedor?: string | null;
  /** Existe assinatura no provedor? A tela usa para oferecer fatura e cancelamento. */
  tem_assinatura?: boolean;
}

export interface Membro {
  id: string;
  email: string | null;
  papel: "dono" | "escritorio";
  ativo: boolean;
  user_id: string;
  criado_em: string;
}

export interface Plano {
  codigo: string;
  nome: string;
  preco_centavos: number;
  limite_pedidos_ativos: number | null;
  ordem: number;
}

/** "R$ 89" — sem centavos quando são zeros, que é o caso de todos os planos. */
export function emReais(centavos: number): string {
  const inteiro = Math.floor(centavos / 100);
  const resto = centavos % 100;
  return resto === 0
    ? `R$ ${inteiro}`
    : `R$ ${inteiro},${String(resto).padStart(2, "0")}`;
}

/**
 * Uma cobrança da própria oficina (D30).
 *
 * `status` é a resposta CRUA do Asaas — a evidência — e `situacao` é a leitura
 * dela, calculada no banco por coluna gerada, para não haver duas definições
 * (regra 12). A tela mostra a leitura e guarda a evidência ao lado.
 */
export interface MinhaFatura {
  vencimento: string | null;
  pago_em: string | null;
  valor: number | string | null;
  situacao: "paga" | "aberta" | "vencida" | "devolvida" | "outra";
  status: string;
  link: string | null;
}
