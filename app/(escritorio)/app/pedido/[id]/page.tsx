import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  clienteDoServidor,
  oficinaDaSessao,
  supabaseAdmin,
  temChaveSecreta,
} from "@/lib/supabase/server";
import PainelPedido from "./painel";
import type { DetalheDoPedido } from "./tipos";

export const metadata: Metadata = { title: "Pedido — Esteira" };
export const dynamic = "force-dynamic";

/**
 * A foto do chão mora num bucket PRIVADO. Exibir exige URL assinada, e assinar
 * exige a chave de serviço. Quando ela falta, a tela diz que existe foto e que
 * não consegue mostrar — nunca esconde a existência dela (regra 2).
 */
async function assinarFotos(caminhos: string[]): Promise<{
  urls: Record<string, string>;
  erro: string | null;
}> {
  if (caminhos.length === 0) return { urls: {}, erro: null };
  if (!temChaveSecreta())
    return { urls: {}, erro: "falta a chave de serviço no servidor" };

  try {
    const { data, error } = await supabaseAdmin()
      .storage.from("avancos")
      .createSignedUrls(caminhos, 300);
    if (error) return { urls: {}, erro: error.message };
    const urls: Record<string, string> = {};
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) urls[item.path] = item.signedUrl;
    }
    return { urls, erro: null };
  } catch (e) {
    return { urls: {}, erro: e instanceof Error ? e.message : String(e) };
  }
}

export default async function PaginaPedido({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { oficinaId } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");

  const supabase = await clienteDoServidor();
  const { data, error } = await supabase.rpc("pedido_detalhe", { p_pedido: id });

  if (error) {
    return (
      <div className="wrap-app estreito">
        <h1>Pedido</h1>
        <div className="falha" role="alert">
          <b>Não consegui abrir este pedido.</b>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }

  const detalhe = data as DetalheDoPedido;
  // A RLS já garante que um pedido de outra oficina não volta. Chegar aqui
  // sem pedido é 404 de verdade, não tela vazia.
  if (!detalhe || detalhe.estado !== "ok") notFound();

  const caminhos = (detalhe.linha_do_tempo ?? [])
    .map((p) => p.foto)
    .filter((f): f is string => Boolean(f));
  const { urls, erro: erroFoto } = await assinarFotos(caminhos);

  return (
    <PainelPedido
      d={detalhe}
      fotos={urls}
      erroFoto={erroFoto}
      faltaChave={!temChaveSecreta()}
    />
  );
}
