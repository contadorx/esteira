"use server";

/**
 * Server actions do escritório (B1).
 *
 * Regras que governam este arquivo:
 * - 1: toda escrita lê `{ error }`. Nada segue em frente calado.
 * - 2: o motivo que a tela mostra é o que foi apurado. Violação de unicidade
 *   (23505) vira "já existe pedido com esse número" porque o banco disse isso;
 *   erro desconhecido vira "não consegui gravar" + o texto cru, nunca um
 *   palpite sobre a causa.
 * - 14: sucesso parcial tem porta própria — `inseridos` e `rejeitados` são
 *   campos distintos, não um booleano.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clienteDoServidor, oficinaDaSessao } from "@/lib/supabase/server";
import { lerCsv, normalizarData, normalizarTelefone } from "@/lib/csv";
import type {
  LinhaRejeitada,
  ResultadoCriar,
  ResultadoImport,
} from "./tipos";
import { IMPORT_OCIOSO } from "./tipos";

/** Traduz o erro do Postgres no motivo que a tela pode afirmar (regra 2). */
function motivoDoErro(codigo: string | undefined, texto: string): string {
  // 23514 é o gatilho do plano (`pedidos_respeita_plano`). A mensagem dele já
  // é escrita para gente — repassar é melhor que traduzir de novo e arriscar
  // dizer algo diferente do que o banco decidiu (regra 2).
  if (codigo === "23514") return texto.replace(/^Não dá para criar pedido novo:\s*/i, "");
  if (codigo === "23505") return "já existe um pedido com esse número nesta oficina";
  if (codigo === "23503") return "etapa informada não pertence a esta oficina";
  if (codigo === "42501" || codigo === "PGRST301")
    return "sem permissão para gravar nesta oficina";
  return `não consegui gravar (${texto})`;
}

async function contexto() {
  const { oficinaId } = await oficinaDaSessao();
  if (!oficinaId) redirect("/entrar");
  const supabase = await clienteDoServidor();
  return { supabase, oficinaId };
}

/**
 * Etapas da oficina, em ordem, opcionalmente de um tipo de pedido.
 * Erro sobe — não vira lista vazia (regra 3).
 */
async function etapasDaOficina(tipo?: string) {
  const { supabase } = await contexto();
  let consulta = supabase
    .from("etapas")
    .select("id, nome, ordem, tipo_pedido")
    .order("ordem", { ascending: true });
  if (tipo) consulta = consulta.eq("tipo_pedido", tipo);
  const { data, error } = await consulta;
  if (error) throw new Error(`Não consegui ler as etapas: ${error.message}`);
  return data ?? [];
}

export async function criarPedido(
  _anterior: ResultadoCriar,
  form: FormData,
): Promise<ResultadoCriar> {
  const { supabase, oficinaId } = await contexto();

  const numero = String(form.get("numero") ?? "").trim();
  const cliente = String(form.get("cliente_nome") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();
  const foneBruto = String(form.get("cliente_fone") ?? "").trim();
  const prazoBruto = String(form.get("prazo") ?? "").trim();
  const etapaId = String(form.get("etapa_id") ?? "").trim();
  const tipo = String(form.get("tipo_pedido") ?? "padrao").trim() || "padrao";

  if (!numero) return { estado: "erro", mensagem: "Informe o número do pedido.", campo: "numero" };
  if (!cliente) return { estado: "erro", mensagem: "Informe o nome do cliente.", campo: "cliente_nome" };

  let prazo: string | null = null;
  if (prazoBruto) {
    prazo = normalizarData(prazoBruto);
    if (!prazo) {
      return {
        estado: "erro",
        mensagem: `“${prazoBruto}” não é uma data de calendário válida.`,
        campo: "prazo",
      };
    }
  }

  let fone: string | null = null;
  if (foneBruto) {
    fone = normalizarTelefone(foneBruto);
    if (!fone) {
      return {
        estado: "erro",
        mensagem: `“${foneBruto}” não parece um telefone com DDD.`,
        campo: "cliente_fone",
      };
    }
  }

  // A etapa precisa ser DO TIPO escolhido — senão o pedido nasce num caminho
  // que não é o dele, e o quadro mostra uma coluna que não existe para ele.
  const etapasDoTipo = await etapasDaOficina(tipo);
  if (etapasDoTipo.length === 0) {
    return {
      estado: "erro",
      mensagem: `O tipo de pedido “${tipo}” não tem etapas configuradas.`,
      campo: "etapa_id",
    };
  }
  let etapaEscolhida = etapaId;
  if (!etapaEscolhida) {
    etapaEscolhida = etapasDoTipo[0].id;
  } else if (!etapasDoTipo.some((e) => e.id === etapaEscolhida)) {
    return {
      estado: "erro",
      mensagem: "A etapa escolhida não pertence a esse tipo de pedido.",
      campo: "etapa_id",
    };
  }

  const { error } = await supabase.from("pedidos").insert({
    oficina_id: oficinaId,
    numero,
    cliente_nome: cliente,
    cliente_fone: fone,
    descricao: descricao || null,
    prazo,
    tipo_pedido: tipo,
    etapa_id: etapaEscolhida,
    origem: "manual",
  });

  if (error) {
    return {
      estado: "erro",
      mensagem: motivoDoErro(error.code, error.message),
      campo: error.code === "23505" ? "numero" : null,
    };
  }

  revalidatePath("/app");
  revalidatePath("/app/pedidos");
  redirect("/app/pedidos?novo=" + encodeURIComponent(numero));
}

export async function importarCsv(
  _anterior: ResultadoImport,
  form: FormData,
): Promise<ResultadoImport> {
  const { supabase, oficinaId } = await contexto();

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ...IMPORT_OCIOSO, estado: "recusado", erroGeral: "Escolha um arquivo .csv." };
  }

  const leitura = lerCsv(await arquivo.text());
  if (leitura.erro) {
    return { ...IMPORT_OCIOSO, estado: "recusado", erroGeral: leitura.erro };
  }

  const obrigatorias = ["numero", "cliente_nome"];
  const faltando = obrigatorias.filter((c) => !leitura.cabecalho.includes(c));
  if (faltando.length > 0) {
    return {
      ...IMPORT_OCIOSO,
      estado: "recusado",
      separador: leitura.separador,
      erroGeral:
        `Faltam colunas obrigatórias no cabeçalho: ${faltando.join(", ")}. ` +
        `Encontrei: ${leitura.cabecalho.filter(Boolean).join(", ")}.`,
    };
  }

  const etapas = await etapasDaOficina();
  if (etapas.length === 0) {
    return {
      ...IMPORT_OCIOSO,
      estado: "recusado",
      erroGeral: "Esta oficina ainda não tem etapas configuradas.",
    };
  }
  // Índice por (tipo, nome) e a primeira etapa de cada tipo.
  const porTipoNome = new Map<string, string>();
  const primeiraDoTipo = new Map<string, string>();
  for (const e of etapas) {
    porTipoNome.set(`${e.tipo_pedido}|${e.nome.trim().toLowerCase()}`, e.id);
    if (!primeiraDoTipo.has(e.tipo_pedido)) primeiraDoTipo.set(e.tipo_pedido, e.id);
  }

  const rejeitados: LinhaRejeitada[] = [];
  let inseridos = 0;

  // Uma linha por vez, de propósito: insert em lote falha inteiro por causa de
  // uma linha ruim, e aí não existe relatório linha a linha (regra 14).
  for (const { linha, campos } of leitura.linhas) {
    const numero = (campos.numero ?? "").trim();
    const cliente = (campos.cliente_nome ?? campos.cliente ?? "").trim();

    if (!numero && !cliente) continue; // linha em branco no meio do arquivo

    if (!numero) {
      rejeitados.push({ linha, numero: "—", motivo: "sem número do pedido" });
      continue;
    }
    if (!cliente) {
      rejeitados.push({ linha, numero, motivo: "sem nome do cliente" });
      continue;
    }

    const prazoBruto = (campos.prazo ?? campos.entrega ?? "").trim();
    let prazo: string | null = null;
    if (prazoBruto) {
      prazo = normalizarData(prazoBruto);
      if (!prazo) {
        rejeitados.push({
          linha,
          numero,
          motivo: `prazo “${prazoBruto}” não é data de calendário válida`,
        });
        continue;
      }
    }

    const tipoBruto = (campos.tipo ?? campos.tipo_pedido ?? "").trim();
    const tipo = tipoBruto ? tipoBruto.toLowerCase().replace(/\s+/g, "_") : "padrao";
    const primeira = primeiraDoTipo.get(tipo);
    if (!primeira) {
      rejeitados.push({
        linha,
        numero,
        motivo: `tipo de pedido “${tipo}” não tem etapas configuradas`,
      });
      continue;
    }

    const etapaBruta = (campos.etapa ?? "").trim();
    let etapaId = primeira;
    if (etapaBruta) {
      const achada = porTipoNome.get(`${tipo}|${etapaBruta.toLowerCase()}`);
      if (!achada) {
        rejeitados.push({
          linha,
          numero,
          motivo: `etapa “${etapaBruta}” não existe no tipo “${tipo}”`,
        });
        continue;
      }
      etapaId = achada;
    }

    const foneBruto = (campos.cliente_fone ?? campos.telefone ?? campos.fone ?? "").trim();
    const fone = foneBruto ? normalizarTelefone(foneBruto) : null;
    if (foneBruto && !fone) {
      rejeitados.push({
        linha,
        numero,
        motivo: `telefone “${foneBruto}” não tem DDD + número`,
      });
      continue;
    }

    const { error } = await supabase.from("pedidos").insert({
      oficina_id: oficinaId,
      numero,
      cliente_nome: cliente,
      cliente_fone: fone,
      descricao: (campos.descricao ?? campos.item ?? "").trim() || null,
      prazo,
      tipo_pedido: tipo,
      etapa_id: etapaId,
      origem: "csv",
    });

    if (error) {
      rejeitados.push({ linha, numero, motivo: motivoDoErro(error.code, error.message) });
      continue;
    }
    inseridos++;
  }

  revalidatePath("/app");
  revalidatePath("/app/pedidos");
  return {
    estado: "pronto",
    erroGeral: null,
    inseridos,
    rejeitados,
    totalLidas: leitura.linhas.length,
    separador: leitura.separador,
  };
}

export async function sair() {
  const supabase = await clienteDoServidor();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Não consegui encerrar a sessão: ${error.message}`);
  redirect("/entrar");
}
