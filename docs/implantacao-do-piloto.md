# Implantação do piloto — o roteiro da tarde

O código está pronto. Esta é a metade do B7 que não é código, e é a que decide
se o produto existe: **uma tarde, na oficina, com o dono do lado.**

A promessa de venda é "implantação numa tarde". O cronômetro do portão do B2
mediu a configuração em segundos — sobra tempo justamente para a parte que
importa, que é conversar.

---

## Antes de sair de casa

1. **Rode a limpeza.** `supabase/limpeza-antes-do-piloto.sql`, bloco a bloco.
   A senha `esteira123` está em texto claro no GitHub e os tokens do chão são
   literais; enquanto é massa de teste, tudo bem — no dia em que houver pedido
   real na mesma base, viram porta aberta.
2. **Rode os portões contra o banco real.** `npm run portoes`. Nunca correram
   fora do servidor de mentira do sandbox; a RLS pelo app segue sem prova.
3. **Crie a oficina** com `supabase/nova-oficina.sql` (nome, e-mail e senha do
   dono). Não configure as etapas ainda — elas se escolhem lá, olhando a
   oficina.
4. **Confira o commit que está no ar** antes de mostrar qualquer coisa
   (regra 16). Já custou uma rodada inteira no FinanceiroX.
5. Leve o **celular carregado** e um **segundo celular** ou tablet: você vai
   precisar mostrar o quadro e o chão ao mesmo tempo.

---

## A demo, em 90 segundos

Antes de configurar qualquer coisa. Se ela não prender, o resto da tarde não
importa.

1. Abra o quadro no seu computador, com os pedidos de exemplo.
2. Abra o link do chão no seu celular e **entregue o celular na mão dele**.
3. Peça para ele avançar um pedido. Dois toques.
4. Vire a tela do computador: o cartão andou de coluna.
5. Mostre a mensagem pronta para o cliente e a página que o cliente abre.

**O que escutar:** o "mas" que vier depois. *"Mas o Toninho não usa celular"*,
*"mas a gente não tem número do cliente"*, *"mas às vezes o pedido volta"* —
cada um desses é informação de produto valendo mais que a demo.

---

## A configuração, com ele junto

**Etapas primeiro, e escritas com as palavras dele.** Aplique o pack do setor
e depois **renomeie na frente dele, uma por uma**. Os packs em `lib/packs.ts`
foram escritos de fora da oficina — são hipótese até este momento (D15).

> Pergunta que abre tudo: *"por onde um pedido passa daqui até sair pela
> porta?"* — e anote os nomes **exatos**. Se ele disser "acabamento" onde eu
> escrevi "polimento", o certo é o dele.

**Anote as divergências e corrija `lib/packs.ts` no mesmo dia.** É informação
de produto, não detalhe de implantação.

**Depois, os pedidos.** Se houver planilha, exporte como CSV e importe — o
relatório linha a linha mostra o que não entrou e por quê. Se não houver,
cadastre os 5 ou 10 pedidos em andamento na mão, com ele ditando.

**Por último, os acessos do chão.** Um por pessoa ou por posto, em
`/app/acessos`. Coloque PIN se o celular for compartilhado.

---

## O que entregar na mão de quem produz

O portão do B7 pede isto explicitamente: **um acesso de chão na mão de quem
produz**, não no e-mail do dono.

- Abra o link **no celular da pessoa**, com ela olhando.
- Peça para ela salvar na tela inicial do telefone.
- Faça ela avançar um pedido de verdade, ali.
- Diga o que acontece com o botão "Deu problema" — que ele **registra**, e que
  o escritório vê; não que alguém é avisado na hora.

Se a pessoa não avançar um pedido na sua frente, a implantação não terminou.

---

## O combinado antes de ir embora

1. **Quem avança o quê.** Escreva num papel e deixe com o dono.
2. **O radar é você quem abre.** `/app/radar`, de manhã. A Esteira ainda não
   manda sozinha (D9) — deixe isso muito claro, porque radar em que se confia
   e não chega é pior que radar nenhum.
3. **Como avisar o cliente:** botão copiar, cola no WhatsApp da oficina. A
   mensagem sai do número dele, não do seu.
4. **Combine a volta:** dois dias depois, presencial ou por telefone.

---

## O que medir nas duas primeiras semanas

O portão de negócio (1 → 2) pede três pagantes por 30 dias com **≥70% dos
avanços feitos pelo chão**. O rodapé do radar já mostra esse número.

| o que | onde ver | por que decide |
|---|---|---|
| **% de avanços pelo chão** | rodapé de `/app/radar` | abaixo de 40% depois de dois ajustes, o produto vira outra coisa ou morre |
| ligações "cadê meu pedido" | peça para o dono contar num papel | é a dor que vendeu o produto |
| pedidos avançados no mesmo dia | quadro, coluna a coluna | separa "instalaram" de "usam" |
| quantas vezes ele abriu o radar | pergunte | se ele não abre, a função que vende não pegou |

**A pergunta da volta, feita sem rodeio:** *"se eu desligasse isso amanhã, você
sentiria falta?"*. E depois: *"quanto isso vale por mês?"*.

---

## O que NÃO fazer

- **Não prometa o envio automático.** Ele é fase 2. A tela do radar já diz isso;
  não desdiga com a boca.
- **Não aceite "só falta colocar o apontamento de hora".** É PCP, está fora da
  fronteira (`02-produto.md`). Anote na lista de recusados, com data e quem
  pediu — três pedidos iguais viram informação de produto.
- **Não configure as etapas sozinho na véspera.** O valor da tarde está em
  ouvir os nomes reais.
- **Não deixe a oficina com o quadro vazio.** Sem pedidos dentro, ninguém volta
  na segunda-feira.
