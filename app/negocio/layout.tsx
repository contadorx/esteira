import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import { sair } from "./acoes";

export const dynamic = "force-dynamic";

/**
 * A CASCA DA ÁREA DE NEGÓCIO (D29, D31, D32).
 *
 * ── Por que fora do `(escritorio)` ───────────────────────────────────────────
 * Aquele layout exige vínculo com uma oficina, e `membros` tem
 * `unique (user_id)`. Quem opera o negócio da Esteira não é membro de oficina
 * nenhuma — e não deve virar um só para conseguir entrar.
 *
 * ── Por que MENU LATERAL aqui, e barra superior no app ───────────────────────
 * Não é incoerência: são duas telas de formatos diferentes. O app da oficina
 * tem um quadro horizontal, onde uma coluna de 210px sai do eixo em que as
 * etapas competem por espaço. Aqui o conteúdo é tabela e cartão, que não
 * disputam largura — e uma coluna vertical tem altura infinita, então cabe
 * título de grupo e rótulo comprido, que é o que uma barra horizontal não tem
 * onde escrever.
 *
 * ── A trava ──────────────────────────────────────────────────────────────────
 * Esta tela NÃO é a trava (regra 11). Quem decide é `sou_equipe()` no banco, e
 * `painel_negocio()` devolve `null` para quem não passa. O que se faz aqui é
 * não desenhar o menu para quem não vai poder abrir nada.
 */

const GRUPOS: { titulo: string; itens: { href: string; rotulo: string; nota: string }[] }[] = [
  {
    titulo: "O negócio",
    itens: [
      { href: "/negocio", rotulo: "Painel", nota: "receita, base e a fila de hoje" },
      { href: "/negocio/oficinas", rotulo: "Oficinas", nota: "a lista e o suporte" },
    ],
  },
  {
    titulo: "Dinheiro",
    itens: [{ href: "/negocio/faturas", rotulo: "Faturas", nota: "o que entrou e o que venceu" }],
  },
];

export default async function LayoutNegocio({ children }: { children: React.ReactNode }) {
  const sessao = await oficinaDaSessao();

  // Falha de leitura não vira redirect: /entrar tentaria a mesma leitura e
  // falharia igual, e a pessoa ficaria num pingue-pongue sem ver o motivo.
  if (sessao.estado === "falha") {
    return (
      <div className="neg-casca">
        <main className="neg-corpo">
          <div className="wrap-app estreito">
            <h1>Não consegui abrir a área de negócio</h1>
            <div className="falha" role="alert">
              <b>Falhou ao verificar a sessão.</b>
              <p>{sessao.erro}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (sessao.estado === "sem_sessao") redirect("/entrar");

  const supabase = await clienteDoServidor();
  const { data: daEquipe, error } = await supabase.rpc("sou_equipe");

  /*
    "Não consegui perguntar" NÃO é "não pode entrar" (regra 3). Se o RPC
    falhar, a tela diz que falhou — e mesmo assim não abre o menu, porque
    liberar na dúvida é o lado errado para errar numa área que enxerga a base
    inteira de clientes.
  */
  if (error) {
    return (
      <div className="neg-casca">
        <main className="neg-corpo">
          <div className="wrap-app estreito">
            <h1>Não consegui conferir seu acesso</h1>
            <div className="falha" role="alert">
              <b>A checagem de equipe falhou.</b>
              <p>{error.message}</p>
              <p className="obs">
                Isso não quer dizer que você não tem acesso — quer dizer que não
                deu para saber. Nada foi liberado por precaução.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!daEquipe) {
    return (
      <div className="neg-casca">
        <main className="neg-corpo">
          <div className="wrap-app estreito">
            <h1>Área restrita</h1>
            <p className="ajuda">
              Esta parte é de quem opera a Esteira. Sua conta não está nessa
              lista.
            </p>
            <a className="btn btn-aco" href="/app">
              Ir para o meu quadro
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="neg-casca">
      <aside className="neg-lado">
        <a className="neg-marca" href="/negocio">
          <span className="n">Esteira</span>
          <span className="neg-etiqueta">negócio</span>
        </a>

        {GRUPOS.map((g) => (
          <div className="neg-grupo" key={g.titulo}>
            <p className="neg-grupo-t">{g.titulo}</p>
            {g.itens.map((i) => (
              <a className="neg-item" href={i.href} key={i.href}>
                <b>{i.rotulo}</b>
                <span>{i.nota}</span>
              </a>
            ))}
          </div>
        ))}

        <div className="neg-pe">
          <a className="neg-voltar" href="/app">
            ← voltar para o app
          </a>
          <form action={sair}>
            <button type="submit" className="sair">
              sair
            </button>
          </form>
        </div>
      </aside>

      <main className="neg-corpo">{children}</main>
    </div>
  );
}
