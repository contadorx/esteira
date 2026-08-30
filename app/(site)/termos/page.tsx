import type { Metadata } from "next";
import { PaginaLegal } from "../legal";

export const metadata: Metadata = {
  title: "Termos de uso — Esteira",
  description: "O que a Esteira faz, o que ela não faz, e as regras da assinatura.",
};

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso" desde="30 de agosto de 2026">
      <h2>1. O que é a Esteira</h2>
      <p>
        A Esteira é um serviço de <b>acompanhamento de pedidos</b> para oficinas.
        Ela mostra em que etapa está cada pedido, registra quem avançou e quando,
        deixa a mensagem pronta para você mandar ao seu cliente e avisa quando um
        prazo está perto de estourar.
      </p>

      <h2>2. O que a Esteira não é — e não vai virar</h2>
      <p>
        Isto está aqui porque é a decisão de produto mais importante que tomamos,
        e você tem direito de saber antes de assinar:
      </p>
      <ul>
        <li>
          <b>Não é PCP.</b> Não planeja capacidade, não sequencia máquina, não
          calcula lote nem tempo padrão.
        </li>
        <li>
          <b>Não é ERP nem CRM.</b> Não guarda cadastro de cliente, tabela de
          preço, estoque, nota fiscal ou financeiro.
        </li>
        <li>
          <b>Não conversa com o seu cliente.</b> Ela <i>avisa</i>. Resposta que o
          seu cliente mandar chega para você, não para nós.
        </li>
      </ul>
      <p>
        A Esteira é feita para conviver com o seu sistema, não para substituí-lo.
      </p>

      <h2>3. Teste, planos e cobrança</h2>
      <ul>
        <li>
          O teste dura <b>14 dias</b>, não pede cartão e não vira cobrança
          sozinho: se você não escolher um plano, nada é cobrado.
        </li>
        <li>
          Os planos e os preços vigentes estão na página inicial. A cobrança é
          mensal, feita pelo <b>Asaas</b>, que é quem processa Pix, boleto e
          cartão. <b>Não guardamos número de cartão</b> — ele não passa pelos
          nossos servidores.
        </li>
        <li>
          Para emitir a cobrança o Asaas exige o seu CPF ou CNPJ. Ele é enviado
          direto ao Asaas e <b>não fica guardado no nosso banco de dados</b>.
        </li>
        <li>
          O plano limita a quantidade de <b>pedidos ativos ao mesmo tempo</b>.
          Usuários do escritório e acessos do chão são ilimitados em todos os
          planos.
        </li>
      </ul>

      <h2>4. O que acontece quando o pagamento não vem</h2>
      <p>
        Teste vencido, mensalidade em atraso ou limite do plano estourado
        bloqueiam <b>uma coisa só: cadastrar pedido novo</b>. Continuam
        funcionando normalmente:
      </p>
      <ul>
        <li>ver e mover os pedidos que já existem;</li>
        <li>o celular do chão, para quem está produzindo;</li>
        <li>o radar de atraso;</li>
        <li>a página pública que o seu cliente acompanha.</li>
      </ul>
      <p>
        <b>Nada é apagado por falta de pagamento.</b> Quem produz e quem paga a
        conta raramente são a mesma pessoa, e parar a produção de uma oficina por
        causa de um boleto seria desproporcional.
      </p>

      <h2>5. Cancelamento</h2>
      <p>
        Você cancela quando quiser, pela própria tela da conta. O acesso continua
        valendo <b>até o fim do período já pago</b> — quem paga no dia 1º e
        cancela no dia 2 usa o mês inteiro. Não há multa nem fidelidade.
      </p>
      <p>
        Para receber uma cópia dos seus dados ou pedir a exclusão da conta, é só
        pedir pelos canais do rodapé.
      </p>

      <h2>6. O acesso do chão de fábrica não tem senha</h2>
      <p>
        É uma decisão de projeto, não um descuido: exigir login de quem está com
        a mão na massa mataria o uso, e sem o chão atualizando não existe status.
        O acesso é um <b>link ou PIN por posto</b>, que você cria e pode revogar a
        qualquer momento na tela de Acessos.
      </p>
      <p>
        A consequência é sua responsabilidade: <b>quem tiver o link enxerga a
        lista daquele posto</b>. Por isso essa tela não mostra preço, valor,
        margem ou dado financeiro — só o número do pedido, a etapa e o prazo.
        Quando alguém sai da equipe, revogue o acesso.
      </p>

      <h2>7. A página pública do pedido</h2>
      <p>
        Cada pedido tem um endereço público com um código não adivinhável, feito
        para você mandar ao seu cliente. <b>Quem tiver o link vê aquele
        pedido</b>, sem senha — é o que torna possível o seu cliente acompanhar
        sem instalar nada. Não publique esses links em lugar aberto.
      </p>

      <h2>8. Sobre as mensagens ao cliente final</h2>
      <p>
        Hoje a Esteira <b>monta o texto e abre o WhatsApp para você mandar</b>.
        Ela não envia sozinha e, portanto, <b>não afirma que o seu cliente foi
        avisado</b> — a tela registra o que de fato aconteceu (&ldquo;mensagem
        copiada às 14h22&rdquo;). Envio automático depende de canal oficial do
        WhatsApp e será anunciado quando existir.
      </p>

      <h2>9. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o serviço no ar, mas não prometemos um percentual
        de disponibilidade. O serviço roda sobre a Vercel e o Supabase, e uma
        indisponibilidade deles nos atinge. Quando algo falhar, a tela vai dizer
        que falhou em vez de mostrar um número errado — este é um compromisso de
        produto que levamos a sério.
      </p>

      <h2>10. Limite de responsabilidade</h2>
      <p>
        A Esteira é uma ferramenta de acompanhamento. Ela não substitui a sua
        conferência: prazos, quantidades e o que é combinado com o seu cliente
        continuam sendo responsabilidade da sua oficina. Nossa responsabilidade,
        em qualquer hipótese, fica limitada ao valor que você pagou nos 12 meses
        anteriores ao fato.
      </p>

      <h2>11. Mudanças nestes termos</h2>
      <p>
        Se mudarmos algo relevante, avisamos por e-mail e dentro do aplicativo
        com pelo menos 30 dias de antecedência. Mudança de preço nunca vale para
        um período já pago.
      </p>

      <h2>12. Foro</h2>
      <p>
        Aplica-se a lei brasileira. Fica eleito o foro do domicílio do cliente
        para qualquer discussão sobre este contrato.
      </p>
    </PaginaLegal>
  );
}
