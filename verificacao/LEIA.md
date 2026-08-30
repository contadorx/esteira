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

## Limpeza

Os pedidos de teste ficam na base:

```sql
delete from pedidos where numero like 'T-9%';
```
