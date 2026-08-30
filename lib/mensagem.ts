/**
 * mensagem.ts — a porta ÚNICA de mensagem (D2 do 04-arquitetura-e-decisoes).
 *
 * `tipo` é sempre um TEMPLATE nomeado — nunca texto solto montado por quem
 * chama. O campo `remetente` existe desde a primeira linha, mesmo com um
 * número só: é o que torna indolor a migração para número por cliente (08).
 *
 * FASE 1 — só existe o adaptador MANUAL: renderizamos o texto e a pessoa
 * envia pelo WhatsApp dela (botão copiar / link wa.me). Por honestidade
 * (regras 1 e 2 do 05): o status registrável aqui é 'copiado' — NUNCA
 * 'enviado'. Envio automático (Meta Cloud API) chega na fase 2, atrás
 * desta mesma porta.
 */

export type TipoMensagem = "pedido_avancou" | "pedido_pronto" | "radar_atraso";

export interface DadosMensagem {
  [chave: string]: string;
}

export interface Mensagem {
  /** Telefone de destino, só dígitos com DDI (ex.: 5511999990000). */
  para: string;
  /** Quem assina — nome da oficina (fase 1) ou WABA/número (fase 2+). */
  remetente: string;
  tipo: TipoMensagem;
  dados: DadosMensagem;
}

/** Templates da fase 1 — texto alinhado ao 06-fase-0-kit-de-campo. */
const TEMPLATES: Record<TipoMensagem, (d: DadosMensagem) => string> = {
  pedido_avancou: (d) =>
    `Olá, ${d.nome}! Seu pedido ${d.descricao} saiu de "${d.etapaAnterior}" ` +
    `e entrou em "${d.etapaAtual}". Previsão de conclusão: ${d.previsao}. ` +
    `Acompanhe por aqui: ${d.link} — ${d.remetente}`,
  pedido_pronto: (d) =>
    `${d.nome}, seu pedido ${d.descricao} está PRONTO! ` +
    `Combinamos a entrega para ${d.previsao}? — ${d.remetente}`,
  radar_atraso: (d) =>
    `Bom dia! ${d.qtd} pedido(s) não saem no prazo se não andarem hoje:\n` +
    `${d.lista}\nOntem: ${d.resumoOntem}`,
};

/** Renderiza o texto de um template. Falta de campo é ERRO, não "undefined" no texto. */
export function renderizarTexto(tipo: TipoMensagem, dados: DadosMensagem): string {
  const texto = TEMPLATES[tipo](dados);
  if (texto.includes("undefined")) {
    throw new Error(`Template ${tipo} com campo faltando: ${JSON.stringify(dados)}`);
  }
  return texto;
}

/** Link wa.me com o texto pronto — o canal inteiro da fase 1 (08, fase 0/1). */
export function linkWa(paraDigitos: string, texto: string): string {
  return `https://wa.me/${paraDigitos}?text=${encodeURIComponent(texto)}`;
}

export type StatusEnvio = "copiado" | "enviado" | "falhou" | "nao_confirmado";

/**
 * O contrato da porta. Na fase 1 NÃO há envio automático: chamar isto com
 * expectativa de envio é um erro de programação, e o erro diz isso alto —
 * jamais devolver 'enviado' sem envio (o pecado capital do 05).
 */
export async function enviarMensagem(_m: Mensagem): Promise<never> {
  throw new Error(
    "Fase 1 não tem envio automático. Use renderizarTexto() + linkWa() " +
      "e registre o aviso com status 'copiado'. O adaptador oficial (Meta " +
      "Cloud API) entra na fase 2 atrás desta mesma função.",
  );
}
