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
  const { estado, oficinaId, oficina, erro } = await oficinaDaSessao();

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

  // Conta que existe mas ainda não tem oficina: não é para mandar de volta
  // ao login (ele entraria de novo e cairia aqui de novo). É para terminar o
  // cadastro.
  if (estado === "sem_oficina") redirect("/criar-conta/oficina");
  if (!oficinaId) redirect("/entrar");

  // O nome da oficina vem da MESMA chamada que já provou o vínculo
  // (`minha_sessao`), não de uma segunda consulta — regras 4 e 12.
  const nomeOficina = oficina;

  // A faixa do plano fica no layout porque ela precisa aparecer em QUALQUER
  // tela do escritório: quem descobre que o teste acabou só ao tentar
  // cadastrar um pedido descobre tarde demais, no meio de uma tarefa.
  // Falha de leitura não vira faixa nenhuma — inventar "está tudo bem" aqui
  // seria a regra 3 ao contrário, então o erro aparece como faixa também.
  const supabase = await clienteDoServidor();
  // `minha_conta()` não aceita id: a oficina vem de `jwt_oficina()`. A versão
  // com parâmetro deixava qualquer usuário logado ler o plano de qualquer
  // outra oficina — furo achado pelo linter do Supabase no mesmo dia.
  const { data: conta, error: erroConta } = await supabase.rpc("minha_conta");
  const c = conta as {
    estado?: string;
    pode_criar?: boolean;
    motivo?: string | null;
    dias_restantes?: number | null;
    status?: string;
  } | null;
  const bloqueado = c?.estado === "ok" && c.pode_criar === false;
  const acabando =
    c?.estado === "ok" &&
    c.status === "teste" &&
    typeof c.dias_restantes === "number" &&
    c.dias_restantes >= 0 &&
    c.dias_restantes <= 3;

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

          {/*
            CINCO ITENS, UM POR PERGUNTA (D29).

            Eram nove — e nove itens não é navegação, é um índice que a pessoa
            relê toda vez. A nona entrada (Conta, no B9) quebrou a linha em
            1280px, e a resposta não foi mudar a barra de lado: foi cortar.

            Cada item responde a uma pergunta que a pessoa já tem na cabeça:
              como está a produção agora?   → Quadro
              o que estoura se ninguém andar? → Radar
              cadê o pedido do fulano?      → Pedidos
              quanto tempo isso leva aqui?  → Tempos
              e a minha oficina?            → Ajustes

            "Novo pedido" e "Importar CSV" SAÍRAM: são ações, não lugares, e os
            botões já existem no Quadro e na tela de Pedidos. Mantê-los aqui era
            a regra 12 aplicada à navegação — o mesmo caminho em dois lugares,
            que um dia diverge.

            A barra é horizontal de propósito: a tela principal é um quadro, e
            uma coluna lateral tira largura exatamente do eixo em que as etapas
            competem por espaço.
          */}
          <nav className="app-menu">
            <a href="/app">Quadro</a>
            <a href="/app/radar">Radar</a>
            <a href="/app/pedidos">Pedidos</a>
            <a href="/app/tempos">Tempos</a>
            <a href="/app/ajustes">Ajustes</a>
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
      {/*
        Faixa de INCERTEZA, não de prazo: "não consegui conferir" não é um
        vencimento, e pintá-la de vermelho faria vermelho significar duas
        coisas diferentes na mesma barra (regra 5).
      */}
      {erroConta && (
        <p className="faixa-plano incerta" role="status">
          Não consegui conferir o plano desta oficina ({erroConta.message}). Isto
          não quer dizer que está tudo certo — quer dizer que não sei.
        </p>
      )}
      {!erroConta && bloqueado && (
        <p className="faixa-plano estourou" role="status">
          <b>Cadastro de pedido novo travado:</b> {c?.motivo}. O resto continua
          funcionando. <a href="/app/conta">Ver a conta</a>
        </p>
      )}
      {!erroConta && !bloqueado && acabando && (
        <p className="faixa-plano" role="status">
          {c?.dias_restantes === 0
            ? "Seu teste termina hoje."
            : `Seu teste termina em ${c?.dias_restantes} dia${(c?.dias_restantes ?? 0) > 1 ? "s" : ""}.`}{" "}
          Depois disso você continua vendo tudo e o chão continua avançando; só
          não dá para cadastrar pedido novo. <a href="/app/conta">Ver planos</a>
        </p>
      )}
      <main className="app-corpo">{children}</main>
    </div>
  );
}
