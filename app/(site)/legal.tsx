/**
 * A casca das páginas de texto legal (termos, privacidade).
 *
 * Existe para as duas páginas não repetirem cabeçalho, rodapé e o aviso de
 * revisão — três cópias do mesmo bloco é a regra 12 esperando acontecer.
 */
import { canalDeSocorro, emailDeSuporte, operadora } from "@/lib/contato";

export function PaginaLegal({
  titulo,
  desde,
  children,
}: {
  titulo: string;
  desde: string;
  children: React.ReactNode;
}) {
  const { nome, documento } = operadora();

  return (
    <div className="legal-palco">
      <header className="legal-topo">
        <div className="wrap">
          <a className="marca marca-clara" href="/">
            <span className="n">Esteira</span>
          </a>
          <nav className="legal-nav">
            <a href="/termos">Termos de uso</a>
            <a href="/privacidade">Privacidade</a>
            <a href="/entrar">Entrar</a>
          </nav>
        </div>
      </header>

      <main className="wrap legal">
        <h1>{titulo}</h1>
        <p className="legal-desde">Em vigor desde {desde}.</p>

        {/*
          A IDENTIFICAÇÃO DE QUEM CONTRATA NÃO PODE SER INVENTADA.

          Um documento que diz "a Esteira, inscrita no CNPJ nº …" com um número
          fabricado é pior do que documento nenhum. Enquanto a razão social e o
          CNPJ não estiverem no ambiente, a página diz exatamente isso — para
          quem lê e para quem precisa preencher (regra 2).
        */}
        {nome && documento ? (
          <p className="legal-quem">
            Estes termos são firmados com <b>{nome}</b>, CNPJ {documento}, adiante
            designada &ldquo;Esteira&rdquo;.
          </p>
        ) : (
          <p className="legal-pendente" role="alert">
            <b>Falta preencher a identificação da empresa.</b> Razão social e
            CNPJ ainda não foram configurados (<code>RAZAO_SOCIAL</code> e{" "}
            <code>CNPJ</code>). Este documento não deve ser apresentado a um
            cliente pagante antes disso.
          </p>
        )}

        {children}

        <section className="legal-revisao">
          <h2>Sobre este documento</h2>
          <p>
            Foi escrito para ser honesto e legível, descrevendo o que o produto
            realmente faz — não para substituir a revisão de um advogado. Antes
            do primeiro cliente pagante ele deve passar por essa revisão.
          </p>
          <p>
            Dúvidas, pedidos de exclusão de dados ou qualquer outro assunto
            deste texto: {canalDeSocorro()}.
          </p>
        </section>
      </main>

      <footer className="pe">
        <div className="wrap">
          <span>Esteira · esteira.app.br</span>
          <span>
            Contato: <a href={`mailto:${emailDeSuporte()}`}>{emailDeSuporte()}</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
