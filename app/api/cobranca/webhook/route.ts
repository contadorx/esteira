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

/**
 * O EXTRATO (D30) — grava o fato, não só o estado.
 *
 * `assinaturas` guarda o estado atual: cada pagamento sobrescreve o anterior.
 * Aqui a cobrança vira LINHA, com o status cru que o Asaas respondeu na
 * conferência autenticada. Sem isto, "quanto entrou em outubro" não é uma
 * consulta difícil — é uma consulta impossível, porque o dado nunca existiu.
 *
 * Grava SEMPRE que a cobrança tem dono, inclusive quando ela não muda acesso
 * nenhum: uma cobrança em aberto ou vencida é exatamente o que o extrato e a
 * régua de cobrança precisam enxergar.
 *
 * `upsert` e não `insert`: a mesma cobrança é anunciada várias vezes
 * (PENDING → CONFIRMED → RECEIVED) e o Asaas reenvia por desenho quando a
 * resposta não é 200. A chave única é do PROVEDOR, não nossa — e é isso que
 * faz o reenvio ser seguro: rodar duas vezes dá o mesmo resultado.
 */
async function gravarFatura(
  oficinaId: string,
  cobrancaId: string,
  c: {
    status: string | null;
    vencimento: string | null;
    assinatura: string | null;
    valor: number | null;
    pagoEm: string | null;
    link: string | null;
  },
) {
  return supabaseAdmin()
    .from("faturas")
    .upsert(
      {
        oficina_id: oficinaId,
        provedor: "asaas",
        provedor_cobranca: cobrancaId,
        provedor_assinatura: c.assinatura,
        valor: c.valor,
        vencimento: c.vencimento,
        pago_em: c.pagoEm,
        // O status vai CRU. `situacao` é coluna gerada no banco, para a
        // leitura não ter duas definições (regra 12).
        status: c.status ?? "DESCONHECIDO",
        link: c.link,
        // `visto_em` é carimbado pelo gatilho do banco. Um `new Date()` aqui
        // seria um segundo relógio no produto (regra 8) — e foi exatamente o
        // defeito que a varredura achou neste arquivo no B11.
      },
      { onConflict: "provedor,provedor_cobranca" },
    );
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
  // Gravar o EXTRATO e liberar ACESSO são duas coisas diferentes, e a ordem
  // importa: uma cobrança em aberto não muda acesso nenhum e mesmo assim
  // precisa entrar no extrato (é o que a régua de cobrança vai ler). Por isso
  // a oficina é procurada ANTES de decidir o efeito, e não depois — nos dois
  // ramos, para não sobrar um caminho em que "não consegui procurar" se
  // confunda com "não achei" (regra 3).
  let oficinaId: string;
  let fatura: "registrada" | "nao_se_aplica" = "nao_se_aplica";

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

    const dono = await acharOficina(c.assinatura, c.referencia);
    if (dono.erro) return falha(`não consegui achar a oficina (${dono.erro})`, 500);
    if (!dono.oficinaId) {
      // 200 de propósito: reenviar não vai fazer a oficina aparecer. E sem
      // dono a fatura também não é gravada — cobrança órfã não entra no
      // extrato de ninguém.
      console.error("[cobranca] cobrança conferida e SEM dono:", c.assinatura, c.referencia);
      return ok({
        estado: "ignorado",
        motivo: "não achei a oficina desta cobrança — nada foi liberado",
      });
    }

    // O extrato vem primeiro porque ele é o FATO. Falhar aqui é 500 e o Asaas
    // reenvia; o `upsert` é idempotente, então repetir é seguro (regra 13: o
    // conserto não pode ser pior que o bug — reenviar não duplica nada).
    const { error: erroFatura } = await gravarFatura(dono.oficinaId, leitura.cobrancaId, c);
    if (erroFatura) {
      console.error("[cobranca] falhei ao gravar a fatura:", erroFatura.message);
      return falha(`não consegui gravar a fatura (${erroFatura.message})`, 500);
    }
    fatura = "registrada";

    oficinaId = dono.oficinaId;
    ({ patch, motivo } = patchDaCobranca(c, hoje()));
  } else {
    const a = await conferirAssinaturaNoProvedor(leitura.assinaturaId);
    if (a.erro) {
      console.error("[cobranca] não consegui conferir a assinatura:", a.erro);
      return falha(`não consegui conferir a assinatura (${a.erro})`, 500);
    }

    const dono = await acharOficina(leitura.assinaturaId, a.referencia);
    if (dono.erro) return falha(`não consegui achar a oficina (${dono.erro})`, 500);
    if (!dono.oficinaId) {
      console.error("[cobranca] assinatura conferida e SEM dono:", leitura.assinaturaId);
      return ok({
        estado: "ignorado",
        motivo: "não achei a oficina desta assinatura — nada foi alterado",
      });
    }

    oficinaId = dono.oficinaId;
    ({ patch, motivo } = patchDaAssinatura(a));
  }

  if (!patch) {
    // Sem efeito no ACESSO — o que não quer dizer sem efeito nenhum: a fatura
    // pode ter sido gravada logo acima, e a resposta diz isso.
    console.log("[cobranca] sem efeito no acesso:", motivo);
    return ok({ estado: "ignorado", motivo, fatura });
  }

  const { error } = await gravar(oficinaId, patch);
  if (error) {
    console.error("[cobranca] falhei ao gravar:", error.message);
    return falha(error.message, 500);
  }

  console.log("[cobranca] aplicado:", oficinaId, motivo);
  return ok({ estado: "aplicado", motivo, fatura });
}
