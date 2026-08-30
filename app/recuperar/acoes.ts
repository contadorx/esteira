"use server";

/**
 * "Esqueci minha senha" — o buraco que trancava o cliente para fora.
 *
 * Até aqui a Esteira era um SaaS de autocadastro **sem nenhuma forma de
 * recuperar a senha**. Quem esquecesse ficava trancado para sempre: a oficina
 * continuava lá, os pedidos continuavam andando pelo celular do chão, a
 * assinatura continuava sendo cobrada — e o escritório não entrava mais.
 * Não é um detalhe de conforto; é churn com o dinheiro ainda saindo.
 *
 * ── A parte honesta ──────────────────────────────────────────────────────────
 * O e-mail sai pelo servidor do Supabase, que tem limite baixo de envio e cai
 * em spam com alguma frequência. Isso é aceitável no tamanho de hoje (poucas
 * oficinas, um pedido de recuperação por semana no pior caso) e está ESCRITO
 * na tela — junto com o WhatsApp, que é como o cliente vai resolver quando o
 * e-mail não chegar. Prometer "enviamos um e-mail" e ficar por isso mesmo
 * seria a regra 2 outra vez: afirmar o que não se apurou.
 *
 * ── Por que a resposta é sempre a mesma ──────────────────────────────────────
 * Dizer "esse e-mail não está cadastrado" entrega a lista de clientes para
 * qualquer um que queira descobrir quem usa a Esteira. A tela responde igual
 * para e-mail que existe e para e-mail que não existe.
 */

import { clienteDoServidor } from "@/lib/supabase/server";
import { enderecoDoSite } from "@/lib/cobranca";
import type { ResultadoRecuperacao } from "./tipos";

export async function pedirNovaSenha(
  _anterior: ResultadoRecuperacao,
  form: FormData,
): Promise<ResultadoRecuperacao> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { estado: "erro", mensagem: "Escreva o seu e-mail." };

  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    return {
      estado: "erro",
      mensagem: `Não consegui falar com o servidor: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${enderecoDoSite()}/api/auth/recuperar`,
  });

  /*
    Falha de ENVIO é diferente de e-mail não cadastrado, e as duas não podem
    sair pela mesma porta (regra 14). Um limite de envio estourado precisa
    aparecer — senão a pessoa fica meia hora esperando um e-mail que o
    servidor recusou mandar, e a tela dizendo que está tudo certo.
  */
  if (error) {
    const limite = /rate|limit|too many|segundos|seconds/i.test(error.message);
    return {
      estado: "erro",
      mensagem: limite
        ? "O servidor de e-mail recusou por excesso de tentativas. Espere alguns minutos e tente de novo — ou chame no WhatsApp."
        : `O envio falhou: ${error.message}`,
    };
  }

  return {
    estado: "enviado",
    mensagem:
      "Se esse e-mail estiver cadastrado, o link de troca de senha saiu agora. Ele vale por 1 hora.",
  };
}
