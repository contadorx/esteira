/**
 * ambiente.ts — a ÚNICA leitura das variáveis do Supabase.
 *
 * Existiam três lugares lendo `process.env` com nomes ligeiramente diferentes,
 * e o middleware desistia em silêncio quando não achava — falha silenciosa,
 * regra nº 1. Agora todo mundo pergunta aqui.
 *
 * Por que vários nomes são aceitos: nesta aplicação **nada** fala com o
 * Supabase pelo navegador — cliente do escritório, do chão e do cliente final
 * passam por Server Components e Server Actions. Logo o prefixo
 * `NEXT_PUBLIC_` não é necessário, e sem ele a chave pode ser guardada como
 * Secret na Vercel e nunca chega ao navegador. Os nomes com prefixo continuam
 * valendo para quem já os configurou.
 *
 * Preferência: nome privado primeiro. É o mais seguro dos dois.
 */

export interface Ambiente {
  url: string;
  publicavel: string;
}

const NOMES_URL = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

const NOMES_CHAVE = [
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function primeiro(nomes: readonly string[]): string | null {
  for (const n of nomes) {
    const v = process.env[n];
    // Aspas e espaços colados no copiar-e-colar são a causa mais boba de
    // "não conecta" — limpamos aqui, uma vez, para todo mundo.
    const limpo = v?.trim().replace(/^["']|["']$/g, "");
    if (limpo) return limpo;
  }
  return null;
}

export function lerAmbiente(): { ambiente: Ambiente | null; motivo: string | null } {
  const url = primeiro(NOMES_URL);
  const publicavel = primeiro(NOMES_CHAVE);
  if (url && publicavel) return { ambiente: { url, publicavel }, motivo: null };

  const faltando = [
    !url && `a URL (aceito: ${NOMES_URL.join(" ou ")})`,
    !publicavel && `a chave pública (aceito: ${NOMES_CHAVE.join(" ou ")})`,
  ].filter(Boolean);

  const presentes = Object.keys(process.env)
    .filter((k) => /SUPABASE/i.test(k))
    .sort();

  return {
    ambiente: null,
    // Regra 2: dizer o que foi apurado. Listar o que CHEGOU transforma o erro
    // em diagnóstico — sem isso, "faltam variáveis" não distingue nome errado,
    // escopo errado e implantação antiga.
    motivo:
      `Faltando ${faltando.join(" e ")}. ` +
      (presentes.length > 0
        ? `Chegaram a este processo: ${presentes.join(", ")}.`
        : "Nenhuma variável com “SUPABASE” no nome chegou a este processo. " +
          "Na Vercel, alterar variável NÃO afeta implantação já criada — é " +
          "preciso refazer o deploy depois de salvar."),
  };
}

/** Versão que lança, para quem não tem como seguir sem o cliente. */
export function exigirAmbiente(): Ambiente {
  const { ambiente, motivo } = lerAmbiente();
  if (!ambiente) throw new Error(motivo ?? "Ambiente do Supabase não configurado.");
  return ambiente;
}
