import type { Metadata } from "next";
import { oficinaDaSessao } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ajustes — Esteira" };
export const dynamic = "force-dynamic";

/**
 * AJUSTES — a resposta à pergunta "e a minha oficina?" (D29).
 *
 * Nasceu do corte do menu: Etapas, Acessos e Conta eram três entradas fixas na
 * barra do topo, num produto em que se mexe nelas uma vez por trimestre. Elas
 * empurraram o menu para nove itens e quebraram a linha em 1280px.
 *
 * Isto não é um índice a mais: é o lugar onde as três param de disputar espaço
 * com o Quadro e o Radar, que é onde a pessoa vive.
 */

const CARTOES = [
  {
    href: "/app/etapas",
    titulo: "Etapas",
    linha: "As colunas do quadro, por tipo de pedido.",
    detalhe:
      "Mudar aqui muda o caminho que todo pedido novo percorre. Os que já estão andando ficam onde estão.",
    soDono: false,
  },
  {
    href: "/app/acessos",
    titulo: "Acessos do chão",
    linha: "Os links e PINs de quem produz — criar e revogar.",
    detalhe:
      "Quem tem o link enxerga a lista daquele posto, sem senha (é o que faz o chão usar). Quando alguém sai da equipe, revogue aqui.",
    soDono: false,
  },
  {
    href: "/app/conta",
    titulo: "Conta e plano",
    linha: "Assinatura, pessoas do escritório e senha.",
    detalhe: "Só o dono da oficina abre esta tela.",
    soDono: true,
  },
];

export default async function PaginaAjustes() {
  const { papel, oficina } = await oficinaDaSessao();
  const ehDono = papel === "dono";

  return (
    <div className="wrap-app">
      <h1>Ajustes{oficina ? ` — ${oficina}` : ""}</h1>
      <p className="ajuda">
        O que se configura uma vez e quase não se mexe. O dia a dia está no
        Quadro e no Radar.
      </p>

      <div className="ajustes-grade">
        {CARTOES.filter((c) => !c.soDono || ehDono).map((c) => (
          <a key={c.href} className="ajuste-cartao" href={c.href}>
            <h2>{c.titulo}</h2>
            <p className="linha">{c.linha}</p>
            <p className="obs">{c.detalhe}</p>
          </a>
        ))}
      </div>

      {/*
        Regra 2: em vez de simplesmente esconder a Conta, dizer que ela existe e
        por que não está aqui. Quem não é dono e procura "onde troco o plano"
        precisa de uma resposta, não de uma ausência.
      */}
      {!ehDono && (
        <p className="obs ajustes-nota">
          Plano, pessoas e senha ficam com o dono da oficina — quem tem esse
          papel vê um terceiro cartão aqui.
        </p>
      )}
    </div>
  );
}
