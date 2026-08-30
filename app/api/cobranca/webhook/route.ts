/**
 * O webhook da cobrança — a única porta que escreve "está pago" (B11, Asaas).
 *
 * ── Por que esta rota mudou de forma ao sair da Stripe ────────
 * A Stripe assinava cada evento com HMAC: dava para provar, só com o corpo e
 * o segredo, que aquilo veio dela e não foi mexido. **O Asaas não assina** —
 * ele manda um token estático no cabeçalho `asaas-access-token`. Se esse
 * token vazar (log, print, um `curl` colado no WhatsApp), qualquer pessoa
 * fabrica "fulano pagou" para sempre.
 *
 * A resposta é não acreditar no aviso:
 *
 *   1. confere o token — quem não tem, nem entra;
 *   2. lê o evento só para saber **o que ir olhar**;
 *   3. **pergunta à API do Asaas**, autenticado, qual é o estado real daquela
 *      cobrança ou assinatura;
 *   4. grava o que a API respondeu — nunca o que o corpo do POST afirmou.
 *
 * Um evento forjado com o token certo, no máximo, faz o servidor perguntar ao
 * Asaas e ouvir "não existe" ou "não está paga". O token virou porteiro; a
 * decisão é da consulta.
 *
 * ── Códigos de resposta com significado ──────────────────────
 *   401 — token errado. Não reenviar; não é falha temporária.
 *   200 — aplicado, ou ignorado com motivo. Ignorado responde 200 de
 *         propósito: erro faria o Asaas reenviar para sempre um evento que
 *         este produto nunca vai usar.
 *   500 — não consegui CONFERIR ou não consegui gravar. Reenviar é o certo:
 *         o dinheiro pode ter entrado e o acesso ainda não foi liberado.
 */
import { hoje } from "@/lib/datas";
import {
  conferirAssinaturaNoProvedor,
  conferirCobranca,
  conferirToken,
} from "@/lib/cobranca";
import {
  interpretarEvento,
  patchDaAssinatura,
  patchDaCobranca,
  type PatchAssinatura,
} from "@/lib/cobranca-eventos";
import { supabaseAdmin, temChaveSecreta } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ok = (corpo: Record<string, unknown>) => Response.json(corpo);
const falha = (erro: string, status: number) => Response.json({ erro }, { status });

/**
 * De quem é este pagamento? Primeiro pelo id da assinatura, que nós mesmos
 * guardamos ao criar; depois pelo `externalReference`, que carrega a oficina.
 * Sem dono, nada é gravado — pagamento órfão não vira acesso para ninguém.
 */
async function acharOficina(
  assinaturaId: string | null,
  referencia: string | null,
): Promise<{ oficinaId: string | null; erro: string | null }> {
  const admin = supabaseAdmin();

  if (assinaturaId) {
    const { data, error } = await admin
      .from("assinaturas")
      .select("oficina_id")
      .eq("provedor_assinatura", assinaturaId)
      .maybeSingle();
    if (error) return { oficinaId: null, erro: error.message };
    if (data?.oficina_id) return { oficinaId: data.oficina_id as string, erro: null };
  }

  if (referencia) {
    const { data, error } = await admin
      .from("assinaturas")
      .select("oficina_id")
      .eq("oficina_id", referencia)
      .maybeSingle();
    if (error) return { oficinaId: null, erro: error.message };
    if (data?.oficina_id) return { oficinaId: data.oficina_id as string, erro: null };
  }

  return { oficinaId: null, erro: null };
}

async function gravar(oficinaId: string, patch: PatchAssinatura) {
  // `atualizado_em` é carimbado pelo gatilho do banco, não daqui (regra 8).
  return supabaseAdmin().from("assinaturas").update(patch).eq("oficina_id", oficinaId);
}

export async function POST(req: Request) {
  const conferencia = conferirToken(req.headers.get("asaas-access-token"));
  if (!conferencia.ok) {
    console.error("[cobranca] webhook recusado:", conferencia.motivo);
    return falha(conferencia.motivo ?? "token inválido", 401);
  }

  let evento: unknown;
  try {
    evento = await req.json();
  } catch {
    return falha("corpo não é JSON", 400);
  }

  const leitura = interpretarEvento(evento);
  if (leitura.acao === "ignorar") {
    console.log("[cobranca] ignorado:", leitura.motivo);
    return ok({ estado: "ignorado", motivo: leitura.motivo });
  }

  if (!temChaveSecreta()) {
    console.error("[cobranca] evento válido e SEM chave de serviço para gravar.");
    return falha("servidor sem chave de serviço", 500);
  }

  let patch: PatchAssinatura | null = null;
  let motivo: string;
  let assinaturaId: string | null = null;
  let referencia: string | null = null;

  if (leitura.acao === "conferir_cobranca") {
    const c = await conferirCobranca(leitura.cobrancaId);
    // Não conseguir perguntar NÃO é "não pagou" (regra 3): é 500, e o Asaas
    // tenta de novo.
    if (c.erro) {
      console.error("[cobranca] não consegui conferir a cobrança:", c.erro);
      return falha(`não consegui conferir a cobrança (${c.erro})`, 500);
    }
    if (c.sumiu) {
      // Aviso de uma cobrança que não existe no Asaas. É exatamente o que um
      // POST forjado produz — e reenviar não vai fazê-la aparecer.
      console.error("[cobranca] aviso de cobrança inexistente:", leitura.cobrancaId);
      return ok({
        estado: "ignorado",
        motivo: "essa cobrança não existe no Asaas — nada foi liberado",
      });
    }
    assinaturaId = c.assinatura;
    referencia = c.referencia;
    ({ patch, motivo } = patchDaCobranca(c, hoje()));
  } else {
    const a = await conferirAssinaturaNoProvedor(leitura.assinaturaId);
    if (a.erro) {
      console.error("[cobranca] não consegui conferir a assinatura:", a.erro);
      return falha(`não consegui conferir a assinatura (${a.erro})`, 500);
    }
    assinaturaId = leitura.assinaturaId;
    referencia = a.referencia;
    ({ patch, motivo } = patchDaAssinatura(a));
  }

  if (!patch) {
    console.log("[cobranca] sem efeito:", motivo);
    return ok({ estado: "ignorado", motivo });
  }

  const { oficinaId, erro: erroBusca } = await acharOficina(assinaturaId, referencia);
  if (erroBusca) return falha(`não consegui achar a oficina (${erroBusca})`, 500);
  if (!oficinaId) {
    // 200 de propósito: reenviar não vai fazer a oficina aparecer.
    console.error("[cobranca] evento conferido e SEM dono:", assinaturaId, referencia);
    return ok({
      estado: "ignorado",
      motivo: "não achei a oficina desta cobrança — nada foi liberado",
    });
  }

  const { error } = await gravar(oficinaId, patch);
  if (error) {
    console.error("[cobranca] falhei ao gravar:", error.message);
    return falha(error.message, 500);
  }

  console.log("[cobranca] aplicado:", oficinaId, motivo);
  return ok({ estado: "aplicado", motivo });
}
