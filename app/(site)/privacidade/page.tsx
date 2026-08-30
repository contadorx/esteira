import type { Metadata } from "next";
import { PaginaLegal } from "../legal";

export const metadata: Metadata = {
  title: "Política de privacidade — Esteira",
  description:
    "Que dados a Esteira guarda, por quanto tempo, com quem compartilha e como pedir exclusão.",
};

export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de privacidade" desde="30 de agosto de 2026">
      <h2>1. Os dois papéis, que não se misturam</h2>
      <p>
        Esta é a parte que mais importa e quase nunca é explicada:
      </p>
      <ul>
        <li>
          Sobre <b>os dados da sua oficina</b> (seu e-mail, o nome da empresa, a
          assinatura), a Esteira é a <b>controladora</b>.
        </li>
        <li>
          Sobre <b>os dados dos clientes da sua oficina</b> (nome e telefone de
          quem encomendou), <b>quem controla é você</b>. Nós somos apenas{" "}
          <b>operadores</b>: guardamos e processamos a seu pedido, para mostrar o
          andamento e montar a mensagem. Não usamos esses contatos para nada
          nosso — não mandamos oferta, não cruzamos com outra base, não vendemos
          e não repassamos.
        </li>
      </ul>

      <h2>2. O que guardamos</h2>
      <ul>
        <li>
          <b>Da sua conta:</b> e-mail, senha (guardada cifrada, ninguém consegue
          lê-la), nome da oficina, papel de cada pessoa do escritório.
        </li>
        <li>
          <b>Dos pedidos:</b> número, descrição, prazo, tipo, etapa atual — e o
          nome e telefone do seu cliente, quando você preenche.
        </li>
        <li>
          <b>Do andamento:</b> cada avanço de etapa, com quem fez, quando, e a
          foto opcional que o chão anexar.
        </li>
        <li>
          <b>Da cobrança:</b> plano, situação, vencimentos e pagamentos —
          identificados pelos códigos do Asaas.
        </li>
        <li>
          <b>Registros técnicos:</b> logs de acesso e erro, para investigar
          problema.
        </li>
      </ul>

      <h2>3. O que <i>não</i> guardamos</h2>
      <ul>
        <li>
          <b>Número de cartão.</b> O pagamento acontece dentro do Asaas; esses
          dados não passam pelos nossos servidores.
        </li>
        <li>
          <b>CPF ou CNPJ.</b> O Asaas exige o documento para emitir a cobrança;
          ele vai direto para lá e não fica no nosso banco.
        </li>
        <li>
          <b>Cadastro comercial, preço, margem, estoque, nota.</b> A Esteira não
          é ERP e não coleta isso — nem para &ldquo;usar depois&rdquo;.
        </li>
      </ul>

      <h2>4. Com quem compartilhamos</h2>
      <p>Só com quem é necessário para o serviço existir:</p>
      <ul>
        <li>
          <b>Supabase</b> — banco de dados e autenticação, hospedado na AWS,{" "}
          <b>região de São Paulo</b>. É onde os dados ficam.
        </li>
        <li>
          <b>Vercel</b> — onde a aplicação roda.
        </li>
        <li>
          <b>Asaas</b> — instituição de pagamento; recebe seu nome, e-mail e
          documento para emitir a cobrança.
        </li>
      </ul>
      <p>
        Não vendemos dados, não fazemos publicidade e não usamos os dados de uma
        oficina para nada relacionado a outra.
      </p>

      <h2>5. Quem enxerga o quê</h2>
      <ul>
        <li>
          <b>Entre oficinas não há passagem.</b> A separação é feita no próprio
          banco de dados, e não apenas na tela: uma conta só alcança as linhas da
          sua oficina.
        </li>
        <li>
          <b>O acesso do chão</b> é um link ou PIN por posto, sem senha, e mostra
          apenas número do pedido, etapa e prazo — nunca valor ou dado
          financeiro. Você cria e revoga na tela de Acessos.
        </li>
        <li>
          <b>A página pública do pedido</b> tem um endereço com código não
          adivinhável, para você mandar ao seu cliente. Quem tiver o link vê
          aquele pedido.
        </li>
        <li>
          <b>Nossa equipe</b> não entra na sua conta para dar suporte sem que
          fique registrado quem entrou, quando e em qual oficina.
        </li>
      </ul>

      <h2>6. Por quanto tempo</h2>
      <p>
        Enquanto a conta existir. Pedido excluído sai do banco na hora. Encerrada
        a conta, apagamos os dados em até <b>30 dias</b>, exceto o que a lei
        obriga a manter (registros fiscais e de acesso).
      </p>

      <h2>7. Seus direitos (LGPD, art. 18)</h2>
      <p>
        Você pode pedir confirmação de tratamento, acesso, correção, portabilidade
        ou exclusão dos seus dados, e revogar consentimento. Basta escrever pelos
        canais do rodapé; respondemos em até 15 dias.
      </p>
      <p>
        Se o pedido for de um <b>cliente da sua oficina</b>, quem responde é
        você, que é o controlador desses dados — e nós ajudamos com o que for
        preciso do lado técnico.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Tráfego cifrado, senhas guardadas com hash, separação entre oficinas
        aplicada no banco de dados e acesso restrito por papel. Nenhum sistema é
        invulnerável; se acontecer um incidente com risco relevante, avisamos os
        afetados e a ANPD, como manda a lei.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Usamos apenas os cookies necessários para manter você conectado. Não há
        cookie de propaganda nem rastreador de terceiros.
      </p>

      <h2>10. Crianças</h2>
      <p>
        A Esteira é uma ferramenta de trabalho e não se destina a menores de 18
        anos.
      </p>
    </PaginaLegal>
  );
}
