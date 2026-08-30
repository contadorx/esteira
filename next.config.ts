import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Um host só, sem rewrite de domínio (D10):
  // site em /, escritório em /app, chão em /c/<token>, cliente em /p/<token>.
  // O middleware existe só para renovar o cookie de sessão — não é roteamento
  // nem trava de acesso (a trava é RLS; ver middleware.ts).
};

export default nextConfig;
