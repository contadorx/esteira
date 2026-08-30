# Esteira

Acompanhamento de pedido para oficinas — do corte à entrega. App-satélite de ERP:
quadro por etapas (escritório), avanço em dois toques (celular do chão, sem senha)
e página pública do pedido (link no WhatsApp do cliente).

**Os documentos de produto, roadmap e regras vivem no projeto "Esteira" do Claude.**
Antes de codar, ler `05-regras-de-engenharia.md` (as 16 regras) e
`claude/09-roadmap-do-build.md` (blocos B0–B7 e portões).

## Estrutura (decisão D10 — um repo, um projeto Vercel, um host)

```
app/(site)/          esteira.app.br/          landing (no ar)
app/(escritorio)/app esteira.app.br/app       quadro, pedidos, config, radar  [B3+]
app/c/[token]/       esteira.app.br/c/…       celular do chão, sem senha      [B4]
app/p/[token]/       esteira.app.br/p/…       página pública do pedido        [B5]
lib/datas.ts         o ÚNICO "hoje" (America/Sao_Paulo)
lib/mensagem.ts      a porta única de mensagem (D2) — fase 1 é manual/copiar
lib/supabase/        clients — TODA chamada lê { error } (regra 1)
supabase/migrations/ todo SQL aplicado entra aqui NO MESMO DIA (regra 10)
supabase/seed.sql    massa de dev (3 oficinas, 50 pedidos) — NUNCA em produção com piloto
```

## Infra

- **Supabase:** projeto `esteira`, org Softaria, região `sa-east-1`, ref `llmumuazjcnvpdidndgq`.
  Exclusivo da Esteira — nada compartilhado com FinanceiroX/BPOx (D10).
- **Vercel:** projeto `esteira`, team ContadorX. Domínios: `esteira.app.br` (produto)
  e `esteiraapp.com.br` (redirect, futuro e-mail).
- **Auth (fase 1):** um usuário por oficina; `app_metadata.oficina_id` define o tenant
  (lido por `jwt_oficina()` nas policies de RLS). Chão e cliente NÃO têm login — rotas
  por token com função `security definer` (a trava é o banco, regra 11).

## Rodar local

```bash
npm install
cp .env.example .env.local   # e preencha as chaves (dashboard do Supabase → API keys)
npm run dev
```

## Variáveis de ambiente

Nada nesta aplicação fala com o Supabase pelo navegador — escritório, chão e
cliente final passam todos por Server Components e Server Actions. Logo o
prefixo `NEXT_PUBLIC_` **não é necessário**, e sem ele a chave pode ficar como
Secret na Vercel sem nunca chegar ao navegador.

| variável | para quê |
|---|---|
| `SUPABASE_URL` | endereço do projeto |
| `SUPABASE_ANON_KEY` | chave pública (protegida por RLS) |
| `SUPABASE_SECRET_KEY` | **obrigatória**: autocadastro, criar acesso de pessoa, foto do chão e webhook |
| `ASAAS_*` | cobrança — opcional; sem elas a tela diz que o pagamento não está ligado |
| `SITE_URL` | para onde o checkout volta |

Ligar a cobrança: `docs/ligar-a-cobranca.md`.

`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` continuam
aceitos. A resolução vive em `lib/ambiente.ts` — um lugar só, que apara aspas e
espaços colados e, quando não acha, **lista o que chegou ao processo** em vez de
dizer só "faltando".

**Na Vercel:** mudar variável não afeta implantação já criada. Salve e refaça o
deploy. Para conferir o que chegou de verdade, abra `/api/saude` — devolve
booleanos, o host e os nomes presentes, sem expor valor nenhum.

## Deploy

Deploy contínuo: push na branch `main` (repositório conectado ao projeto `esteira`
na Vercel). Variáveis de ambiente na Vercel = as mesmas do `.env.example`.
Antes de caçar qualquer bug em produção: conferir se o commit no ar é o esperado
(regra 16 — já custou uma rodada inteira no FinanceiroX).

## Antes do piloto

1. `supabase/limpeza-antes-do-piloto.sql` — apaga a massa de teste, o usuário
   de desenvolvimento (senha em texto claro no GitHub) e os tokens `dev-*`.
2. `npm run portoes` **contra o banco real** — as verificações nunca correram
   fora do ambiente de teste.
3. `supabase/nova-oficina.sql` para criar a oficina do piloto.
4. `docs/implantacao-do-piloto.md` — o roteiro da tarde na oficina.

## Conta, plano e cobrança (B9–B11)

A oficina nasce sozinha em `/criar-conta`: e-mail, senha, nome e setor, e as
etapas já vêm aplicadas. Nasce com **14 dias de teste**, sem cartão.

O tenant deixou de vir do `app_metadata` e passou a vir da tabela `membros`
(D20) — é o que permite mais de uma pessoa por oficina, papel (`dono` /
`escritorio`) e revogar acesso pela tela. `jwt_oficina()` lê de lá, então
mudar essa tabela muda a fronteira de isolamento de todas as outras.

**A trava do plano está no banco**, num gatilho de `pedidos` (regra 11):
teste vencido ou limite estourado recusam INSERT com a frase que a tela
repassa. E a régua está escrita: o que trava é **cadastrar pedido novo**;
mover pedido, radar, celular do chão e a página do cliente continuam. Nada é
apagado.

O provedor é o **Asaas** (Pix, boleto e cartão — quem paga escolhe). O preço
sai da tabela `planos` e vai para a assinatura: não existe preço cadastrado no
provedor, logo não existe divergência possível entre o que a landing mostra e
o que é cobrado.

O webhook é a única porta que escreve "está pago", e é a parte mais perigosa
do produto. **O Asaas não assina os eventos** — autentica com um token
estático no cabeçalho —, então o aviso não é acreditado: todo evento é
**conferido de volta na API do Asaas** antes de virar acesso. `npm run
portao:b11` bate nessa porta com token errado, token truncado, aviso "pago"
sobre cobrança pendente, cobrança inexistente e provedor fora do ar.
**Criar cliente, assinatura e fatura no Asaas de verdade nunca rodou** (não há
chave aqui); o roteiro da primeira execução real está em
`docs/ligar-a-cobranca.md`.

## A gaveta do pedido (B12)

`/app/pedido/<id>` responde "o que aconteceu com este pedido": o caminho, a
linha do tempo com quem moveu e quando, a foto do chão (por URL assinada), as
mensagens copiadas e o link do cliente. "Deu problema" aparece **marcado e
separado** do avanço — ele grava na mesma etapa, e desenhá-lo como avanço
contaria uma história que não aconteceu.

## A previsão aprendida (B8)

`/app/tempos` mede, do histórico da própria oficina, quanto cada etapa leva —
mediana, não média — e soma as etapas que faltam para dizer quando o pedido
chega. Enquanto uma etapa do caminho não tiver 3 medições, o pedido **não
ganha data**: somar mediana com chute produziria uma data na tela, e data na
tela é promessa (regra 2).

Numa oficina nova a tela diz "ainda não sei" — e é isso mesmo. Para ver o
desenho com dados, `supabase/seed-historico.sql` inventa 12 pedidos já
concluídos na oficina de desenvolvimento.

A conta em si se prova com `supabase/fumaca-tempos.sql`, contra o banco de
verdade, com as medianas conferidas na mão.

## Banco — como mudar o schema

1. Escrever a migration em `supabase/migrations/AAAAMMDD_nome.sql`.
2. Aplicar no banco (MCP do Supabase ou SQL Editor) **no mesmo dia**.
3. Fumaça em `BEGIN…ROLLBACK` que **chama** o que foi criado (função existir não basta).
4. RLS de policy nova se prova **usando o app com usuário de verdade** — o SQL Editor
   roda como `postgres` e atravessa a RLS (regra 11).

## Criar o usuário do escritório (uma vez por oficina, fase 1)

1. Dashboard → Authentication → Add user (e-mail + senha da oficina).
2. Amarrar o tenant (substitua o e-mail e o id da oficina):

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('oficina_id', '<uuid-da-oficina>')
where email = '<email-do-usuario>';
```

## O que está de pé hoje

| rota | o que é | bloco |
|---|---|---|
| `/` | landing, com preço e teste de 14 dias | B0/B11 |
| `/criar-conta` | **autocadastro** — a oficina nasce sozinha | B10 |
| `/entrar` | login do escritório | B1 |
| `/app` | **o quadro** — colunas por etapa, botões `‹ ›` e arrasto | B3 |
| `/app/pedidos` | a lista completa, com KPIs e cor por prazo | B1 |
| `/app/novo` | cadastro manual | B1 |
| `/app/importar` | import de CSV com relatório linha a linha | B1 |
| `/app/radar` | **o radar de atraso** — a função que vende | B6 |
| `/app/tempos` | **tempos e previsão** — o que cada etapa leva nesta oficina | B8 |
| `/app/pedido/<id>` | **a gaveta do pedido** — linha do tempo, foto, avisos | B12 |
| `/app/conta` | plano, uso, pessoas e senha (só o dono) | B9/B11 |
| `/api/cobranca/webhook` | a única porta que escreve “está pago” | B11 |
| `/app/etapas` | etapas por tipo de pedido e packs de setor | B2 |
| `/app/acessos` | links do chão: criar, copiar, PIN, revogar | B4 |
| `/c/<token>` | **o celular do chão** — sem senha, dois toques | B4 |
| `/p/<token>` | **a página do cliente final** — sem app, sem senha | B5 |
| `/api/saude` | diagnóstico de ambiente e conectividade | — |

O MVP está de pé: B0 a B6 entregues, todos com portão batido. A fase 2 começou
pelo B8 — a **previsão aprendida do histórico**. A landing não promete
data nem preço, e só ganhou o link "Entrar" (topo, à direita) quando o login
passou a existir.

**Foto no avanço do chão** exige `SUPABASE_SECRET_KEY` configurada: o upload vai
pelo service role, depois de a função do banco validar o token. Sem a chave, o
controle de foto simplesmente não aparece — em vez de aparecer e falhar calado.
O bucket `avancos` é privado; exibir a foto no escritório pede URL assinada, e
isso entra com a gaveta do pedido.

**Mover pedido tem dois caminhos, de propósito:** os botões `‹ ›` funcionam em
toque, teclado e leitor de tela — é o caminho garantido; o arrasto pela alça é
o acelerador de quem está no mouse. O arrasto usa Pointer Events (mouse, caneta
e dedo no mesmo código), não o drag-and-drop nativo, que não existe em toque.

## Rodar a verificação (o portão do bloco)

```bash
npm run build && npm run start
npm i -D playwright && npx playwright install chromium
npm run portao:b1     # entrada de pedidos
npm run portao:b2     # etapas e packs
npm run portao:b3     # o quadro
npm run portao:b4     # o celular do chão
npm run portao:b5     # a página do cliente e o aviso
npm run portao:b6     # o radar de atraso
npm run portao:b8     # a previsão aprendida (fase 2)
npm run portao:b9     # conta, plano, pessoas e autocadastro
npm run portao:b11    # a cobrança (webhook: token forjado, aviso mentiroso)
npm run portao:b12    # a gaveta do pedido
npm run varredura     # as 16 regras, item a item
npm run portoes       # varredura + todos os portões, em sequência
```

Os portões **mudam a base** (o B1 importa 55 pedidos, o B3 move cartões). Rodar
`npm run portoes` supõe base limpa no começo; encadeado numa base já usada, o
que falha é o roteiro, não o produto.

Detalhes e o que o roteiro NÃO prova: `verificacao/LEIA.md`.

## Usuário de desenvolvimento

`supabase/seed-auth-dev.sql` cria `saojorge@esteira.dev` / `esteira123`, amarrado
à Marmoraria São Jorge. Só para desenvolvimento — para uma oficina real, crie
pelo Dashboard e rode o `update` comentado no fim daquele arquivo.
