"use server";

/**
 * Acessos do chão (D1/D11). Cada linha aqui é um link que anda no bolso de
 * alguém — por isso ela pode ser revogada, e por isso o PIN existe.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import type { Resposta } from "../etapas/tipos";

const OK: Resposta = { estado: "ok", mensagem: null };
const erro = (mensagem: string): Resposta => ({ estado: "erro", mensagem });

async function contexto() {
  const { oficinaId } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  const supabase = await clienteDoServidor();
  return { supabase, oficinaId };
}

export async function criarAcesso(
  nome: string,
  etapaId: string,
  pin: string,
): Promise<Resposta> {
  const { supabase, oficinaId } = await contexto();
  const limpo = nome.trim();
  if (!limpo) return erro("Dê um nome — é como o pessoal vai se reconhecer.");

  const pinLimpo = pin.replace(/\D/g, "");
  if (pinLimpo && pinLimpo.length !== 4) {
    return erro("O PIN tem 4 dígitos, ou fica em branco.");
  }

  const { error } = await supabase.from("acessos").insert({
    oficina_id: oficinaId,
    nome: limpo,
    etapa_id: etapaId || null,
    pin: pinLimpo || null,
  });
  if (error) return erro(`Não consegui criar o acesso: ${error.message}`);

  revalidatePath("/app/acessos");
  return OK;
}

/**
 * Revogar não apaga: mantém a trilha dos avanços que essa pessoa fez. Um
 * `delete` faria a FK de `avancos` recusar — e, se não fizesse, apagaria o
 * histórico de quem produziu.
 */
export async function revogarAcesso(id: string, ativo: boolean): Promise<Resposta> {
  const { supabase } = await contexto();
  const { error } = await supabase.from("acessos").update({ ativo }).eq("id", id);
  if (error) return erro(`Não consegui ${ativo ? "reativar" : "revogar"}: ${error.message}`);
  revalidatePath("/app/acessos");
  return OK;
}

export async function trocarPin(id: string, pin: string): Promise<Resposta> {
  const { supabase } = await contexto();
  const pinLimpo = pin.replace(/\D/g, "");
  if (pinLimpo && pinLimpo.length !== 4) return erro("O PIN tem 4 dígitos, ou fica em branco.");

  const { error } = await supabase
    .from("acessos")
    .update({ pin: pinLimpo || null })
    .eq("id", id);
  if (error) return erro(`Não consegui trocar o PIN: ${error.message}`);

  revalidatePath("/app/acessos");
  return OK;
}
