"use server";

import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import type { ResultadoNovaSenha } from "./tipos";

// O mesmo mínimo do /criar-conta e do /app/conta. Não é exportado daqui: um
// arquivo "use server" só pode exportar função assíncrona — a constante mora
// em ./tipos, que os dois lados podem importar.
import { MIN_SENHA } from "./tipos";

export async function trocarSenha(
  _anterior: ResultadoNovaSenha,
  form: FormData,
): Promise<ResultadoNovaSenha> {
  const nova = String(form.get("senha") ?? "");
  const repetida = String(form.get("repetida") ?? "");

  if (nova.length < MIN_SENHA) {
    return { estado: "erro", mensagem: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.` };
  }
  if (nova !== repetida) {
    return { estado: "erro", mensagem: "As duas senhas não são iguais." };
  }

  let supabase;
  try {
    supabase = await clienteDoServidor();
  } catch (e) {
    return {
      estado: "erro",
      mensagem: `Não consegui falar com o servidor: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  /*
    A TROCA SÓ VALE COM A SESSÃO DO LINK.

    `updateUser` age sobre quem está logado. Se a sessão de recuperação já
    tiver expirado entre abrir a tela e apertar o botão, o Supabase responde
    "Auth session missing" — e a pessoa precisa ouvir "peça outro link", não
    uma frase técnica que ela não pode resolver.
  */
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    const semSessao = /session|jwt|token/i.test(error.message);
    return {
      estado: "erro",
      mensagem: semSessao
        ? "A validade do link acabou enquanto esta tela estava aberta. Peça outro link e refaça."
        : `Não consegui trocar a senha (${error.message}).`,
    };
  }

  // A senha trocou; para onde mandar depende de a conta ter oficina ou não —
  // a mesma pergunta que o /entrar faz, pela mesma função (regra 12).
  const sessao = await oficinaDaSessao();
  if (sessao.estado === "ok") redirect("/app");
  if (sessao.estado === "sem_oficina") redirect("/criar-conta/oficina");

  // Trocou a senha, mas não consegui ler o vínculo: dizer as duas coisas. A
  // primeira é boa notícia e não pode sumir por causa da segunda (regra 14).
  return {
    estado: "erro",
    mensagem:
      "Sua senha nova já está valendo — mas não consegui abrir o aplicativo agora. Entre por /entrar com a senha nova.",
  };
}
