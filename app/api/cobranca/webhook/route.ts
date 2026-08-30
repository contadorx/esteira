/**
 * O webhook da cobrança — a única porta que escreve "está pago" (B11).
 *
 * Ordem obrigatória, e ela não é estética:
 *   1. ler o corpo CRU (reserializar o JSON quebra a assinatura);
 *   2. conferir a assinatura ANTES de olhar o conteúdo;
 *   3. só então interpretar e gravar.
 *
 * Códigos de resposta com significado (a Stripe reage a eles):
 *   400 — assinatura inválida. Não reenviar; não é falha temporária.
 *   200 — aplicado, ou ignorado com motivo. Ignorado responde 200 de propósito:
 *         devolver erro faria a Stripe reenviar para sempre um evento que este
 *         produto nunca vai usar.
 *   500 — nossa gravação falhou. Reenviar É o certo aqui.
 */
import { conferirAssinatura } from "@/lib/cobranca";
import { interpretarEvento } from "@/lib/cobranca-eventos";
import { supabaseAdmin, temChaveSecreta } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpoCru = await req.text();

  const conferencia = conferirAssinatura({
    corpoCru,
    cabecalho: req.headers.get("stripe-signature"),
    segredo: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? null,
  });
  if (!conferencia.ok) {
    // Sem detalhar mais do que o necessário para quem está do lado de fora.
    console.error("[cobranca] webhook recusado:", conferencia.motivo);
    return Response.json({ erro: conferencia.motivo }, { status: 400 });
  }

  let evento: unknown;
  try {
    evento = JSON.parse(corpoCru);
  } catch {
    return Response.json({ erro: "corpo não é JSON" }, { status: 400 });
  }

  const leitura = interpretarEvento(evento, {
    base: process.env.STRIPE_PRECO_BASE,
    medio: process.env.STRIPE_PRECO_MEDIO,
    grande: process.env.STRIPE_PRECO_GRANDE,
  });

  if (leitura.acao === "ignorar" || !leitura.oficinaId || !leitura.patch) {
    console.log("[cobranca] ignorado:", leitura.motivo);
    return Response.json({ estado: "ignorado", motivo: leitura.motivo });
  }

  if (!temChaveSecreta()) {
    console.error("[cobranca] evento válido e SEM chave de serviço para gravar.");
    return Response.json({ erro: "servidor sem chave de serviço" }, { status: 500 });
  }

  const { error } = await supabaseAdmin()
    .from("assinaturas")
    // `atualizado_em` NÃO é preenchido aqui: quem carimba é o gatilho
    // `trg_assinaturas_tocada`, no banco. Um `new Date()` aqui seria um
    // segundo relógio, no fuso do servidor da Vercel (regra 8).
    .update(leitura.patch)
    .eq("oficina_id", leitura.oficinaId);

  if (error) {
    // Regra 1: erro lido e devolvido. 500 para a Stripe tentar de novo — o
    // pagamento existe e o acesso ainda não foi liberado.
    console.error("[cobranca] falhei ao gravar:", error.message);
    return Response.json({ erro: error.message }, { status: 500 });
  }

  console.log("[cobranca] aplicado:", leitura.oficinaId, leitura.motivo);
  return Response.json({ estado: "aplicado", motivo: leitura.motivo });
}
