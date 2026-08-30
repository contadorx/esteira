"use client";

/**
 * A tela da conta (B9/B11).
 *
 * O que ela precisa dizer sem rodeio, porque é dinheiro e é acesso:
 *  1. **Em que pé está o plano** — e quando ele acaba, em dias, não em jargão.
 *  2. **O que acontece quando acabar**: os pedidos continuam lá, o chão
 *     continua avançando; o que para é criar pedido novo. Uma pessoa que não
 *     sabe disso paga por medo, e isso é um jeito ruim de vender.
 *  3. **Quando o pagamento automático não está ligado**, a tela diz isso e
 *     manda falar com o suporte — em vez de mostrar um botão que sempre
 *     falha (regra 2: nada de afirmar o que não se apurou).
 */

import { useActionState, useState, useTransition } from "react";
import { curtaBR } from "@/lib/datas";
import {
  abrirFatura,
  assinarPlano,
  cancelarMinhaAssinatura,
  convidarPessoa,
  mudarAtivoDoMembro,
  trocarMinhaSenha,
} from "./acoes";
import { CONTA_OCIOSA, emReais } from "./tipos";
import type { Membro, Plano, RespostaConta, ResultadoConta } from "./tipos";

const ROTULO_STATUS: Record<string, string> = {
  teste: "em teste",
  ativa: "ativa",
  vencida: "pagamento pendente",
  cancelada: "cancelada",
};

/**
 * A cor do cartão do plano é situação de PRAZO — os mesmos três estados do
 * resto do produto (regra 5). Faltando 2 dias ou menos, âmbar; acabado,
 * vermelho. Não existe "verde porque pagou": verde aqui é "tem folga".
 */
function situacaoDoPlano(conta: RespostaConta): "ok" | "aperta" | "estourou" {
  if (conta.status === "vencida" || conta.status === "cancelada") return "estourou";
  const d = conta.dias_restantes;
  if (d === null || d === undefined) return "ok";
  if (d < 0) return "estourou";
  if (d <= 2) return "aperta";
  return "ok";
}

function Recado({ r }: { r: ResultadoConta }) {
  if (r.estado === "ocioso" || !r.mensagem) return null;
  const classe =
    r.estado === "ok" ? "aviso-ok" : r.estado === "parcial" ? "aviso-parcial" : "alerta";
  return (
    <p className={classe} role="status">
      {r.mensagem}
    </p>
  );
}

export default function PainelConta({
  conta,
  oficina,
  ehDono,
  meuId,
  membros,
  erroMembros,
  planos,
  erroPlanos,
  cobrancaLigada,
}: {
  conta: RespostaConta;
  oficina: string | null;
  ehDono: boolean;
  meuId: string | null;
  membros: Membro[];
  erroMembros: string | null;
  planos: Plano[];
  erroPlanos: string | null;
  cobrancaLigada: boolean;
}) {
  const [resConvite, acaoConvite, convidando] = useActionState(convidarPessoa, CONTA_OCIOSA);
  const [resSenha, acaoSenha, trocando] = useActionState(trocarMinhaSenha, CONTA_OCIOSA);
  const [resAssinar, acaoAssinar, assinando] = useActionState(assinarPlano, CONTA_OCIOSA);
  const [recado, setRecado] = useState<ResultadoConta>(CONTA_OCIOSA);
  const [pendente, iniciar] = useTransition();

  const situacao = situacaoDoPlano(conta);
  const pagos = planos.filter((p) => p.codigo !== "teste");
  const usoPct =
    conta.limite && conta.limite > 0
      ? Math.min(100, Math.round(((conta.pedidos_ativos ?? 0) / conta.limite) * 100))
      : null;

  const acionar = (fn: () => Promise<ResultadoConta>) =>
    iniciar(async () => setRecado(await fn()));

  return (
    <div className="wrap-app estreito">
      <div className="app-cab">
        <div>
          <h1>Conta</h1>
          <p className="ajuda">{oficina ?? "esta oficina"}</p>
        </div>
      </div>

      <Recado r={recado} />

      {conta.estado !== "ok" ? (
        <div className="falha" role="alert">
          <b>Esta oficina está sem assinatura.</b>
          <p>
            Isso não deveria acontecer — quer dizer que o cadastro parou no
            meio. Fale com o suporte antes de cadastrar pedidos.
          </p>
        </div>
      ) : (
        <section className={`plano-cartao ${situacao}`}>
          <div className="plano-topo">
            <div>
              <div className="plano-nome">{conta.plano_nome}</div>
              <div className="plano-preco">
                {conta.preco_centavos ? `${emReais(conta.preco_centavos)}/mês` : "sem custo"}
              </div>
            </div>
            <span className={`pill ${situacao}`}>
              {ROTULO_STATUS[conta.status ?? ""] ?? conta.status}
            </span>
          </div>

          <p className="plano-prazo">
            {conta.ate ? (
              conta.dias_restantes !== null && conta.dias_restantes !== undefined ? (
                conta.dias_restantes < 0 ? (
                  <>
                    Terminou em <b>{curtaBR(conta.ate)}</b>.
                  </>
                ) : conta.dias_restantes === 0 ? (
                  <>
                    Termina <b>hoje</b>.
                  </>
                ) : (
                  <>
                    Faltam <b>{conta.dias_restantes} dia{conta.dias_restantes > 1 ? "s" : ""}</b> —
                    até {curtaBR(conta.ate)}.
                  </>
                )
              ) : null
            ) : (
              <>Sem data de término registrada.</>
            )}
          </p>

          {/* Regra 4: o número do uso e a barra saem da mesma consulta. */}
          {conta.limite !== null && conta.limite !== undefined && (
            <div className="plano-uso">
              <div className="plano-uso-linha">
                <span>
                  <b>{conta.pedidos_ativos}</b> de {conta.limite} pedidos em andamento
                </span>
                <span className="obs">{usoPct}%</span>
              </div>
              <div className="barra" aria-hidden="true">
                <i style={{ width: `${usoPct ?? 0}%` }} />
              </div>
              <p className="obs">
                Conta só o que ainda não chegou na última etapa. Pedido entregue
                não ocupa lugar.
              </p>
            </div>
          )}

          {conta.pode_criar === false && conta.motivo && (
            <p className="plano-travado" role="status">
              <b>Não dá para cadastrar pedido novo:</b> {conta.motivo}. Tudo o
              mais continua funcionando — o quadro, o radar, o celular do chão e
              a página dos seus clientes. Nada foi apagado.
            </p>
          )}
        </section>
      )}

      {ehDono && (
        <section className="conta-bloco">
          <h2>Plano</h2>
          {erroPlanos && (
            <p className="alerta" role="alert">
              Não consegui ler os planos ({erroPlanos}).
            </p>
          )}

          {!cobrancaLigada ? (
            /* A frase honesta no lugar do botão que não funcionaria. */
            <p className="conta-nota">
              O pagamento por aqui <b>ainda não está ligado</b> neste servidor.
              Para assinar ou trocar de plano, fale com o suporte — sua conta
              continua funcionando normalmente enquanto isso.
            </p>
          ) : (
            <>
              {/*
                Um formulário só, com os planos como opção: o Asaas exige
                CPF/CNPJ para criar o cadastro de cobrança, e pedir isso numa
                segunda tela depois de clicar "Assinar" é o jeito conhecido de
                perder a pessoa no meio.
              */}
              <form className="form" action={acaoAssinar}>
                <div className="planos-grade">
                  {pagos.map((p) => (
                    <label
                      key={p.codigo}
                      className={`plano-opcao${p.codigo === conta.plano ? " atual" : ""}`}
                    >
                      <input
                        type="radio"
                        name="plano"
                        value={p.codigo}
                        defaultChecked={p.codigo === (conta.plano === "teste" ? "medio" : conta.plano)}
                      />
                      <div className="plano-opcao-nome">{p.nome}</div>
                      <div className="plano-opcao-preco">
                        {emReais(p.preco_centavos)}
                        <span>/mês</span>
                      </div>
                      <div className="obs">
                        até {p.limite_pedidos_ativos ?? "—"} pedidos em andamento
                      </div>
                      {p.codigo === conta.plano && conta.status === "ativa" && (
                        <div className="plano-opcao-atual">plano atual</div>
                      )}
                    </label>
                  ))}
                </div>

                {/*
                  O nome vem primeiro e a observação fica FORA do par: dentro
                  de um `.dupla`, o texto de ajuda empurrava só o campo do
                  lado e os dois deixavam de alinhar.
                */}
                <div className="dupla">
                  <div className="campo">
                    <label htmlFor="nome">Nome na cobrança</label>
                    <input id="nome" name="nome" defaultValue={oficina ?? ""} />
                  </div>
                  <div className="campo">
                    <label htmlFor="documento">CPF ou CNPJ de quem paga *</label>
                    <input
                      id="documento"
                      name="documento"
                      required
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                </div>
                <p className="obs">
                  O CPF/CNPJ vai direto para o Asaas, que emite a cobrança. A
                  Esteira não guarda esse número.
                </p>

                <Recado r={resAssinar} />

                <button className="btn btn-aco" type="submit" disabled={assinando}>
                  {assinando
                    ? "Abrindo o pagamento…"
                    : conta.tem_assinatura
                      ? "Trocar de plano"
                      : "Assinar e pagar"}
                </button>
                <p className="obs">
                  Você escolhe <b>Pix, boleto ou cartão</b> na tela de pagamento.
                  Usuários ilimitados em qualquer plano; mensal, sem fidelidade.
                </p>
              </form>

              {conta.tem_assinatura && (
                <div className="form-acoes conta-acoes-assinatura">
                  <button
                    className="btn btn-borda"
                    disabled={pendente}
                    onClick={() => acionar(abrirFatura)}
                  >
                    Ver a cobrança em aberto
                  </button>
                  <button
                    className="btn btn-borda"
                    disabled={pendente}
                    onClick={() => acionar(cancelarMinhaAssinatura)}
                  >
                    Cancelar assinatura
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {ehDono && (
        <section className="conta-bloco">
          <h2>Quem entra nesta oficina</h2>
          <p className="ajuda">
            Usuários ilimitados. O chão de fábrica <b>não</b> precisa de conta —
            ele entra pelo link em <a href="/app/acessos">Acessos</a>.
          </p>

          {erroMembros ? (
            <p className="alerta" role="alert">
              Não consegui ler as pessoas ({erroMembros}). A lista abaixo não
              está vazia — ela não foi lida.
            </p>
          ) : (
            <div className="tabela-rolo">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>E-mail de acesso</th>
                    <th>Papel</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {membros.map((m) => (
                    <tr key={m.id} data-teste="linha-membro">
                      <td>
                        {m.email ?? <span className="sem-prazo">sem e-mail gravado</span>}
                        {m.user_id === meuId && <div className="obs">é você</div>}
                      </td>
                      <td className="origem">{m.papel === "dono" ? "Dono" : "Escritório"}</td>
                      <td>
                        {m.ativo ? (
                          /*
                            `selo`, não `pill ok`: verde neste produto quer
                            dizer "no prazo". Usar a mesma tinta para "esta
                            pessoa tem acesso" faz verde deixar de querer
                            dizer alguma coisa (regra 5). A varredura pegou.
                          */
                          <span className="selo">ativo</span>
                        ) : (
                          <span className="sem-prazo">desativado</span>
                        )}
                      </td>
                      <td>
                        {m.user_id !== meuId && (
                          <button
                            className="mini-btn"
                            disabled={pendente}
                            onClick={() => acionar(() => mudarAtivoDoMembro(m.id, !m.ativo))}
                          >
                            {m.ativo ? "desativar" : "reativar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form className="form conta-convite" action={acaoConvite}>
            <h3>Adicionar pessoa</h3>
            <div className="dupla">
              <div className="campo">
                <label htmlFor="email">E-mail</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="campo">
                <label htmlFor="senha">Senha inicial</label>
                <input id="senha" name="senha" type="text" required minLength={8} />
                <p className="obs">
                  Você passa essa senha para a pessoa; ela troca depois nesta
                  mesma tela.
                </p>
              </div>
            </div>
            <div className="campo">
              <label htmlFor="papel">Papel</label>
              <select id="papel" name="papel" defaultValue="escritorio">
                <option value="escritorio">Escritório — usa o dia a dia</option>
                <option value="dono">Dono — também mexe em pessoas e plano</option>
              </select>
            </div>
            <Recado r={resConvite} />
            <button className="btn btn-aco" type="submit" disabled={convidando}>
              {convidando ? "Criando…" : "Criar acesso"}
            </button>
          </form>
        </section>
      )}

      <section className="conta-bloco">
        <h2>Minha senha</h2>
        <form className="form" action={acaoSenha}>
          <div className="dupla">
            <div className="campo">
              <label htmlFor="nova">Senha nova</label>
              <input id="nova" name="nova" type="password" required minLength={8} autoComplete="new-password" />
            </div>
            <div className="campo">
              <label htmlFor="repetida">Repita</label>
              <input id="repetida" name="repetida" type="password" required minLength={8} autoComplete="new-password" />
            </div>
          </div>
          <Recado r={resSenha} />
          <button className="btn btn-borda" type="submit" disabled={trocando}>
            {trocando ? "Trocando…" : "Trocar senha"}
          </button>
        </form>
      </section>
    </div>
  );
}
