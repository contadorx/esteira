"use server";

/**
 * Ações do celular do chão.
 *
 * Nada aqui decide permissão: quem decide é a função no banco, que recebe o
 * token e o PIN e valida oficina, posto e etapa por dentro (regra 11). Este
 * arquivo é o carteiro — e o carteiro conta a verdade sobre a entrega.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { clienteAnonimo, supabaseAdmin, temChaveSecreta } from "@/lib/supabase/server";

export interface RespostaChao {
  estado: "ok" | "conflito" | "fim" | "invalido" | "erro";
  mensagem: string | null;
  /** O que se pode AFIRMAR sobre a foto — nunca "enviada" sem envio. */
  foto: "sem" | "enviada" | "falhou";
}

const COOKIE_PIN = (token: string) => `esteira_pin_${token.slice(0, 24)}`;

async function pinGuardado(token: string): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_PIN(token))?.value ?? null;
}

/** Guarda o PIN neste celular. Não é credencial de valor: o segredo é o link. */
export async function guardarPin(token: string, pin: string): Promise<boolean> {
  const supabase = clienteAnonimo();
  const { data, error } = await supabase.rpc("chao_painel", {
    p_token: token,
    p_pin: pin,
  });
  if (error || data?.estado !== "ok") return false;

  const c = await cookies();
  c.set(COOKIE_PIN(token), pin, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    path: `/c/${token}`,
  });
  return true;
}

/**
 * Sobe a foto DEPOIS de o avanço ter dado certo. Se a foto falhar, o avanço
 * continua valendo e a tela diz que a foto não subiu — a ordem inversa
 * (foto primeiro) faria uma falha de rede apagar o trabalho do chão.
 */
async function subirFoto(arquivo: File, pedidoId: string): Promise<string | null> {
  if (!temChaveSecreta()) return null;
  const extensao = (arquivo.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const caminho = `${pedidoId}/${Date.now()}.${extensao}`;
  const { error } = await supabaseAdmin()
    .storage.from("avancos")
    .upload(caminho, arquivo, { contentType: arquivo.type || "image/jpeg" });
  if (error) return null;
  return caminho;
}

export async function avancar(
  token: string,
  pedidoId: string,
  etapaAtual: string,
  form: FormData,
): Promise<RespostaChao> {
  const pin = await pinGuardado(token);
  const supabase = clienteAnonimo();

  const { data, error } = await supabase.rpc("chao_avancar", {
    p_token: token,
    p_pin: pin,
    p_pedido: pedidoId,
    p_etapa_atual: etapaAtual,
  });

  if (error) {
    return { estado: "erro", mensagem: `Não consegui avançar: ${error.message}`, foto: "sem" };
  }

  if (data?.estado === "conflito") {
    return {
      estado: "conflito",
      mensagem:
        `O pedido ${data.numero} já saiu desta etapa` +
        (data.onde ? ` — está em “${data.onde}”.` : ".") +
        " Alguém marcou antes.",
      foto: "sem",
    };
  }
  if (data?.estado === "fim") {
    return {
      estado: "fim",
      mensagem: `O pedido ${data.numero} já está na última etapa (${data.onde}).`,
      foto: "sem",
    };
  }
  if (data?.estado !== "ok") {
    return { estado: "invalido", mensagem: "Este link não vale mais. Peça outro.", foto: "sem" };
  }

  // O avanço já valeu. A foto é um extra — e o resultado dela é dito como é.
  let foto: RespostaChao["foto"] = "sem";
  const arquivo = form.get("foto");
  if (arquivo instanceof File && arquivo.size > 0) {
    const caminho = await subirFoto(arquivo, pedidoId);
    foto = caminho ? "enviada" : "falhou";
    if (caminho) {
      const { error: erroFoto } = await supabaseAdmin()
        .from("avancos")
        .update({ foto_url: caminho })
        .eq("pedido_id", pedidoId)
        .order("quando", { ascending: false })
        .limit(1);
      if (erroFoto) foto = "falhou";
    }
  }

  revalidatePath(`/c/${token}`);
  return {
    estado: "ok",
    mensagem: `Pedido ${data.numero} → ${data.etapa}`,
    foto,
  };
}

export async function registrarProblema(
  token: string,
  pedidoId: string,
  observacao: string,
): Promise<RespostaChao> {
  const pin = await pinGuardado(token);
  const supabase = clienteAnonimo();

  const { data, error } = await supabase.rpc("chao_problema", {
    p_token: token,
    p_pin: pin,
    p_pedido: pedidoId,
    p_observacao: observacao,
  });

  if (error) {
    return { estado: "erro", mensagem: `Não consegui registrar: ${error.message}`, foto: "sem" };
  }
  if (data?.estado !== "ok") {
    return { estado: "invalido", mensagem: "Não consegui registrar neste pedido.", foto: "sem" };
  }

  revalidatePath(`/c/${token}`);
  return {
    estado: "ok",
    // Regra 2: dizemos o que aconteceu (ficou registrado), não o que não
    // aconteceu (ninguém foi avisado — aviso automático é fase 2).
    mensagem: `Anotado no pedido ${data.numero}. Aparece no quadro do escritório.`,
    foto: "sem",
  };
}
