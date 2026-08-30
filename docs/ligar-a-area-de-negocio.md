# Ligar a área de negócio

`/negocio` já está no ar, mas **ninguém entra** até a sua conta ser posta na
tabela `equipe`. É de propósito: a trava é o banco, não a tela (regra 11).

## 1. Crie a sua conta de operador

Se você ainda não tem login na Esteira, crie um pelo autocadastro normal
(`/criar-conta`). A conta pode ser de uma oficina de mentira — o acesso ao
negócio **não depende** de oficina nenhuma (D31).

## 2. Ponha-se na equipe

No SQL Editor do Supabase:

```sql
insert into equipe (user_id, email)
select id, email from auth.users where email = 'SEU-EMAIL-AQUI'
on conflict (user_id) do nothing;

-- confira:
select e.email, e.criado_em from equipe e;
```

Saia e entre de novo no aplicativo, e `/negocio` abre.

## 3. Prove a trava com um usuário de verdade (regra 11)

Isto **não** é opcional, e não dá para provar no SQL Editor — lá tudo roda como
`postgres` e atravessa qualquer política:

1. abra uma janela anônima;
2. entre com uma conta que **não** está em `equipe` (a de uma oficina piloto serve);
3. vá em `/negocio` — tem que aparecer **"Área restrita"**, sem menu lateral e
   sem nenhum número;
4. vá direto em `/negocio/faturas` — mesma coisa.

Se qualquer um dos dois mostrar dado, **pare tudo**: a função
`painel_negocio()` está devolvendo conteúdo para quem não deveria.

## 4. O que a área mostra — e o que ela não faz

| tela | para quê |
|---|---|
| `/negocio` | MRR, caixa, a métrica nº 1 e a **fila de quem ligar hoje** |
| `/negocio/oficinas` | a lista, e o cartão de contexto que se abre quando o telefone toca |
| `/negocio/faturas` | o extrato: o que entrou, o que está em aberto, o que venceu |

**A área de negócio lê; ela não escreve dentro da oficina.** Não existe botão
de editar pedido nem de entrar na conta alheia. Entrar na conta de um cliente é
impersonação auditada, e ela ficou no B17 de propósito: com poucos clientes o
telefone resolve, e a auditoria precisa gravar **antes** da entrada para valer
alguma coisa.

## 5. Por que o painel vai mostrar quase tudo zerado

Porque a base é pequena. Isso está escrito na própria tela — e é diferente de
falha: quando uma consulta morre, o painel **não** mostra R$ 0; ele diz que não
conseguiu ler. Se você vir zeros sem aviso, são zeros de verdade.
