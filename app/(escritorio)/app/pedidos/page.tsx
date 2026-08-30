import type { Metadata } from "next";
import { headers } from "next/headers";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import ListaPedidos from "./lista";
import type { LinhaPedido } from "./tipos";

export const metadata: Metadata = { title: "Pedidos — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string }>;
}) {
  const { novo } = await searchParams;
  const { oficinaId } = await oficinaDaSessao();
  const supabase = await clienteDoServidor();

  const [resPedidos, resEtapas, resOficina] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        "id, numero, cliente_nome, cliente_fone, descricao, prazo, origem, tipo_pedido, token_publico, etapa_id",
      )
      .order("criado_em", { ascending: false }),
    supabase.from("etapas").select("id, nome, ordem, tipo_pedido").order("ordem"),
    supabase.from("oficinas").select("nome").eq("id", oficinaId ?? "").maybeSingle(),
  ]);

  // Regra 3: falha NÃO vira lista vazia. "Ainda não perguntei" e "não consegui"
  // são estados distintos de "não há pedidos".
  if (resPedidos.error || resEtapas.error) {
    const qual = resPedidos.error ? "os pedidos" : "as etapas";
    const msg = (resPedidos.error ?? resEtapas.error)!.message;
    return (
      <div className="wrap-app">
        <h1>Pedidos</h1>
        <div className="falha" role="alert">
          <b>Não consegui carregar {qual}.</b>
          <p>{msg}</p>
          <p className="obs">
            A tela não sabe quantos pedidos existem — este número não é zero, é
            desconhecido.
          </p>
        </div>
      </div>
    );
  }

  const etapas = resEtapas.data ?? [];
  const porId = new Map(etapas.map((e) => [e.id, e]));
  // Última etapa de cada caminho: é o que decide se a mensagem é "avançou" ou
  // "está pronto".
  const ultimaOrdem = new Map<string, number>();
  for (const e of etapas) {
    ultimaOrdem.set(e.tipo_pedido, Math.max(ultimaOrdem.get(e.tipo_pedido) ?? 0, e.ordem));
  }

  const pedidos: LinhaPedido[] = (resPedidos.data ?? []).map((p) => {
    const etapa = p.etapa_id ? porId.get(p.etapa_id) : undefined;
    const tipo = p.tipo_pedido ?? "padrao";
    return {
      id: p.id,
      numero: p.numero,
      clienteNome: p.cliente_nome,
      clientePrimeiroNome: p.cliente_nome,
      fone: p.cliente_fone,
      descricao: p.descricao,
      prazo: p.prazo,
      origem: p.origem,
      tipo,
      tokenPublico: p.token_publico,
      etapaNome: etapa?.nome ?? null,
      naUltimaEtapa: etapa ? etapa.ordem >= (ultimaOrdem.get(tipo) ?? 0) : false,
    };
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "esteira.app.br";
  const protocolo = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";

  return (
    <ListaPedidos
      pedidos={pedidos}
      oficina={resOficina.error ? null : (resOficina.data?.nome ?? null)}
      base={`${protocolo}://${host}`}
      novo={novo ?? null}
      mostrarTipo={new Set(pedidos.map((p) => p.tipo)).size > 1}
    />
  );
}
