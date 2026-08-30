"use server";

import { redirect } from "next/navigation";
import { clienteDoServidor } from "@/lib/supabase/server";
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    // Regra 2: não inventamos a causa. "Credenciais inválidas" é o que o
    // servidor de auth respondeu; qualquer outra coisa aparece como veio.
    const invalida = error.message.toLowerCase().includes("invalid");
    return {
      estado: "erro",
      mensagem: invalida ? "E-mail ou senha não conferem." : error.message,
    };
  }

  if (!data.user?.app_metadata?.oficina_id) {
    // Entrou, mas o usuário não está amarrado a nenhuma oficina: dizer isso,
    // não deixar cair numa tela vazia que parece "não tem pedido nenhum".
    return {
      estado: "erro",
      mensagem:
        "Este usuário entrou, mas não está ligado a nenhuma oficina. Fale com o suporte.",
    };
  }

  redirect("/app");
}
