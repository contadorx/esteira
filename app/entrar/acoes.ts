"use server";

import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import type { ResultadoEntrada } from "./tipos";

export async function entrar(
  _anterior: ResultadoEntrada,
  form: FormData,
): Promise<ResultadoEntrada> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");

  if (!email || !senha) {
    return { estado: "erro", mensagem: "Preencha e-mail e senha." };
  }

  const supabase = await clienteDoServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    // Regra 2: não inventamos a causa. "Credenciais inválidas" é o que o
    // servidor de auth respondeu; qualquer outra coisa aparece como veio.
    const invalida = error.message.toLowerCase().includes("invalid");
    return {
      estado: "erro",
      mensagem: invalida ? "E-mail ou senha não conferem." : error.message,
    };
  }

  /*
    O VÍNCULO VEM DE `membros`, NÃO DO `app_metadata` (D20).

    Este bloco lia `data.user.app_metadata.oficina_id`, que era a fonte do
    tenant até o B9. O D20 revogou isso e passou o vínculo para a tabela
    `membros` — mas esta linha ficou para trás, e o autocadastro
    (`admin.auth.admin.createUser`) não escreve `app_metadata` nenhum.

    Efeito, que só apareceria com um cliente de verdade: TODA pessoa que se
    cadastrasse sozinha entraria uma vez (o cadastro já redireciona logada) e,
    no dia seguinte, ao voltar em /entrar, ouviria "não está ligado a nenhuma
    oficina, fale com o suporte" — com a oficina existindo, os pedidos lá
    dentro e a assinatura em dia. Passou despercebido porque o único usuário
    do banco é anterior ao B9 e tem o campo antigo preenchido.

    Agora a pergunta é feita à MESMA função que o layout do app usa
    (`minha_sessao`, via `oficinaDaSessao`), na mesma sessão recém-aberta —
    duas telas decidindo a mesma coisa por dois caminhos é a regra 12.
  */
  const sessao = await oficinaDaSessao();

  if (sessao.estado === "falha") {
    // Regra 3: não conseguir LER o vínculo não é não ter vínculo. Mandar essa
    // pessoa para o cadastro de oficina criaria uma segunda oficina para quem
    // já tem uma.
    return {
      estado: "erro",
      mensagem: `Sua senha está certa, mas não consegui ler o seu vínculo com a oficina: ${sessao.erro}`,
    };
  }

  // Conta criada com o cadastro interrompido no meio (regra 14: o estado
  // "parcial" do /criar-conta existe justamente para cair aqui). O caminho é
  // terminar o cadastro, não falar com o suporte.
  if (sessao.estado !== "ok") redirect("/criar-conta/oficina");

  redirect("/app");
}
