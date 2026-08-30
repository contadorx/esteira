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
import {
  cancelarAssinatura,
  cobrancaLigada,
  criarAssinatura,
  criarCliente,
  documentoValido,
  ehPlanoPago,
  faturaDaAssinatura,
} from "@/lib/cobranca";
import { hoje } from "@/lib/datas";

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
 * Assinar um plano — no Asaas (B11).
 *
 * O que esta ação FAZ: cria (ou reusa) o cliente, cria a assinatura mensal e
 * guarda os **identificadores** do provedor. O que ela NÃO faz: escrever
 * `status`. Quem escreve "está pago" é o webhook, depois de conferir na API
 * (D23) — senão bastaria abrir a fatura e fechar a aba para virar assinante.
 *
 * O CPF/CNPJ é obrigatório para criar cliente no Asaas. Ele é pedido AQUI, e
 * não no cadastro (o teste continua sem fricção), e **não é guardado no nosso
 * banco**: passa direto para o Asaas. O produto não guarda cadastro.
 */
export async function assinarPlano(
  _anterior: ResultadoConta,
  form: FormData,
): Promise<ResultadoConta> {
  const { oficinaId, oficina, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") return { estado: "erro", mensagem: "Só o dono pode assinar." };

  const plano = String(form.get("plano") ?? "").trim();
  const documento = String(form.get("documento") ?? "").trim();
  const nomeCobranca = String(form.get("nome") ?? "").trim() || oficina || "Oficina";

  if (!ehPlanoPago(plano)) return { estado: "erro", mensagem: "Esse plano não existe." };
  if (!cobrancaLigada()) {
    return {
      estado: "erro",
      mensagem:
        "O pagamento por aqui ainda não está ligado neste servidor. " +
        "Fale com o suporte para assinar — sua conta continua funcionando.",
    };
  }
  if (!documentoValido(documento)) {
    return {
      estado: "erro",
      mensagem:
        "Esse CPF/CNPJ não confere. Confira os números — é o documento de quem " +
        "vai pagar, e o Asaas recusa cadastro sem ele.",
    };
  }

  const supabase = await clienteDoServidor();
  const [{ data: assinatura, error: erroAssinatura }, { data: infoPlano, error: erroPlano }, { data: usuario }] =
    await Promise.all([
      supabase
        .from("assinaturas")
        .select("provedor_cliente, provedor_assinatura, periodo_ate, status")
        .eq("oficina_id", oficinaId)
        .maybeSingle(),
      supabase.from("planos").select("nome, preco_centavos").eq("codigo", plano).maybeSingle(),
      supabase.auth.getUser(),
    ]);

  if (erroAssinatura)
    return { estado: "erro", mensagem: `Não consegui ler a assinatura (${erroAssinatura.message}).` };
  if (erroPlano || !infoPlano)
    return { estado: "erro", mensagem: `Não consegui ler o plano (${erroPlano?.message ?? "sumiu"}).` };

  // Trocar de plano: a antiga sai primeiro. Se a saída falhar, nada muda — e
  // a pessoa ouve isso, em vez de ficar com duas assinaturas cobrando.
  if (assinatura?.provedor_assinatura) {
    const { ok: saiu, erro } = await cancelarAssinatura(assinatura.provedor_assinatura);
    if (!saiu) {
      return {
        estado: "erro",
        mensagem: `Não consegui encerrar a assinatura atual (${erro}). Nada mudou — tente de novo.`,
      };
    }
  }

  let clienteId = assinatura?.provedor_cliente ?? null;
  if (!clienteId) {
    const { id, erro } = await criarCliente({
      oficinaId,
      nome: nomeCobranca,
      documento,
      email: usuario?.user?.email ?? null,
    });
    if (!id) return { estado: "erro", mensagem: `Não consegui criar o cadastro de cobrança (${erro}).` };
    clienteId = id;
  }

  const { id: novaAssinatura, erro: erroCriar } = await criarAssinatura({
    oficinaId,
    clienteId,
    plano,
    planoNome: infoPlano.nome,
    centavos: infoPlano.preco_centavos,
    primeiroVencimento: hoje(),
  });

  if (!novaAssinatura) {
    // Regra 14: a antiga já saiu. Dizer exatamente o que sobrou.
    return {
      estado: assinatura?.provedor_assinatura ? "parcial" : "erro",
      mensagem: assinatura?.provedor_assinatura
        ? `Encerrei a assinatura anterior e não consegui criar a nova (${erroCriar}). ` +
          `Sua conta continua valendo até ${assinatura.periodo_ate ?? "o fim do período"} — ` +
          `tente assinar de novo.`
        : `Não consegui criar a assinatura (${erroCriar}). Nada foi cobrado.`,
    };
  }

  // Só identificadores. `status` continua sendo assunto do webhook (D23).
  if (temChaveSecreta()) {
    const { error } = await supabaseAdmin()
      .from("assinaturas")
      .update({
        plano,
        provedor: "asaas",
        provedor_cliente: clienteId,
        provedor_assinatura: novaAssinatura,
      })
      .eq("oficina_id", oficinaId);
    if (error) {
      return {
        estado: "parcial",
        mensagem:
          `A assinatura foi criada no Asaas, mas não consegui guardá-la aqui ` +
          `(${error.message}). Avise o suporte com este código: ${novaAssinatura}.`,
      };
    }
  }

  const { url, erro: erroFatura } = await faturaDaAssinatura(novaAssinatura);
  if (!url) {
    return {
      estado: "parcial",
      mensagem:
        `A assinatura foi criada, mas não consegui abrir a fatura agora ` +
        `(${erroFatura}). Recarregue esta tela em um minuto — o botão "ver a ` +
        `cobrança" aparece aqui.`,
    };
  }

  revalidatePath("/app/conta");
  redirect(url);
}

/** Abrir a fatura em aberto (Pix, boleto ou cartão — quem escolhe é quem paga). */
export async function abrirFatura(): Promise<ResultadoConta> {
  const { oficinaId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") return { estado: "erro", mensagem: "Só o dono pode ver a cobrança." };

  const supabase = await clienteDoServidor();
  const { data, error } = await supabase
    .from("assinaturas")
    .select("provedor_assinatura")
    .eq("oficina_id", oficinaId)
    .maybeSingle();
  if (error) return { estado: "erro", mensagem: `Não consegui ler a assinatura (${error.message}).` };
  if (!data?.provedor_assinatura)
    return { estado: "erro", mensagem: "Esta oficina ainda não tem assinatura no provedor." };

  const { url, erro } = await faturaDaAssinatura(data.provedor_assinatura);
  if (!url) return { estado: "erro", mensagem: `Não consegui abrir a cobrança (${erro}).` };
  redirect(url);
}

/**
 * Cancelar. Não tira o acesso na hora: `periodo_ate` continua valendo, e
 * `conta_da_oficina` respeita. Quem cancela no dia 2 pagou até o fim do mês —
 * travar na hora seria ficar com o dinheiro e tirar o serviço.
 */
export async function cancelarMinhaAssinatura(): Promise<ResultadoConta> {
  const { oficinaId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  if (papel !== "dono") return { estado: "erro", mensagem: "Só o dono pode cancelar." };

  const supabase = await clienteDoServidor();
  const { data, error } = await supabase
    .from("assinaturas")
    .select("provedor_assinatura, periodo_ate")
    .eq("oficina_id", oficinaId)
    .maybeSingle();
  if (error) return { estado: "erro", mensagem: `Não consegui ler a assinatura (${error.message}).` };
  if (!data?.provedor_assinatura)
    return { estado: "erro", mensagem: "Não há assinatura para cancelar." };

  const { ok: saiu, erro } = await cancelarAssinatura(data.provedor_assinatura);
  if (!saiu) return { estado: "erro", mensagem: `Não consegui cancelar (${erro}). Nada mudou.` };

  // O `status` quem grava é o webhook (SUBSCRIPTION_DELETED), depois de
  // conferir. Aqui só se diz o que aconteceu.
  revalidatePath("/app/conta");
  return {
    estado: "ok",
    mensagem: data.periodo_ate
      ? `Assinatura cancelada. Não haverá cobrança nova, e sua conta continua ` +
        `inteira até ${data.periodo_ate}.`
      : "Assinatura cancelada. Não haverá cobrança nova.",
  };
}
