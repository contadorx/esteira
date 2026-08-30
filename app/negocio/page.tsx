import type { Metadata } from "next";
import { carregarNegocio } from "@/lib/negocio";
import PainelDoNegocio from "./painel";

export const metadata: Metadata = { title: "O negócio — Esteira" };
export const dynamic = "force-dynamic";

export default async function PaginaNegocio() {
  const leitura = await carregarNegocio();

  /*
    Falha de leitura NÃO pode virar painel zerado.

    É o defeito mais caro que um painel de receita pode ter: o `select` morre,
    a tela mostra R$ 0 recebido, 0 cobranças pagas, com o subtítulo "conferido
    no Asaas" e nenhum aviso. Zero por falha é indistinguível de zero por não
    ter entrado dinheiro (regra 3).
  */
  if (leitura.estado === "falha") {
    return (
      <div className="wrap-app estreito">
        <h1>Não consegui ler os dados do negócio</h1>
        <div className="falha" role="alert">
          <p>{leitura.erro}</p>
          <p className="obs">
            Nenhum número é mostrado abaixo de propósito: um painel de receita
            com zeros de falha é pior do que painel nenhum.
          </p>
        </div>
      </div>
    );
  }

  // O layout já barrou quem não é da equipe. Chegar aqui com `restrito` quer
  // dizer que a permissão mudou entre uma consulta e outra — raro, e ainda
  // assim precisa de resposta própria em vez de uma tela em branco.
  if (leitura.estado === "restrito") {
    return (
      <div className="wrap-app estreito">
        <h1>Área restrita</h1>
        <p className="ajuda">Sua conta não está na lista de quem opera a Esteira.</p>
      </div>
    );
  }

  return <PainelDoNegocio n={leitura.n} />;
}
