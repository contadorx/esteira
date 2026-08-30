import type { Metadata } from "next";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import PainelTempos from "./painel";
import type { RespostaTempos } from "./tipos";

export const metadata: Metadata = { title: "Tempos e previsão — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaTempos() {
  const { oficinaId } = await oficinaDaSessao();
  const supabase = await clienteDoServidor();

  const { data, error } = await supabase.rpc("tempos", { p_oficina: oficinaId });

  // Regra 3: uma tela de previsão vazia por falha de consulta diria "esta
  // oficina não tem histórico" quando o certo é "não consegui olhar". Essas
  // duas frases levam a decisões opostas.
  if (error) {
    return (
      <div className="wrap-app estreito">
        <h1>Tempos e previsão</h1>
        <div className="falha" role="alert">
          <b>Não consegui fazer a conta.</b>
          <p>{error.message}</p>
          <p className="obs">
            Isto <b>não</b> quer dizer que a oficina não tem histórico — quer
            dizer que não consegui lê-lo. Recarregue antes de concluir qualquer
            coisa desta tela.
          </p>
        </div>
      </div>
    );
  }

  return <PainelTempos dados={data as RespostaTempos} />;
}
