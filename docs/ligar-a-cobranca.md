# Ligar a cobrança — o roteiro (Asaas)

O produto **funciona inteiro sem isto**. Enquanto a cobrança está desligada, a
tela de conta diz com todas as letras que o pagamento automático não está
ligado e manda falar com o suporte — em vez de mostrar um botão que sempre
falha. Este documento é o que falta para o botão existir.

> **O que já está provado e o que não está.** A parte perigosa — o webhook,
> única porta que escreve "está pago" — é verificada pelo `npm run portao:b11`,
> com token errado, token truncado, aviso forjado, cobrança inexistente e
> provedor fora do ar. **Criar cliente, criar assinatura e abrir a fatura no
> Asaas de verdade nunca foi executado**: não há chave no ambiente de
> desenvolvimento. Os passos 4 e 5 abaixo são a primeira execução real.

## Por que Asaas e não Stripe

Quem paga é dono de oficina no Brasil. Pix e boleto não são alternativa
secundária aqui — são o caminho principal. O Asaas é nativo nisso, a taxa por
transação é menor, e a conta se abre com CNPJ brasileiro sem intermediário.

A troca custou **três arquivos** (`lib/cobranca.ts`, `lib/cobranca-eventos.ts`
e a rota do webhook), porque a porta de pagamento é única desde o começo
(D24). Nenhuma tela precisou saber o nome do provedor.

## 1. Conta e chave

1. Crie a conta no Asaas e conclua a verificação da empresa.
2. Pegue a **chave de API**: Configurações → Integrações → API.
   - Sandbox: começa com `$aact_hmlg_`
   - Produção: começa com `$aact_prod_`
3. Ensaie tudo no **sandbox** primeiro (`https://api-sandbox.asaas.com/v3`).
   Lá dá para marcar cobranças como pagas na mão e ver o webhook chegar.

**Não há produto nem preço para cadastrar no Asaas.** A assinatura é criada
com o valor que a Esteira manda, vindo da tabela `planos`. Ou seja: o preço
tem **uma** fonte, e não existe divergência possível entre o que a landing
mostra e o que é cobrado. Para mudar de preço, mude em `planos` — e lembre
que quem já assinou continua no valor antigo até refazer a assinatura.

## 2. Variáveis no servidor

Na Vercel, projeto `esteira`, ambiente de produção:

```
ASAAS_API_KEY=$aact_prod_…
ASAAS_URL=https://api.asaas.com/v3          (sandbox: https://api-sandbox.asaas.com/v3)
ASAAS_WEBHOOK_TOKEN=<um segredo longo e aleatório, criado por você>
SITE_URL=https://esteira.app.br
```

O `ASAAS_WEBHOOK_TOKEN` **você inventa** — não é uma chave do Asaas. Gere algo
como:

```bash
openssl rand -hex 32
```

**Nunca use a chave de API como token do webhook.** A própria documentação do
Asaas avisa isso, e o motivo é direto: o token viaja em todo aviso e vai parar
em log de servidor.

**Mudar variável não afeta implantação já criada.** Salve e refaça o deploy.

## 3. Webhook

1. Asaas → Configurações → Integrações → **Webhooks** → novo.
2. Endereço: `https://esteira.app.br/api/cobranca/webhook`.
3. **Token de autenticação:** o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.
4. Eventos (só estes; o produto ignora o resto e responde dizendo que ignorou):
   - `PAYMENT_CONFIRMED`
   - `PAYMENT_RECEIVED`
   - `PAYMENT_OVERDUE`
   - `PAYMENT_REFUNDED`
   - `PAYMENT_CHARGEBACK_REQUESTED`
   - `SUBSCRIPTION_DELETED`
   - `SUBSCRIPTION_INACTIVATED`

### Uma diferença de segurança que vale entender

A Stripe **assinava** cada evento: dava para provar, só com o corpo e o
segredo, que aquilo veio dela e não tinha sido mexido. **O Asaas não assina.**
Ele manda um token estático no cabeçalho `asaas-access-token`. Se esse token
vazar — um log, um print, um `curl` colado num grupo —, qualquer pessoa fabrica
"fulano pagou", para sempre, e não há janela de tempo que impeça.

Por isso a Esteira **não acredita no aviso**. Todo evento é conferido de volta
na API do Asaas, autenticado, antes de virar acesso:

1. confere o token — quem não tem, nem entra;
2. lê o evento só para saber **o que ir olhar**;
3. **pergunta ao Asaas** qual é o estado real daquela cobrança;
4. grava o que a API respondeu — nunca o que o POST afirmou.

Um aviso forjado, no máximo, faz o servidor perguntar e ouvir "não existe" ou
"está pendente". É o teste nº 4 do portão B11.

## 4. Conferir a fechadura antes de abrir a loja

```bash
export ASAAS_WEBHOOK_TOKEN=<o mesmo do servidor>
npm run build && npm run start
npm run portao:b11
```

Quinze verificações. Rodar contra produção exige apontar `BASE` para lá — e o
token tem que ser o de produção.

## 5. A primeira compra de verdade (sandbox)

Com a chave `$aact_hmlg_` e `ASAAS_URL` de sandbox:

1. Crie uma conta nova em `/criar-conta`.
2. Em `/app/conta`, escolha o plano Médio, preencha um CPF/CNPJ válido de
   teste e clique **Assinar e pagar**.
3. Você cai na fatura do Asaas. Escolha Pix ou boleto.
4. No painel do Asaas (sandbox), marque a cobrança como **recebida em
   dinheiro** — é o jeito de simular o pagamento.
5. Volte para `/app/conta`: o cartão do plano tem que dizer **Médio · ativa**,
   com a data do fim do período.
6. Confira no banco que quem gravou foi o webhook:

```sql
select oficina_id, plano, status, periodo_ate, provedor,
       provedor_cliente, provedor_assinatura, atualizado_em
  from assinaturas order by atualizado_em desc limit 5;
```

Se `status` continuar `teste`, o aviso não chegou ou não passou na
conferência: veja a aba de webhooks do Asaas (ela mostra a resposta do seu
endereço) e o log da função na Vercel — a rota escreve o motivo em toda
recusa.

## 6. Cancelamento e troca de plano

Não há portal do cliente no Asaas como havia na Stripe. Está tudo na tela de
conta:

- **Ver a cobrança em aberto** abre a fatura atual (Pix, boleto ou cartão).
- **Cancelar assinatura** remove a assinatura no Asaas — para de gerar
  cobrança nova, e **não tira o acesso na hora**: `periodo_ate` continua
  valendo. Quem cancela no dia 2 pagou até o fim do período; travar na hora
  seria ficar com o dinheiro e tirar o serviço.
- **Trocar de plano** encerra a assinatura atual e cria a nova. Se o
  encerramento falhar, nada muda e a tela diz isso — ninguém fica com duas
  assinaturas cobrando.

## O que fazer quando alguém não paga

Nada, no automático — de propósito. O webhook marca a assinatura como
`vencida`, e a régua já escrita é: **o cliente não consegue cadastrar pedido
novo, e todo o resto continua funcionando** (mover pedido, radar, celular do
chão, página do cliente final). Nada é apagado. Cobrar é conversa, não
interruptor.
