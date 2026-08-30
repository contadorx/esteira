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

## Deploy

Deploy contínuo: push na branch `main` (repositório conectado ao projeto `esteira`
na Vercel). Variáveis de ambiente na Vercel = as mesmas do `.env.example`.
Antes de caçar qualquer bug em produção: conferir se o commit no ar é o esperado
(regra 16 — já custou uma rodada inteira no FinanceiroX).

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

## O que está no ar hoje

Landing (`/`) apenas. Quadro, chão, página do pedido e radar entram pelos blocos
B1–B6 do roadmap do build. A landing não promete data nem preço — e não tem botão
de login porque login ainda não existe (nada de promessa sem entrega).
