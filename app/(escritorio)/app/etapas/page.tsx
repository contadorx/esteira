import type { Metadata } from "next";
import { clienteDoServidor } from "@/lib/supabase/server";
import { PACKS } from "@/lib/packs";
import EditorEtapas from "./editor";
import type { EtapaVista } from "./tipos";

export const metadata: Metadata = { title: "Etapas — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaEtapas() {
  const supabase = await clienteDoServidor();

  // Etapas e a contagem de pedidos saem da MESMA leitura (regra 4): se o
  // número ao lado da etapa viesse de outra consulta, as duas discordariam
  // em silêncio no primeiro avanço concorrente.
  const [resEtapas, resPedidos] = await Promise.all([
    supabase.from("etapas").select("id, nome, ordem, tipo_pedido").order("ordem"),
    supabase.from("pedidos").select("etapa_id"),
  ]);

  if (resEtapas.error || resPedidos.error) {
    const qual = resEtapas.error ? "as etapas" : "os pedidos";
    const msg = (resEtapas.error ?? resPedidos.error)!.message;
    return (
      <div className="wrap-app estreito">
        <h1>Etapas</h1>
        <div className="falha" role="alert">
          <b>Não consegui carregar {qual}.</b>
          <p>{msg}</p>
          <p className="obs">
            A tela não sabe quantas etapas existem — e não vai fingir que são
            zero.
          </p>
        </div>
      </div>
    );
  }

  const porEtapa = new Map<string, number>();
  for (const p of resPedidos.data ?? []) {
    if (p.etapa_id) porEtapa.set(p.etapa_id, (porEtapa.get(p.etapa_id) ?? 0) + 1);
  }

  const etapas: EtapaVista[] = (resEtapas.data ?? []).map((e) => ({
    ...e,
    pedidos: porEtapa.get(e.id) ?? 0,
  }));

  return <EditorEtapas etapas={etapas} packs={PACKS} />;
}
