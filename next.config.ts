import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem rewrites, sem middleware: um host só (D10).
  // Site em /, escritório em /app, chão em /c/<token>, cliente em /p/<token>.
};

export default nextConfig;
