import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import { sair } from "./acoes";

// Esta rota depende da requisição (sessão em cookie), então NUNCA pode ser
// pré-renderizada no build: prerender roda sem as variáveis de ambiente e sem
// cookie, e o build quebrava aqui. Rota de sessão é dinâmica por natureza.
export const dynamic = "force-dynamic";


export default async function LayoutEscritorio({
  children,
}: {
  children: React.ReactNode;
}) {
  const { oficinaId, erro } = await oficinaDaSessao();

  // Falha de leitura NÃO pode virar redirect para /entrar: /entrar tentaria a
  // mesma leitura, falharia igual, e o usuário ficaria num pingue-pongue sem
  // nunca ver o motivo.
  if (erro) {
    return (
      <div className="app-casca">
        <main className="app-corpo">
          <div className="wrap-app estreito">
            <h1>Não consegui abrir o aplicativo</h1>
            <div className="falha" role="alert">
              <b>Falhou ao verificar a sessão.</b>
              <p>{erro}</p>
              <p className="obs">
                Isso costuma ser configuração de ambiente faltando ou
                incorreta. Nenhum pedido foi alterado.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!oficinaId) redirect("/entrar");

  // Nome da oficina: se a leitura falhar, a barra NÃO inventa um nome nem
  // finge que está tudo bem — diz que não conseguiu ler (regras 2 e 3).
  const supabase = await clienteDoServidor();
  const { data, error } = await supabase
    .from("oficinas")
    .select("nome")
    .eq("id", oficinaId)
    .maybeSingle();

  const nomeOficina = error ? null : (data?.nome ?? null);

  return (
    <div className="app-casca">
      <header className="app-barra">
        <div className="app-barra-in">
          <a className="marca marca-clara" href="/app">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" rx="14" fill="#16304F" />
              <path d="M12 40h40" stroke="#EA5A0B" strokeWidth="6" strokeLinecap="round" />
              <circle cx="20" cy="48" r="4" fill="#fff" />
              <circle cx="32" cy="48" r="4" fill="#fff" />
              <circle cx="44" cy="48" r="4" fill="#fff" />
              <rect x="24" y="18" width="18" height="14" rx="2" fill="#fff" />
            </svg>
            <span className="n">Esteira</span>
          </a>

          <nav className="app-menu">
            <a href="/app">Quadro</a>
            <a href="/app/radar">Radar</a>
            <a href="/app/pedidos">Pedidos</a>
            <a href="/app/novo">Novo pedido</a>
            <a href="/app/importar">Importar CSV</a>
            <a href="/app/etapas">Etapas</a>
            <a href="/app/acessos">Acessos</a>
          </nav>

          <div className="app-quem">
            {nomeOficina ? (
              <b>{nomeOficina}</b>
            ) : (
              <b className="incerto">não consegui ler o nome da oficina</b>
            )}
            <form action={sair}>
              <button type="submit" className="sair">
                sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="app-corpo">{children}</main>
    </div>
  );
}
