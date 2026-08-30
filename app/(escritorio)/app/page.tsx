import type { Metadata } from "next";
import { clienteDoServidor } from "@/lib/supabase/server";
import Quadro from "./quadro/quadro";
import type { CartaoPedido, ColunaEtapa } from "./quadro/tipos";

export const metadata: Metadata = { title: "Quadro — Esteira" };
export const dynamic = "force-dynamic";

interface Busca {
  tipo?: string;
}

export default async function PaginaQuadro({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const { tipo: tipoPedido } = await searchParams;
  const supabase = await clienteDoServidor();

  // As duas leituras que o quadro é. Erro NÃO vira lista vazia: um quadro sem
  // cartões parece "tudo entregue", que é a mentira mais cara desta tela.
  const [resEtapas, resPedidos] = await Promise.all([
    supabase.from("etapas").select("id, nome, ordem, tipo_pedido").order("ordem"),
    supabase
      .from("pedidos")
      .select(
        "id, numero, cliente_nome, descricao, prazo, tipo_pedido, etapa_id, etapa_desde",
      )
      .order("prazo", { ascending: true, nullsFirst: false }),
  ]);

  if (resEtapas.error || resPedidos.error) {
    const qual = resEtapas.error ? "as etapas" : "os pedidos";
    const msg = (resEtapas.error ?? resPedidos.error)!.message;
    return (
      <div className="wrap-app">
        <h1>Quadro</h1>
        <div className="falha" role="alert">
          <b>Não consegui carregar {qual}.</b>
          <p>{msg}</p>
          <p className="obs">
            O quadro está vazio porque a consulta falhou — não porque não haja
            pedidos. Recarregue; se insistir, o banco é que não respondeu.
          </p>
        </div>
      </div>
    );
  }

  const todasEtapas = resEtapas.data ?? [];
  const todosPedidos = resPedidos.data ?? [];

  const tipos = [...new Set(todasEtapas.map((e) => e.tipo_pedido))].sort();
  // Cada tipo de pedido tem colunas próprias: misturar caminhos diferentes num
  // quadro só produziria colunas que não servem para metade dos cartões.
  const tipoAtivo = tipos.includes(tipoPedido ?? "") ? tipoPedido! : (tipos[0] ?? "padrao");

  const colunas: ColunaEtapa[] = todasEtapas
    .filter((e) => e.tipo_pedido === tipoAtivo)
    .map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem }));

  const cartoes: CartaoPedido[] = todosPedidos
    .filter((p) => (p.tipo_pedido ?? "padrao") === tipoAtivo && p.etapa_id)
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      cliente: p.cliente_nome,
      descricao: p.descricao,
      prazo: p.prazo,
      etapaId: p.etapa_id as string,
      etapaDesde: p.etapa_desde,
    }));

  // Um pedido cujo etapa_id não está entre as colunas deste tipo existe, mas
  // não aparece. Melhor contar do que sumir em silêncio (regra 2).
  const idsColunas = new Set(colunas.map((c) => c.id));
  const foraDoQuadro = todosPedidos.filter(
    (p) =>
      (p.tipo_pedido ?? "padrao") === tipoAtivo &&
      (!p.etapa_id || !idsColunas.has(p.etapa_id)),
  ).length;

  return (
    <Quadro
      colunas={colunas}
      cartoes={cartoes}
      tipos={tipos}
      tipoAtivo={tipoAtivo}
      foraDoQuadro={foraDoQuadro}
    />
  );
}
