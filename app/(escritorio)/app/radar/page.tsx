import type { Metadata } from "next";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import PainelRadar from "./painel";
import type { RespostaRadar } from "./tipos";

export const metadata: Metadata = { title: "Radar de atraso — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaRadar() {
  const { oficinaId } = await oficinaDaSessao();
  const supabase = await clienteDoServidor();

  const [resRadar, resOficina] = await Promise.all([
    supabase.rpc("radar", { p_oficina: oficinaId }),
    supabase.from("oficinas").select("nome").eq("id", oficinaId ?? "").maybeSingle(),
  ]);

  // Regra 3: um radar vazio por falha de consulta é a pior tela do produto —
  // ela diz "está tudo bem" quando não se sabe de nada.
  if (resRadar.error) {
    return (
      <div className="wrap-app estreito">
        <h1>Radar de atraso</h1>
        <div className="falha" role="alert">
          <b>Não consegui fazer a conta.</b>
          <p>{resRadar.error.message}</p>
          <p className="obs">
            Isto <b>não</b> quer dizer que está tudo em dia — quer dizer que não
            sei. Recarregue antes de confiar na tela.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PainelRadar
      dados={resRadar.data as RespostaRadar}
      oficina={resOficina.error ? null : (resOficina.data?.nome ?? null)}
    />
  );
}
