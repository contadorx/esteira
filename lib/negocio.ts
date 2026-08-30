/**
 * A ÁREA DE NEGÓCIO — a Esteira vista por quem vive dela (B15).
 *
 * Regra deste arquivo: **nenhum número decorativo**. Cada métrica existe porque
 * leva a um telefonema. Se não leva, não entra na tela.
 *
 * Tudo vem de UMA chamada — `painel_negocio()` —, e é de propósito: MRR,
 * contagens, caixa e a lista de oficinas precisam concordar entre si, e dois
 * `select` diferentes só concordam até alguém mexer num deles (regra 4).
 *
 * A função de banco é também a TRAVA (regra 11): ela devolve `null` para quem
 * não está em `equipe`. Este arquivo não decide permissão — ele repete o que o
 * banco respondeu.
 */

import { clienteDoServidor } from "@/lib/supabase/server";

export interface OficinaNoNegocio {
  id: string;
  nome: string;
  criado_em: string;
  /** null = oficina sem linha em `assinaturas` (cadastro que morreu no meio) */
  status: "teste" | "ativa" | "vencida" | "cancelada" | null;
  plano: string | null;
  plano_nome: string | null;
  preco_centavos: number | null;
  limite: number | null;
  /** fim do teste ou do período pago, conforme o status */
  ate: string | null;
  ativos: number;
  pedidos_total: number;
  pessoas: number;
  acessos: number;
  /** a métrica nº 1 do produto, por oficina */
  chao_30d: number;
  escritorio_30d: number;
  ultimo_avanco: string | null;
  pago_total: number;
  faturas_vencidas: number;
}

export interface AcaoDoNegocio {
  tipo: string;
  urgencia: "alta" | "media" | "baixa";
  oficina: string;
  oficina_id: string;
  detalhe: string;
  valor_centavos: number | null;
}

export interface Caixa {
  recebido_mes: number;
  recebido_total: number;
  aberto: number;
  vencido: number;
  pagas: number;
  vencidas: number;
}

export interface Negocio {
  hoje: string;
  mrr_centavos: number;
  mrr_teste_centavos: number;
  contagens: {
    total: number;
    teste: number;
    ativa: number;
    vencida: number;
    cancelada: number;
    sem_assinatura: number;
  };
  caixa: Caixa;
  chao_30d: number;
  escritorio_30d: number;
  acoes: AcaoDoNegocio[];
  oficinas: OficinaNoNegocio[];
}

/**
 * Três estados nomeados, nunca um `Negocio | null` (regras 1 e 3):
 *   - `restrito`  — o banco respondeu, e a resposta foi "você não é da equipe";
 *   - `falha`     — não consegui perguntar. NÃO é o mesmo que não ter dado.
 *   - `ok`        — tem resposta.
 *
 * A diferença entre os dois primeiros é a que impede a tela de mostrar R$ 0
 * quando o que aconteceu foi uma consulta morrendo.
 */
export type LeituraDoNegocio =
  | { estado: "restrito" }
  | { estado: "falha"; erro: string }
  | { estado: "ok"; n: Negocio };

export async function carregarNegocio(): Promise<LeituraDoNegocio> {
  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    return { estado: "falha", erro: e instanceof Error ? e.message : String(e) };
  }

  const { data, error } = await supabase.rpc("painel_negocio");
  if (error) {
    const faltaFuncao = /does not exist|não existe|schema cache/i.test(error.message);
    return {
      estado: "falha",
      erro: faltaFuncao
        ? "A função painel_negocio() ainda não existe no banco. Rode a migration 20260831_negocio.sql."
        : error.message,
    };
  }

  // `null` aqui é RESPOSTA, não ausência: a função conferiu e disse não.
  if (data === null) return { estado: "restrito" };

  return { estado: "ok", n: data as Negocio };
}

/** Centavos → "R$ 1.234,56". Um lugar só (regra 12). */
export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Reais em `numeric` (as faturas guardam reais, não centavos) → "R$ …". */
export function brlReais(valor: number | string): string {
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A métrica que decide o produto: % dos avanços feitos pelo chão.
 *
 * Devolve `null` quando não houve avanço nenhum — e é a diferença que mais
 * importa nesta tela. Zero avanços não é 0% de adoção do chão; é "ainda não
 * perguntei" (regra 3). Mostrar 0% aqui faria uma base recém-nascida parecer
 * um produto que fracassou.
 */
export function percentualDoChao(chao: number, escritorio: number): number | null {
  const total = chao + escritorio;
  if (total === 0) return null;
  return Math.round((chao / total) * 100);
}
