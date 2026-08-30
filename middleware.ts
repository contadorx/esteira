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

type CookieParaGravar = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicavel = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicavel) return resposta;

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
