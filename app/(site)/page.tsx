const EMAIL = "leandropucsp@gmail.com";
const ASSUNTO = encodeURIComponent("Esteira — quero ser uma das primeiras oficinas");
const CORPO = encodeURIComponent(
  "Oi, Leandro. Tenho uma oficina e quero conhecer a Esteira.\n\nMeu ramo: \nCidade: \nPedidos em andamento (mais ou menos): ",
);
const CTA = `mailto:${EMAIL}?subject=${ASSUNTO}&body=${CORPO}`;

function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#16304F" />
      <path d="M12 40h40" stroke="#EA5A0B" strokeWidth="6" strokeLinecap="round" />
      <circle cx="20" cy="48" r="4" fill="#fff" />
      <circle cx="32" cy="48" r="4" fill="#fff" />
      <circle cx="44" cy="48" r="4" fill="#fff" />
      <rect x="24" y="18" width="18" height="14" rx="2" fill="#fff" />
    </svg>
  );
}

export default function Landing() {
  return (
    <>
      <header className="hero">
        <div className="wrap">
          <nav className="hero-nav" aria-label="Topo">
            <div className="marca">
              <Logo />
              <span className="n">Esteira</span>
            </div>
            <span className="badge-obra">em construção — escolhendo as primeiras oficinas</span>
          </nav>
          <h1>Todo pedido à vista. Do corte à entrega.</h1>
          <p className="sub">
            A Esteira mostra em que etapa está cada pedido da sua oficina, avisa
            o seu cliente sozinha e te cutuca <em>antes</em> do prazo estourar.
            Sem app para instalar, sem senha para o pessoal da produção.
          </p>
          <div className="cta">
            <a className="btn btn-aco" href={CTA}>Quero ser uma das primeiras oficinas</a>
            <span className="nota">Responde quem fez: {EMAIL}</span>
          </div>
        </div>
      </header>

      <section className="dor">
        <div className="wrap">
          <div className="rotulo">O problema</div>
          <h2>“Cadê meu pedido?” — vinte vezes por dia</h2>
          <blockquote>
            “O telefone toca, é o cliente perguntando da bancada dele. Eu largo o
            que estou fazendo, vou lá no fundo perguntar pro Toninho, volto e
            ligo de volta. Faço isso o dia inteiro. E quando um pedido atrasa, eu
            descubro pelo telefone — o cliente sabe antes de mim.”
            <footer>— todo dono de oficina, todo santo dia</footer>
          </blockquote>
          <p className="lede">
            O seu sistema tem o pedido e tem a nota. O que acontece no meio —
            cortado, montado, pintado, pronto, saiu — não está em lugar nenhum,
            porque quem produz não tem login de escritório. A Esteira cuida
            exatamente desse meio.
          </p>
        </div>
      </section>

      <section className="alt">
        <div className="wrap">
          <div className="rotulo">Como funciona</div>
          <h2>Três telas. Só três.</h2>
          <div className="telas">
            <div className="tela">
              <span className="quem">escritório</span>
              <h3>O quadro</h3>
              <p>
                Coluna é etapa, cartão é pedido, a cor é o prazo. A tela que
                substitui a caminhada até o fundo da oficina.
              </p>
              <div className="mini mini-quadro" aria-hidden="true">
                <div className="mini-col"><div className="mini-cartao" /><div className="mini-cartao aperta" /></div>
                <div className="mini-col"><div className="mini-cartao estourou" /><div className="mini-cartao" /><div className="mini-cartao" /></div>
                <div className="mini-col"><div className="mini-cartao" /></div>
              </div>
            </div>
            <div className="tela">
              <span className="quem">produção</span>
              <h3>O celular do chão</h3>
              <p>
                Quem produz abre um link — sem instalar nada, sem senha — vê o
                que está com ele e avança a etapa em dois toques.
              </p>
              <div className="mini mini-fone" aria-hidden="true">
                <div className="mini-tarefa"><span>#1042 · bancada 2,40 m</span><span className="mini-bt">Avançar ✓</span></div>
                <div className="mini-tarefa"><span>#1047 · lavatório</span><span className="mini-bt">Avançar ✓</span></div>
              </div>
            </div>
            <div className="tela">
              <span className="quem">seu cliente</span>
              <h3>A página do pedido</h3>
              <p>
                Um link no WhatsApp do seu cliente: onde está, o que falta,
                previsão. Ele para de ligar porque já sabe.
              </p>
              <div className="mini" aria-hidden="true">
                <ul className="mini-passos">
                  <li className="feito"><span className="pt" />Recebido</li>
                  <li className="feito"><span className="pt" />Corte</li>
                  <li className="atual"><span className="pt" />Acabamento — agora</li>
                  <li><span className="pt" />Pronto para entrega</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="rotulo">A parte que muda o jogo</div>
          <h2>Avisar antes, não explicar depois</h2>
          <div className="radar-palco">
            <div className="radar-txt">
              <p className="lede">
                Mostrar status é o que o seu cliente quer. O que muda a sua
                vida é o <b>radar de atraso</b>: toda manhã, a lista curta do
                que não sai no prazo se não andar hoje.
              </p>
              <ul>
                <li><span className="marcador" /><span>Chega <b>antes de o dia começar</b>, quando ainda dá para mudar a ordem do serviço.</span></li>
                <li><span className="marcador" /><span>Diz <b>o que fazer</b>: qual pedido, parado onde, há quantos dias.</span></li>
                <li><span className="marcador" /><span>O que ficou <b>parado o dia inteiro</b> aparece — é onde o prazo se perde em silêncio.</span></li>
              </ul>
            </div>
            <div className="zap" aria-label="Exemplo ilustrativo da mensagem do radar">
              <div className="zap-cab">— exemplo ilustrativo —</div>
              <div className="balao">
                <b>Esteira</b>
                <br />
                Bom dia! <b>3 pedidos não saem no prazo</b> se não andarem hoje:
                <ul>
                  <li><span className="mono">#1038</span> Construtora Vale — parado na <b>pintura há 2 dias</b></li>
                  <li><span className="mono">#1051</span> Ana Paula — ainda <b>não entrou no corte</b></li>
                  <li><span className="mono">#1029</span> Rest. Dom Pedro — <b>venceu ontem</b></li>
                </ul>
                <div className="h">07:00</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="alt">
        <div className="wrap">
          <div className="rotulo">Para quem é</div>
          <h2>Oficinas onde o pedido anda por etapas</h2>
          <div className="setores">
            <span>Marmoraria</span><span>Vidraçaria</span><span>Gráfica rápida</span>
            <span>Esquadria e serralheria</span><span>Marcenaria e planejados</span>
            <span>Confecção e malharia</span><span>Oficina mecânica e funilaria</span>
            <span>Assistência técnica</span><span>Laboratório óptico e protética</span>
          </div>
          <p className="criterio">
            O critério é simples: pedido que leva de <b>2 dias a 6 semanas</b> e
            passa por <b>3 ou mais etapas</b>. Se o seu sai no mesmo dia, a
            Esteira não é para você — e preferimos dizer isso agora.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="rotulo">Regras da casa</div>
          <h2>Feita para o chão de fábrica usar</h2>
          <div className="regras">
            <div className="regra">
              <b>Sem app para instalar</b>
              <p>Tudo funciona no navegador do celular que o seu pessoal já tem no bolso.</p>
            </div>
            <div className="regra">
              <b>Sem senha para a produção</b>
              <p>Link fixo ou PIN de quatro dígitos. Se precisar de mais que dois toques, o chão não usa — então não precisa.</p>
            </div>
            <div className="regra">
              <b>Usuários ilimitados, sempre</b>
              <p>Não cobramos por pessoa. Deixar o chão de fábrica de fora para economizar mataria o próprio produto.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="fim">
        <div className="wrap">
          <h2>Estamos escolhendo as primeiras oficinas</h2>
          <p>
            A Esteira está em construção, com as primeiras implantações marcadas
            para setembro. Quer o telefone tocando menos? Chama.
          </p>
          <a className="btn" href={CTA}>Quero ser uma das primeiras oficinas</a>
        </div>
      </div>

      <footer className="pe">
        <div className="wrap">
          <span>Esteira · esteira.app.br — em construção</span>
          <span>Contato: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></span>
        </div>
      </footer>
    </>
  );
}
