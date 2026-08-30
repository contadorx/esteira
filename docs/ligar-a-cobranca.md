# Ligar a cobrança — o roteiro

O produto **funciona inteiro sem isto**. Enquanto a cobrança está desligada, a
tela de conta diz com todas as letras que o pagamento automático não está
ligado e manda falar com o suporte — em vez de mostrar um botão que sempre
falha. Este documento é o que falta para o botão existir.

> **O que já está provado e o que não está.** A parte perigosa — a conferência
> da assinatura do webhook, que é a única porta que escreve "está pago" — é
> verificada pelo `npm run portao:b11`, com assinatura forjada, corpo
> adulterado e relógio fora da janela. **Criar a sessão de checkout e o portal
> do cliente fala com a Stripe de verdade e nunca foi executado** — não há
> chave no ambiente de desenvolvimento. Os passos 5 e 6 abaixo são a primeira
> execução real, e é por isso que eles existem escritos.

## 1. Conta e produtos

1. Crie a conta na Stripe e ative os pagamentos do Brasil (cartão e Pix).
2. Crie **um produto por plano**, cada um com um preço **recorrente mensal em
   BRL**, exatamente nos valores da tabela `planos`:

   | plano | preço | limite de pedidos em andamento |
   |---|---|---|
   | Base | R$ 89 | 60 |
   | Médio | R$ 139 | 150 |
   | Grande | R$ 189 | 400 |

3. Copie o **price id** de cada um (começa com `price_`).

> Se você mudar um preço, mude **nos dois lugares**: na Stripe e na tabela
> `planos`. O portão B9 compara o preço da landing com o da tela de conta e
> reprova a divergência — mas ele não enxerga dentro da Stripe.

## 2. Variáveis no servidor

Na Vercel, projeto `esteira`, ambiente de produção:

```
STRIPE_SECRET_KEY=sk_live_…        (ou sk_test_… para ensaiar)
STRIPE_PRECO_BASE=price_…
STRIPE_PRECO_MEDIO=price_…
STRIPE_PRECO_GRANDE=price_…
SITE_URL=https://esteira.app.br
```

`STRIPE_WEBHOOK_SECRET` vem no passo 3.

**Mudar variável não afeta implantação já criada.** Salve e refaça o deploy.

## 3. Webhook

1. Stripe → Developers → Webhooks → **Add endpoint**.
2. Endereço: `https://esteira.app.br/api/cobranca/webhook`.
3. Eventos a enviar (só estes; o produto ignora o resto e diz que ignorou):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copie o **signing secret** (`whsec_…`) para `STRIPE_WEBHOOK_SECRET` e
   refaça o deploy.

## 4. Conferir a fechadura antes de abrir a loja

```bash
export STRIPE_WEBHOOK_SECRET=<o mesmo do servidor>
npm run build && npm run start
npm run portao:b11
```

Onze verificações. Elas provam que um POST forjado **não** vira assinatura
ativa. Rodar isto contra o servidor de produção exige apontar `BASE` para ele
— e aí o segredo tem que ser o de produção.

## 5. A primeira compra de verdade (modo teste)

Com `sk_test_` e os price ids de teste:

1. Crie uma conta nova em `/criar-conta`.
2. Em `/app/conta`, clique **Assinar** no plano Médio.
3. Pague com o cartão de teste `4242 4242 4242 4242`.
4. Volte para `/app/conta` e confira: o cartão do plano tem que dizer
   **Médio · ativa**, com a data do próximo período.
5. Confira no banco que quem gravou foi o webhook:

```sql
select oficina_id, plano, status, periodo_ate, provedor, provedor_cliente,
       provedor_assinatura, atualizado_em
  from assinaturas order by atualizado_em desc limit 5;
```

Se `status` continuar `teste`, o webhook não chegou: veja a aba de eventos na
Stripe (ela mostra a resposta do seu endereço) e o log da função na Vercel.

## 6. O portal do cliente

Stripe → Settings → Billing → **Customer portal**: ative, permita trocar
cartão, ver faturas e cancelar. Sem isso, o botão "Trocar cartão, ver faturas
ou cancelar" existe e a Stripe recusa.

## O que fazer quando alguém não paga

Nada, no automático — de propósito. O webhook marca a assinatura como
`vencida`, e a régua já escrita é: **o cliente não consegue cadastrar pedido
novo, e todo o resto continua funcionando** (mover pedido, radar, celular do
chão, página do cliente final). Nada é apagado. Cobrar é conversa, não
interruptor.
