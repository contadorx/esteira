import type { Metadata } from "next";
import { cookies } from "next/headers";
import { clienteAnonimo, temChaveSecreta } from "@/lib/supabase/server";
import Painel from "./painel";
import PedirPin from "./pin";
import type { PedidoChao } from "./tipos";

export const metadata: Metadata = {
  title: "Esteira",
  robots: { index: false, follow: false }, // link de trabalho, não página de site
};
export const dynamic = "force-dynamic";

export default async function PaginaChao({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const c = await cookies();
  const pin = c.get(`esteira_pin_${token.slice(0, 24)}`)?.value ?? null;

  const supabase = clienteAnonimo();
  const { data, error } = await supabase.rpc("chao_painel", {
    p_token: token,
    p_pin: pin,
  });

  // Regra 3: erro de rede NÃO pode virar "nada com você hoje" — o pessoal
  // acharia que não há trabalho e iria embora.
  if (error) {
    return (
      <main className="chao chao-aviso">
        <h1>Não consegui carregar</h1>
        <p>{error.message}</p>
        <p className="obs">
          Isto não quer dizer que não há pedidos — quer dizer que não consegui
          perguntar. Tente de novo em um minuto.
        </p>
      </main>
    );
  }

  if (data?.estado === "invalido") {
    return (
      <main className="chao chao-aviso">
        <h1>Link sem uso</h1>
        <p>Este link não vale mais. Peça um novo para o escritório.</p>
      </main>
    );
  }

  if (data?.estado === "pin") {
    return <PedirPin token={token} nome={data.nome} />;
  }

  const pedidos = (data?.pedidos ?? []) as PedidoChao[];

  return (
    <Painel
      token={token}
      nome={data.nome}
      oficina={data.oficina}
      posto={data.posto}
      pedidos={pedidos}
      podeFoto={temChaveSecreta()}
    />
  );
}
