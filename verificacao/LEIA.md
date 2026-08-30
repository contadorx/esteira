# Verificação

Roteiros que **abrem a tela e medem** (regra 9 do `05-regras-de-engenharia`).
Compilador e build aprovam bug com naturalidade; isto não.

## Rodar

```bash
npm run build && npm run start      # produção, dev server desligado (regra 16)
npm i -D playwright                 # só na primeira vez
npx playwright install chromium
node verificacao/portao-b1.mjs
```

Variáveis: `BASE` (padrão `http://localhost:3000`), `EMAIL`, `SENHA`.

Antes: rode `supabase/seed.sql` e `supabase/seed-auth-dev.sql` no banco de
desenvolvimento — o roteiro precisa de um usuário e de etapas configuradas.

## `pedidos-teste.csv`

60 linhas de dados, **5 com defeito plantado** (uma de cada classe) e uma linha
em branco no meio, que deve ser ignorada sem virar rejeição:

| linha | nº | defeito |
|---|---|---|
| 8 | T-9007 | prazo `31/02/2026` — passa em qualquer regex, não existe no calendário |
| 16 | T-9015 | etapa "Polimento a laser", que não existe na oficina |
| 24 | — | sem número de pedido |
| 33 | T-9031 | sem nome do cliente |
| 46 | T-9044 | telefone `123`, sem DDD |

Esperado: **55 entram, 5 voltam com linha e motivo.** É o portão do B1.

## O que este roteiro NÃO prova

- **Isolamento entre oficinas.** Ele entra com um usuário só. Para provar a RLS
  (regra 11: policy só se prova usando o app com usuário de verdade), crie um
  segundo usuário em outra oficina e confira que nenhum pedido da primeira
  aparece. O SQL Editor não serve: ele roda como `postgres` e atravessa a RLS.
- **Concorrência de avanço** — isso entra no portão do B4.

## `portao-b2.mjs` — etapas e packs

Mede o que o bloco promete e as travas que a regra 13 exige:

- o **cronômetro** do portão: tipo novo + pack aplicado, com limite de 30 min;
- remover etapa **em uso** é recusado, e o motivo traz o número apurado de pedidos;
- reordenar sobrevive à recarga (a renumeração é uma transação no banco);
- pack não é oferecido por cima de um tipo já configurado;
- renomear persiste; layout medido em 1280px e 390px.

Limpeza: `delete from etapas where tipo_pedido like 'crono%';`

## `portao-b3.mjs` — o quadro

O portão do bloco é uma **soma**: os cartões renderizados em cada coluna, o
contador da coluna e o KPI "No quadro" têm que dar o mesmo número. Números que
só discordam quando alguém os soma foi como apareceram, no FinanceiroX, a barra
que encolhia e a cor invertida.

Verifica ainda:

- os **dois caminhos** de mover — botão `›` e arrasto pela alça — levando o
  cartão certo à coluna certa;
- a **trava de concorrência** (regra 7) com duas abas abertas: a desatualizada
  ouve que perdeu a disputa, e a mensagem diz onde o pedido está agora;
- a regra 5: a borda do cartão e a pill de prazo contam a mesma situação;
- o quadro rola dentro da própria faixa, sem empurrar a página de lado.

## `portao-b4.mjs` — o celular do chão

Roda em viewport de celular com toque de verdade (`hasTouch`). Mede o portão do
bloco:

- o avanço acontece em **dois toques contados** — botão do pedido, depois
  Confirmar;
- **dois celulares** com o mesmo pedido: o segundo NÃO recebe "pronto", ouve que
  alguém marcou antes e onde o pedido está;
- **token de outra oficina não vê nada**, provado pelo app (regra 11);
- PIN barra quem tem só o link, e não é pedido de novo no mesmo celular;
- D1 respeitado: nenhum telefone na tela; alvos ≥56px.

Variáveis: `TOKEN`, `TOKEN_OUTRA`, `TOKEN_PIN`, `PIN`.

**Este portão já pagou por si.** A primeira versão da função `chao_avancar`
descobria o motivo da recusa *depois*, adivinhando — e respondia "já está na
última etapa" para um pedido que só não era daquele posto. Recusa certa com
motivo errado continua sendo violação da regra 2. Hoje `invalido`, `conflito` e
`fim` são testados separadamente, na mesma ordem, no banco e no roteiro.

## `portao-b5.mjs` — a página do cliente e o aviso

O portão deste bloco é **uma frase que não pode existir**. O mockup tinha um
toast dizendo "#1042 avançou — cliente avisado" sem nada por trás; é o furo que
originou a regra nº 2. Na fase 1 quem envia é a pessoa, pelo WhatsApp dela, e o
aplicativo não tem como saber se ela apertou enviar.

O roteiro varre `/app` e `/app/pedidos` atrás de "avisado" e **falha se achar**.
Confere também que a confirmação diz "copiada às HH:MM", que o token público
tem 32 caracteres, que a página abre em navegador limpo sem um cookie sequer, e
que **nada de dentro da oficina chega ao navegador do cliente**: telefone, nome
e observação interna são procurados no `textContent` — que inclui o payload dos
`<script>`, porque dado que não aparece na tela mas viaja até o navegador vaza
do mesmo jeito.

A régua de exposição do projeto, para não confundir os três casos:

| onde | o que aparece do cliente |
|---|---|
| mensagem que a oficina manda | nome completo (é ela falando com quem conhece) |
| tela do chão de fábrica | primeiro nome |
| página pública do pedido | nome nenhum — o link pode ser reencaminhado |

## `portao-b6.mjs` — o radar de atraso

A aritmética é provada pela **fumaça no banco**, com pedidos montados para cair
em cada motivo e nos limites: prazo de ontem, folga de exatamente um dia,
parado há 1 × 2 dias, vencido já na última etapa (que fica de fora), e o caso
de o pedido sair do radar assim que anda. Ver o cabeçalho de
`supabase/migrations/20260830_radar.sql`.

Este roteiro prova a outra metade — que a tela mostra o que a conta mandou:
KPI de cada motivo = itens daquele motivo na lista; ordem por gravidade; cada
item explicando o próprio motivo de forma concreta; a mensagem contendo
exatamente os mesmos pedidos; e **a tela dizendo que o envio automático das 7h
ainda não existe** (D9) — prometer uma mensagem que não vem é pior que não ter
radar, porque a pessoa passou a confiar.

## `portao-b8.mjs` — a previsão aprendida (fase 2)

A divisão de trabalho aqui é a que mais importa entender:

- **A aritmética** é provada por `supabase/fumaca-tempos.sql`, que roda contra
  o banco de VERDADE dentro de `BEGIN…ROLLBACK`, com histórico montado e
  medianas conferidas na mão (Corte 1/2/3 dias → mediana 2,0; amostra de 2 →
  NULO; previsão de F-4 = (2,0 − 1) + 4,0 = 5,0 → hoje+5, folga −2).
- **Este roteiro** prova a outra metade: que a tela mostra o que a função
  devolveu — e, principalmente, que ela **não mostra o que a função não sabe**.

O portão, em números medidos no DOM: o KPI "etapas aprendidas" = as etapas
com duração na tabela; "pedidos com previsão" = as linhas da tabela de
previsão; "atrasam pela conta" = as linhas que dizem "depois do prazo". E,
quando não há previsão nenhuma, esse KPI mostra **um traço, não 0** — 0 ali
seria a tela afirmando que nada atrasa quando ela não sabe (regra 2).

Verifica ainda: etapa com amostra curta nunca vira número; a última etapa diz
"nada sai dela" em vez de fingir que falta amostra; onde o mais antigo da
fila passa do p80 a tela avisa que a mediana está otimista; nenhum pedido
aparece nas duas listas do radar; e a segunda lista é âmbar, não vermelha (o
prazo ainda não passou — o que a conta diz é que ele NÃO vai ser cumprido).

**Este portão diz quando PULOU.** Vários itens só existem se a base tiver o
caso — uma etapa com amostra curta, um pedido sem previsão. Numa oficina nova
não tem. Passar calado seria repetir o defeito do B5 (teste que procura o que
não existe passa vazio). Então ele imprime `~ PULADO` com o motivo.

Duas passadas, porque são dois produtos diferentes:

```bash
node verificacao/portao-b8.mjs          # oficina com histórico
TEMPOS_VAZIO=1 node verificacao/portao-b8.mjs   # oficina no primeiro mês
```

A segunda é a que importa mais: **é o estado de toda oficina real no dia 1.**

## `portao-b9.mjs` — conta, pessoas e autocadastro

Três coisas que separam "software que existe" de "produto que se vende", e o
jeito conhecido de cada uma dar errado:

- **plano**: o par de números do uso e a largura da barra têm que ser a mesma
  razão (regra 4), e a faixa de bloqueio tem que dizer o que **continua**
  funcionando — senão a pessoa acha que perdeu os dados;
- **pessoas**: quem é do escritório não vê a tela de gente nem o item "Conta"
  no menu (a trava de verdade é a RLS; isto mede que a tela não oferece o que
  não funcionaria);
- **preço**: a landing é texto estático e a tela de conta lê do banco. O
  roteiro compara os dois na tela. É a divergência mais fácil de acontecer e a
  mais cara de descobrir pelo cliente.

Roda a mesma tela em quatro estados de assinatura, trocados por arquivo:
teste normal, teste acabando, teste vencido e plano pago.

> O limite de pedidos do plano **não** é provado aqui: ele é provado contra o
> banco de verdade, na fumaça do `20260830_conta.sql`, com um plano de 2
> pedidos. No servidor de mentira o limite do teste é alto de propósito — com
> o B1 importando 55 pedidos antes, a faixa de limite tapava a faixa de teste
> acabando, e o roteiro media o caso errado.

## `portao-b11.mjs` — a cobrança (Asaas)

O webhook é a **única porta que escreve "está pago"**. E o Asaas, ao contrário
da Stripe, **não assina os eventos**: autentica com um token estático no
cabeçalho `asaas-access-token`. Quem descobrir o token forja qualquer aviso,
para sempre — não há HMAC nem janela de tempo que impeça.

Por isso o produto não acredita no aviso: todo evento é **conferido de volta
na API do Asaas** antes de virar acesso. O roteiro roda contra um Asaas de
mentira no mesmo servidor do stub, onde **o id da cobrança escolhe a
resposta** (`pay_confirmada`, `pay_pendente`, `pay_vencida`, `pay_explode`, id
desconhecido → 404).

O teste que define o bloco é o nº 4: **um POST com o token certo dizendo
"confirmada", sobre uma cobrança que o Asaas diz estar PENDENTE, não pode
liberar nada.** Com a Stripe isso era impossível (o corpo era assinado); aqui
é o ataque mais barato que existe.

Os outros catorze: sem token, token errado, token truncado, cobrança
inexistente, provedor fora do ar (**500**, para reenviar — não conseguir
perguntar não é "não pagou"), cobrança sem dono, evento irrelevante, o caminho
certo, vencida virando pendência (não cancelamento), assinatura ativa que
**não** libera sozinha, e a assinatura desta oficina removida lá.

```bash
export ASAAS_WEBHOOK_TOKEN=<o mesmo do .env.local>
npm run portao:b11
```

O servidor lê o token do `.env.local` e o roteiro lê do shell: se divergirem,
tudo é recusado com 401.

**Não provado aqui:** criar cliente, criar assinatura e abrir fatura no Asaas
de verdade — precisa de chave e conta. O roteiro da primeira execução real
está em `docs/ligar-a-cobranca.md`.

## `portao-b12.mjs` — a gaveta do pedido

A linha do tempo é lida como prova, então o defeito caro aqui é **contar uma
história que não aconteceu**:

- "Deu problema" grava na MESMA etapa. Desenhá-lo como avanço faz o dono ler
  que o pedido andou quando ele empacou — o roteiro reprova isso.
- A foto sobe para bucket privado. Quando a exibição falha, a tela tem que
  dizer que a foto **existe e não se perdeu** — quem tirou acredita que
  registrou.
- E a frase proibida de sempre: a gaveta nunca diz "cliente avisado".

## `varredura.mjs` — as 16 regras, item a item

`npm run varredura`. Não é carimbo: cada verificação mecânica tem **canários**
— um trecho que ela DEVE pegar e outro que ela NÃO pode pegar. Se o canário
passa despercebido, o roteiro acusa a própria verificação como cega. É a regra
15 aplicada a si mesma, e ela já pagou: o detector da regra 5 estava cego
porque o arnês passava um arquivo `.ts` para um detector que só olha `.tsx`.

Três vereditos: **OK** (verificado, nada encontrado), **ACHOU** (com arquivo e
linha) e **MANUAL** (não mecanizável — e diz onde a regra É provada: qual
portão, qual fumaça).

Exceções à regra 5 ficam **declaradas com motivo** dentro do roteiro, não
escondidas afrouxando o detector. Uso novo que não estiver na lista é acusado.

## Armadilhas já pagas

A primeira versão deste roteiro clicava em `button[type=submit]`, que também
casa com o **"sair"** do cabeçalho. O teste saía da sessão e acusava falha no
import que não existia. Regra 15 na prática: a ferramenta que previne defeito
precisa da mesma revisão que o código. Clique sempre em
`form.form button[type=submit]`.

Outras três, todas do mesmo tipo — o roteiro errado acusando o produto:

- **`.etapa-linha` solto atravessa todos os blocos de tipo.** Escope ao bloco
  (`section.tipo-bloco` filtrado pelo nome do tipo) antes de contar ou clicar.
- **O rótulo do tipo aparece capitalizado** ("crono123" vira "Crono123"):
  comparar em minúsculas, ou usar `hasText`, que já é insensível.
- **Resíduo de execução anterior muda a tela.** Um tipo `crono*` de uma rodada
  passada entra antes de "Padrao" na ordenação e desloca tudo. Rode a limpeza.
- **Teste de vazamento com massa que não tem o dado não prova nada.** A primeira
  versão do B5 procurava telefone numa base sem telefone e passava vazio — pior
  que não ter teste, porque dá sensação de segurança. Confira que a massa
  contém aquilo que o teste procura.
- **Data pura em coluna `timestamptz` desloca o dia.** `2026-09-09` vira
  meia-noite UTC, que é 21h do dia 8 em São Paulo — e "parado há N dias" sai
  um dia maior. A produção grava `now()`, um instante real; o teste precisa
  construir hora local explícita (`'... 09:00'::timestamp at time zone
  'America/Sao_Paulo'`). Regra 8 cobrando o preço dela no teste.
- **Regra de teste rígida demais reprova a redação melhor.** Exigir número no
  motivo reprovava "venceu ontem", que é mais claro que "venceu há 1 dias".
  Teste a intenção (ser concreto), não a forma.
- **Portão que espera pela tela errada passa por acidente.** `/app` era a
  LISTA quando o B1 e o B2 nasceram; desde o B3 é o QUADRO. A espera
  `.tabela tbody tr, .vazio` casava com `.vazio` só quando a oficina não
  tinha etapa nenhuma — ou seja, ficava verde numa base vazia e travava numa
  base de verdade. Portão que só funciona sem dados não é portão.
- **Portão que deixa resíduo quebra o próximo.** O B2 criava tipos `crono*`
  e pedia limpeza por SQL no rodapé; encadeado, o tipo entrava antes de
  "Padrao" e deslocava a primeira coluna do quadro, e o B3 media a coluna
  errada. Hoje o B2 limpa **pela tela** o que criou, e isso é um item
  verificado, não higiene opcional.
- **Contar é um atalho; afirmar é outra coisa.** O B4 checava "a lista
  encolheu um" em vez de "ESTE pedido saiu". A lista revalida depois do
  recado aparecer, então a contagem às vezes pegava o render antigo e o
  portão piscava vermelho sem defeito nenhum. Portão que pisca ensina a rodar
  de novo até passar — o oposto do que ele serve.
- **Tela nova com as classes da tela velha soma as duas.** A segunda lista do
  radar (B8) reusa `.radar-item` e `.pill aperta` para ter o mesmo desenho, e
  o B6 passou a contar 11 onde havia 9. Cada lista ganhou `data-teste`, e os
  seletores dos dois portões são escopados. É a mesma armadilha do
  `.etapa-linha`, um bloco depois.
- **Fixture que não isola o caso mede outra coisa.** O B9 checava a faixa de
  "teste acabando", mas o B1 já tinha importado 55 pedidos e o limite do plano
  estourava antes — a faixa de limite tapava a de prazo, e o roteiro acusava
  falha onde o produto estava certo. Fixture existe para deixar **um** caso em
  pé por vez.
- **Estado de fixture lido uma vez só nunca muda.** O servidor de mentira
  calculava a assinatura na carga do módulo; os arquivos que o roteiro cria
  depois não tinham efeito nenhum, e três verificações falhavam sem defeito.
  Fixture regulável se relê a cada requisição.
- **`textContent` inclui `<script>`.** Bom para caçar vazamento (o payload
  chega ao navegador), ruim para conferir texto visível. Escolha conforme a
  pergunta: `innerText` para o que a pessoa lê, `textContent` para o que o
  navegador recebe.

## Limpeza

Os pedidos de teste ficam na base:

```sql
delete from pedidos where numero like 'T-9%';
```
