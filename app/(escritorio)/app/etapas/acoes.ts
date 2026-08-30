"use server";

/**
 * Ações das etapas (B2).
 *
 * A regra que manda aqui é a 13 — "o conserto pode ser pior que o bug".
 * Mexer em etapa é mexer em onde os pedidos estão. Então:
 * - remover etapa em uso é RECUSADO pelo banco (FK), não pela tela (regra 11);
 * - o motivo mostrado é apurado: contamos quantos pedidos estão lá antes de
 *   afirmar (regra 2);
 * - reordenar é uma transação só, na função `reordenar_etapas` (regra 7: a
 *   trava e a integridade moram no banco).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import { acharPack } from "@/lib/packs";
import type { Resposta } from "./tipos";

const OK: Resposta = { estado: "ok", mensagem: null };
const erro = (mensagem: string): Resposta => ({ estado: "erro", mensagem });

async function contexto() {
  const { oficinaId } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  const supabase = await clienteDoServidor();
  return { supabase, oficinaId };
}

function limparTipo(bruto: string): string {
  return bruto.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40);
}

export async function criarEtapa(tipo: string, nome: string): Promise<Resposta> {
  const { supabase, oficinaId } = await contexto();
  const limpo = nome.trim();
  if (!limpo) return erro("Dê um nome para a etapa.");

  const { data, error } = await supabase
    .from("etapas")
    .select("ordem")
    .eq("tipo_pedido", tipo)
    .order("ordem", { ascending: false })
    .limit(1);
  if (error) return erro(`Não consegui ler as etapas atuais: ${error.message}`);

  const proxima = (data?.[0]?.ordem ?? 0) + 1;
  const { error: erroInsert } = await supabase.from("etapas").insert({
    oficina_id: oficinaId,
    nome: limpo,
    ordem: proxima,
    tipo_pedido: tipo,
  });
  if (erroInsert) {
    if (erroInsert.code === "23505")
      return erro("Já existe uma etapa nessa posição. Recarregue e tente de novo.");
    return erro(`Não consegui criar a etapa: ${erroInsert.message}`);
  }

  revalidatePath("/app/etapas");
  return OK;
}

export async function renomearEtapa(id: string, nome: string): Promise<Resposta> {
  const { supabase } = await contexto();
  const limpo = nome.trim();
  if (!limpo) return erro("O nome não pode ficar vazio.");

  const { error } = await supabase.from("etapas").update({ nome: limpo }).eq("id", id);
  if (error) return erro(`Não consegui renomear: ${error.message}`);

  revalidatePath("/app/etapas");
  revalidatePath("/app");
  return OK;
}

/**
 * Remover etapa. A trava é a FK de `pedidos.etapa_id` — a tela não decide
 * nada. Quando o banco recusa, aí sim contamos os pedidos para dizer um
 * número que existe, em vez de um palpite.
 */
export async function removerEtapa(id: string): Promise<Resposta> {
  const { supabase } = await contexto();
  const { error } = await supabase.from("etapas").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      const { count, error: erroContagem } = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("etapa_id", id);
      if (erroContagem || count === null) {
        return erro(
          "Não dá para remover: existem pedidos nesta etapa. " +
            "(Não consegui contar quantos — mova-os e tente de novo.)",
        );
      }
      return erro(
        `Não dá para remover: ${count} pedido(s) estão nesta etapa. ` +
          "Mova-os para outra etapa antes.",
      );
    }
    return erro(`Não consegui remover: ${error.message}`);
  }

  revalidatePath("/app/etapas");
  return OK;
}

export async function reordenarEtapas(tipo: string, ids: string[]): Promise<Resposta> {
  const { supabase, oficinaId } = await contexto();
  const { error } = await supabase.rpc("reordenar_etapas", {
    p_oficina: oficinaId,
    p_tipo: tipo,
    p_ids: ids,
  });
  if (error) return erro(`Não consegui reordenar: ${error.message}`);

  revalidatePath("/app/etapas");
  revalidatePath("/app");
  return OK;
}

/**
 * Aplica um pack. Só em tipo VAZIO, de propósito: aplicar por cima
 * significaria decidir sozinho o que fazer com as etapas existentes e com os
 * pedidos que estão nelas — e a regra 13 diz que esse conserto sai pior.
 */
export async function aplicarPack(tipo: string, packId: string): Promise<Resposta> {
  const { supabase, oficinaId } = await contexto();
  const pack = acharPack(packId);
  if (!pack) return erro("Pack não encontrado.");

  const { count, error: erroContagem } = await supabase
    .from("etapas")
    .select("id", { count: "exact", head: true })
    .eq("tipo_pedido", tipo);
  if (erroContagem) return erro(`Não consegui conferir as etapas atuais: ${erroContagem.message}`);
  if ((count ?? 0) > 0) {
    return erro(
      `“${tipo}” já tem ${count} etapa(s). Remova-as antes de aplicar um pack, ` +
        "ou crie um tipo de pedido novo.",
    );
  }

  const { error } = await supabase.from("etapas").insert(
    pack.etapas.map((nome, i) => ({
      oficina_id: oficinaId,
      nome,
      ordem: i + 1,
      tipo_pedido: tipo,
    })),
  );
  if (error) return erro(`Não consegui aplicar o pack: ${error.message}`);

  revalidatePath("/app/etapas");
  revalidatePath("/app");
  return OK;
}

/** Cria um tipo de pedido — que existe justamente por ter etapas. */
export async function criarTipo(nomeBruto: string, packId: string): Promise<Resposta> {
  const tipo = limparTipo(nomeBruto);
  if (!tipo) return erro("Dê um nome para o tipo de pedido.");

  const { supabase } = await contexto();
  const { count, error } = await supabase
    .from("etapas")
    .select("id", { count: "exact", head: true })
    .eq("tipo_pedido", tipo);
  if (error) return erro(`Não consegui conferir os tipos atuais: ${error.message}`);
  if ((count ?? 0) > 0) return erro(`O tipo “${tipo}” já existe.`);

  if (packId) return aplicarPack(tipo, packId);

  return criarEtapa(tipo, "Recebido");
}
