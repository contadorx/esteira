# Esteira — contrato de trabalho deste repositório

Leia antes de escrever a primeira linha. Este arquivo é a memória do projeto: o que
o produto é, o que ele nunca será, as regras que já foram pagas caro e as decisões
que estão tomadas. Os documentos completos vivem no projeto "Esteira" do Claude
(`02-produto`, `03-roadmap`, `04-arquitetura-e-decisoes`, `05-regras-de-engenharia`,
`07-estado-do-projeto`, `09-roadmap-do-build`).

## O que é

A Esteira mostra em que etapa está cada pedido de uma oficina, avisa o cliente
final e alerta o dono **antes** do prazo estourar. App-satélite de ERP para
negócios em que o pedido leva de 2 dias a 6 semanas e passa por 3+ etapas:
marmoraria, vidraçaria, gráfica, esquadria, marcenaria, confecção, oficina
mecânica, assistência técnica.

**Três telas e só três:** o quadro (escritório), o celular do chão (produção,
sem senha), a página do pedido (cliente final, pública). Mais o radar de atraso.

## A fronteira — releia antes de aceitar qualquer feature

Acompanhamento, **não** planejamento. Não é PCP (não planeja capacidade, não
sequencia máquina, não calcula lote nem tempo padrão), não é ERP, não é CRM.
Não guarda cadastro, preço nem estoque. Não conversa com o cliente final — **avisa**.

Pedido que atravessa essa fronteira: **não implemente**. Lembre a fronteira e
registre em `docs/pedidos-recusados.md` (data, quem pediu, o quê). Três pedidos
iguais viram informação de produto, não implementação imediata.

## A métrica que decide o produto

**≥ 70% dos avanços de etapa feitos pelo chão de fábrica, no celular.** Se quem
atualiza for o escritório, a premissa está errada. Toda decisão de UX passa por
aqui. É por isso que `avancos.quem` guarda `chao:<acesso_id>` ou
`escritorio:<user_id>` — a métrica se mede desde o primeiro avanço gravado.

## As 16 regras (o resumo; a íntegra está no `05`)

1. **Falha silenciosa é o pecado capital.** `supabase-js` não lança exceção —
   devolve `{ data, error }`. Toda escrita e todo envio leem o erro. Estados
   honestos (`copiado | enviado | falhou | nao_confirmado`), nunca um booleano.
   Função de banco levanta exceção; devolver `{ok:false}` reintroduz o problema.
2. **Nunca afirme o que não apurou.** Sem evidência, não diga "avisado",
   "entregue" nem "cliente viu". Diga o que se prova: "mensagem copiada às 14h22".
3. **Zero antes da resposta não é zero.** Precisa existir o estado "ainda não
   perguntei", distinto de vazio. Consulta que falha nunca vira `?? []`.
4. **Dois números na mesma tela nascem juntos.** Contagem e lista saem da mesma
   consulta; a função recebe os números crus, não a diferença pronta.
5. **Cor é situação.** Verde/âmbar/vermelho = prazo, só. Aço = ação. Laranja =
   marca. Nunca só cor: pill com texto ou ícone junto. Sem ternário que não decide.
6. **Componente definido dentro do render remonta a cada tecla.** Suba para o
   escopo do módulo. Carga assíncrona não sobrescreve o que a pessoa digita.
7. **Seleção que sobrevive a recarga envelhece.** A trava do "já feito" vai no
   `where` do update, no banco — não na tela.
8. **Data é armadilha.** Um só "hoje", em `America/Sao_Paulo`, dentro de
   `lib/datas.ts`. Nada de `new Date("2026-08-13")`. Validação confere calendário,
   não formato (31/02 passa em qualquer regex).
9. **Verificação que não abre a tela não verifica.** `tsc` e `next build` aprovam
   bug com naturalidade. Abra com massa e **meça** — foto só serve para o que muda
   de rodada em rodada.
10. **Migration no repositório não é migration no banco.** SQL aplicado entra em
    `supabase/migrations/` no mesmo dia. Função nova precisa de fumaça em
    `BEGIN…ROLLBACK` que a **chame**.
11. **Trava na tela não é trava.** A trava real é RLS, FK ou `security definer`.
    Policy só se prova **usando o app com um usuário de verdade** — o SQL Editor
    roda como `postgres` e atravessa a RLS.
12. **Compensação repetida vai faltar no próximo.** Dois consumidores fazendo o
    mesmo ajuste: o ajuste pertence ao componente.
13. **O conserto pode ser pior que o bug.** Antes de dar por pronto: o que
    acontece se a segunda metade falhar?
14. **Sucesso parcial precisa de porta própria.** "Não voltou" e "voltou pela
    metade" não saem pelo mesmo canal.
15. **Varredura mecânica erra em silêncio.** Inclusive a ferramenta que previne.
16. **Higiene:** nunca `prettier` sem config; nunca `build` com o dev server vivo
    na mesma pasta; conferir o commit que está no ar antes de caçar bug.

## Decisões tomadas (não reabrir sem escrever o motivo)

- **D1** Acesso do chão **sem senha**: link fixo ou PIN de 4 dígitos, revogável e
  escopado a uma oficina e um posto. Nada sensível nessa tela.
- **D2** Uma porta só para mensagem: `enviarMensagem({ para, remetente, tipo, dados })`,
  `tipo` é template nomeado, nunca texto solto. `remetente` existe desde a 1ª linha.
- **D3** Canal oficial (Meta Cloud API) a partir do 1º pagante; Evolution só como
  risco assumido por escrito.
- **D4** O produto não morre se o WhatsApp cair — degradação escrita.
- **D5** Sem conector de ERP no MVP: CSV e cadastro manual.
- **D6** Etapas configuráveis por oficina, com packs por setor.
- **D7** Multi-tenant desde a primeira tabela: `oficina_id` em tudo, RLS ligada,
  policies versionadas junto.
- **D8** Sem app nativo. Web em tudo.
- **D9** Radar entra no MVP como **consulta** + "copiar radar"; envio automático na fase 2.
- **D10** Site e app no mesmo repositório e projeto Vercel, um host.
- **D11** `acessos` é tabela própria — mecanismo do D1.

Decisão nova entra como D12, D13… com data e motivo, no `04`. Decisão revogada
não se apaga: ganha a linha "revogada em <data> porque <motivo>".

## Rotas (D10)

```
/                 landing (público)
/entrar           login do escritório
/app              escritório (sessão obrigatória) — B1: lista; B3: vira o quadro
/app/novo         cadastro manual de pedido
/app/importar     import de CSV
/c/<token>        celular do chão — sem senha              [B4]
/p/<token>        página pública do pedido                 [B5]
```

## Onde as coisas moram

- `lib/datas.ts` — o **único** "hoje" e a única fonte de situação de prazo.
- `lib/mensagem.ts` — a porta única (D2). Na fase 1 não existe envio automático:
  `enviarMensagem()` **levanta exceção de propósito**; use `renderizarTexto()` +
  `linkWa()` e registre o aviso com status `copiado`.
- `lib/supabase/server.ts` — cliente do servidor (respeita RLS, sessão por cookie)
  e o admin (service role, só onde for inevitável).
- `lib/csv.ts` — parser tolerante e normalização de data.
- `supabase/migrations/` — todo SQL aplicado, no mesmo dia.
- `supabase/seed.sql` — massa de dev. **Nunca rodar em produção com piloto.**

## Infra

- Supabase `esteira` (org Softaria, `sa-east-1`, ref `llmumuazjcnvpdidndgq`).
- Vercel: projeto próprio; produção hoje em `esteira-three.vercel.app`,
  domínio final `esteira.app.br`.
- Auth fase 1: **um usuário por oficina**; o tenant vem de
  `app_metadata.oficina_id`, lido pelas policies via `jwt_oficina()`.
  Multiusuário com senha e permissões finas estão **fora** do MVP.

## Blocos e portões (o `09` tem a íntegra)

| bloco | entrega | portão de saída |
|---|---|---|
| B0 | fundação, banco, landing | migrations no repo E no banco · RLS 6/6 · domínio no ar |
| B1 | entrada de pedidos | CSV de 60 com 5 defeituosas → 55 entram, 5 voltam com linha e motivo |
| B2 | etapas + packs | oficina nova configurada em < 30 min cronometrados |
| B3 | o quadro | soma dos cartões = contador da coluna = KPI, medido com massa |
| B4 | celular do chão | dois avanços simultâneos: um ganha, o outro recebe estado honesto |
| B5 | página do cliente | a tela nunca diz "avisado" — diz "copiado às 14h22" |
| B6 | radar-consulta | lista exatamente o que a conta manda listar |
| B7 | site + endurecimento | as 16 regras percorridas com resultado escrito por item |

**Bloco fecha pelo portão, nunca pelo calendário.**

## Como trabalhar comigo aqui

- Português do Brasil, direto. Honestidade acima de simpatia.
- Toda afirmação técnica precisa de endereço: `arquivo:linha`, nome da função,
  ou "não conferi".
- Número do mundo real se checa, não se lembra.
- Recomende uma opção e diga qual ficou em segundo, e por quê.
- Ao fim de cada sessão relevante, proponha a atualização do `07-estado-do-projeto`.
