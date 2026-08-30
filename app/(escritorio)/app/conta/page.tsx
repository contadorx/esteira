import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import { cobrancaLigada } from "@/lib/cobranca";
import PainelConta from "./painel";
import type { Membro, MinhaFatura, Plano, RespostaConta } from "./tipos";

export const metadata: Metadata = { title: "Conta — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaConta() {
  const { oficinaId, oficina, usuarioId, papel } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  // Só o dono; quem não é vê a própria senha e mais nada (a trava de verdade
  // está na RLS — isto aqui só evita mostrar uma tela que não funcionaria).
  const ehDono = papel === "dono";

  const supabase = await clienteDoServidor();
  const [resConta, resMembros, resPlanos, resFaturas] = await Promise.all([
    supabase.rpc("minha_conta"),
    ehDono
      ? supabase
          .from("membros")
          .select("id, email, papel, ativo, user_id, criado_em")
          .order("criado_em", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase.from("planos").select("codigo, nome, preco_centavos, limite_pedidos_ativos, ordem").order("ordem"),
    // "Cadê o meu boleto" é a pergunta que mais gera ligação numa assinatura,
    // e ela tem resposta desde que o webhook passou a gravar cada cobrança
    // conferida (D30). A RLS de `faturas` deixa a oficina ver só as próprias.
    supabase.rpc("minhas_faturas"),
  ]);

  // Regra 3: falha de leitura não pode virar "sem plano" nem "sem gente".
  if (resConta.error) {
    return (
      <div className="wrap-app estreito">
        <h1>Conta</h1>
        <div className="falha" role="alert">
          <b>Não consegui ler a assinatura desta oficina.</b>
          <p>{resConta.error.message}</p>
          <p className="obs">
            Isto <b>não</b> quer dizer que a conta está sem plano — quer dizer
            que não consegui olhar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PainelConta
      conta={resConta.data as RespostaConta}
      oficina={oficina}
      ehDono={ehDono}
      meuId={usuarioId}
      membros={(resMembros.data ?? []) as Membro[]}
      erroMembros={resMembros.error?.message ?? null}
      planos={(resPlanos.data ?? []) as Plano[]}
      erroPlanos={resPlanos.error?.message ?? null}
      cobrancaLigada={cobrancaLigada()}
      faturas={(resFaturas.data ?? []) as MinhaFatura[]}
      erroFaturas={resFaturas.error?.message ?? null}
    />
  );
}
