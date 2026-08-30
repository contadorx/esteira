"use server";

/**
 * A conta da oficina (B9/B11): pessoas, senha e assinatura.
 *
 * Duas travas moram no banco, não aqui (regra 11): só `dono` escreve em
 * `membros` (policy `membros_ins`/`membros_upd` com `sou_dono()`), e a
 * assinatura é só de leitura pelo app. O que este arquivo faz é o que o banco
 * não pode fazer sozinho — criar o usuário no Auth — e traduzir a recusa numa
 * frase que a pessoa entende.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clienteDoServidor,
  oficinaDaSessao,
  supabaseAdmin,
  temChaveSecreta,
} from "@/lib/supabase/server";
import { cobrancaLigada, criarCheckout, criarPortal, ehPlanoPago } from "@/lib/cobranca";

// Arquivo "use server" só pode exportar função async — o tipo e a constante
// do estado ocioso vivem em `tipos.ts`, como no resto do aplicativo.
import type { ResultadoConta } from "./tipos";

const MIN_SENHA = 8;

/**
 * Cria a pessoa no Auth e o vínculo na oficina. Mesmo desenho de duas metades
 * do autocadastro, e a mesma resposta para "e se a segunda falhar?": desfaz a
 * primeira, e se nem isso der, conta exatamente o que sobrou (regra 14).
 */
export async function convidarPessoa(
  _anterior: ResultadoConta,
  form: FormData,
): Promise<ResultadoConta> {
  const { oficinaId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") {
    return { estado: "erro", mensagem: "Só o dono da conta pode adicionar pessoas." };
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const novoPapel = String(form.get("papel") ?? "escritorio");

  if (!email.includes("@")) return { estado: "erro", mensagem: "Informe um e-mail válido." };
  if (senha.length < MIN_SENHA)
    return { estado: "erro", mensagem: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.` };
  if (novoPapel !== "dono" && novoPapel !== "escritorio")
    return { estado: "erro", mensagem: "Papel inválido." };

  if (!temChaveSecreta()) {
    return {
      estado: "erro",
      mensagem:
        "Não consigo criar acessos: falta a chave de serviço no servidor. " +
        "Ninguém foi adicionado.",
    };
  }

  const admin = supabaseAdmin();
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroAuth || !criado?.user) {
    const t = (erroAuth?.message ?? "").toLowerCase();
    if (t.includes("already"))
      return {
        estado: "erro",
        mensagem: `Já existe uma conta com ${email}. Cada pessoa entra em uma oficina só.`,
      };
    return { estado: "erro", mensagem: `Não consegui criar o acesso (${erroAuth?.message}).` };
  }

  // O vínculo vai pela sessão do dono, de propósito: assim quem prova que ele
  // pode é a RLS, e não este arquivo (regra 11).
  const supabase = await clienteDoServidor();
  const { error: erroMembro } = await supabase.from("membros").insert({
    oficina_id: oficinaId,
    user_id: criado.user.id,
    papel: novoPapel,
    email,
  });

  if (erroMembro) {
    const { error: erroApagar } = await admin.auth.admin.deleteUser(criado.user.id);
    if (erroApagar) {
      return {
        estado: "parcial",
        mensagem:
          `O acesso de ${email} foi criado no login, mas não entrou nesta oficina ` +
          `(${erroMembro.message}) — e não consegui desfazer (${erroApagar.message}). ` +
          `Essa conta existe e não vê nada. Avise o suporte com este e-mail.`,
      };
    }
    return {
      estado: "erro",
      mensagem: `Não consegui vincular ${email} à oficina (${erroMembro.message}). Nada foi salvo.`,
    };
  }

  revalidatePath("/app/conta");
  return {
    estado: "ok",
    mensagem: `${email} já pode entrar. Passe a senha para a pessoa — ela pode trocar depois.`,
  };
}

/** Ativar/desativar. Nunca a si mesmo: o dono se trancaria para fora. */
export async function mudarAtivoDoMembro(
  membroId: string,
  ativo: boolean,
): Promise<ResultadoConta> {
  const { oficinaId, usuarioId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") return { estado: "erro", mensagem: "Só o dono pode mexer nos acessos." };

  const supabase = await clienteDoServidor();
  const { data: alvo, error: erroLer } = await supabase
    .from("membros")
    .select("user_id, email, papel")
    .eq("id", membroId)
    .maybeSingle();
  if (erroLer) return { estado: "erro", mensagem: `Não consegui ler esse acesso (${erroLer.message}).` };
  if (!alvo) return { estado: "erro", mensagem: "Esse acesso não existe mais." };

  if (alvo.user_id === usuarioId && !ativo) {
    return {
      estado: "erro",
      mensagem: "Você não pode desativar o seu próprio acesso — ficaria sem entrar na conta.",
    };
  }

  // Desativar o ÚLTIMO dono ativo deixaria a oficina sem quem administra
  // pessoas e assinatura. A conta ficaria funcionando e impossível de mudar.
  if (alvo.papel === "dono" && !ativo) {
    const { count, error: erroConta } = await supabase
      .from("membros")
      .select("id", { count: "exact", head: true })
      .eq("papel", "dono")
      .eq("ativo", true);
    if (erroConta)
      return { estado: "erro", mensagem: `Não consegui conferir os donos (${erroConta.message}).` };
    if ((count ?? 0) <= 1) {
      return {
        estado: "erro",
        mensagem: "Esta é a única pessoa com papel de dono. Promova outra antes de desativar esta.",
      };
    }
  }

  const { data, error } = await supabase
    .from("membros")
    .update({ ativo })
    .eq("id", membroId)
    .select("id");
  if (error) return { estado: "erro", mensagem: `Não consegui salvar (${error.message}).` };
  if (!data || data.length === 0)
    return { estado: "erro", mensagem: "Nada mudou — o banco recusou a alteração." };

  revalidatePath("/app/conta");
  return {
    estado: "ok",
    mensagem: ativo ? `${alvo.email} voltou a ter acesso.` : `${alvo.email} não entra mais.`,
  };
}

/** Trocar a própria senha. Vale para dono e para escritório. */
export async function trocarMinhaSenha(
  _anterior: ResultadoConta,
  form: FormData,
): Promise<ResultadoConta> {
  const nova = String(form.get("nova") ?? "");
  const repetida = String(form.get("repetida") ?? "");
  if (nova.length < MIN_SENHA)
    return { estado: "erro", mensagem: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.` };
  if (nova !== repetida) return { estado: "erro", mensagem: "As duas senhas não são iguais." };

  const supabase = await clienteDoServidor();
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) return { estado: "erro", mensagem: `Não consegui trocar a senha (${error.message}).` };
  return { estado: "ok", mensagem: "Senha trocada. Ela já vale no próximo login." };
}

/**
 * Levar o dono ao checkout do provedor.
 *
 * Não grava nada: quem grava "está pago" é o webhook (`/api/cobranca/webhook`).
 * Se esta ação gravasse, bastaria abrir o checkout e fechar a aba para virar
 * assinante.
 */
export async function assinarPlano(plano: string): Promise<ResultadoConta> {
  const { oficinaId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") return { estado: "erro", mensagem: "Só o dono pode assinar." };
  if (!ehPlanoPago(plano)) return { estado: "erro", mensagem: "Esse plano não existe." };
  if (!cobrancaLigada()) {
    return {
      estado: "erro",
      mensagem:
        "O pagamento automático ainda não está ligado neste servidor. " +
        "Fale com o suporte para assinar — sua conta continua funcionando.",
    };
  }

  const supabase = await clienteDoServidor();
  const [{ data: assinatura }, { data: usuario }] = await Promise.all([
    supabase.from("assinaturas").select("provedor_cliente").eq("oficina_id", oficinaId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const { url, erro } = await criarCheckout({
    oficinaId,
    plano,
    email: usuario?.user?.email ?? null,
    clienteExistente: assinatura?.provedor_cliente ?? null,
  });
  if (erro || !url) {
    return { estado: "erro", mensagem: `Não consegui abrir o pagamento (${erro ?? "sem endereço"}).` };
  }
  redirect(url);
}

/** Portal do provedor: trocar cartão, ver faturas, cancelar. */
export async function abrirPortalDeCobranca(): Promise<ResultadoConta> {
  const { oficinaId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") return { estado: "erro", mensagem: "Só o dono pode abrir a cobrança." };

  const supabase = await clienteDoServidor();
  const { data, error } = await supabase
    .from("assinaturas")
    .select("provedor_cliente")
    .eq("oficina_id", oficinaId)
    .maybeSingle();
  if (error) return { estado: "erro", mensagem: `Não consegui ler a assinatura (${error.message}).` };
  if (!data?.provedor_cliente) {
    return {
      estado: "erro",
      mensagem: "Esta oficina ainda não tem cadastro no provedor de pagamento.",
    };
  }

  const { url, erro } = await criarPortal(data.provedor_cliente);
  if (erro || !url) {
    return { estado: "erro", mensagem: `Não consegui abrir a cobrança (${erro ?? "sem endereço"}).` };
  }
  redirect(url);
}
