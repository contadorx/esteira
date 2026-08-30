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
- **`textContent` inclui `<script>`.** Bom para caçar vazamento (o payload
  chega ao navegador), ruim para conferir texto visível. Escolha conforme a
  pergunta: `innerText` para o que a pessoa lê, `textContent` para o que o
  navegador recebe.

## Limpeza

Os pedidos de teste ficam na base:

```sql
delete from pedidos where numero like 'T-9%';
```
