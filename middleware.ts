/**
 * Middleware — existe por UM motivo: renovar o cookie de sessão do Supabase.
 * Server Component não pode gravar cookie; sem isto, a sessão expira e o
 * escritório é jogado para /entrar no meio do trabalho.
 *
 * NÃO é trava de acesso. A trava real é RLS no banco (regra 11); a guarda de
 * navegação está no layout de /app. Este arquivo só carrega o cookie adiante.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { lerAmbiente } from "@/lib/ambiente";

type CookieParaGravar = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  // Antes isto era `if (!url) return resposta;` — desistia calado, e a sessão
  // parava de ser renovada sem ninguém saber. Falha silenciosa é o pecado
  // capital deste projeto (regra 1): agora avisa no log e segue, porque a
  // página em si já mostra o motivo na tela.
  const { ambiente, motivo } = lerAmbiente();
  if (!ambiente) {
    console.error("[esteira] middleware sem ambiente do Supabase:", motivo);
    return resposta;
  }
  const { url, publicavel } = ambiente;

  const supabase = createServerClient(url, publicavel, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(paraGravar: CookieParaGravar[]) {
        for (const { name, value } of paraGravar) {
          request.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of paraGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // Só de chamar getUser() o cookie é renovado quando preciso.
  await supabase.auth.getUser();
  return resposta;
}

export const config = {
  matcher: ["/app/:path*", "/entrar"],
};
