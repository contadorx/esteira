import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://esteira.app.br"),
  title: "Esteira — todo pedido à vista. Do corte à entrega.",
  description:
    "A Esteira mostra em que etapa está cada pedido da sua oficina, avisa o seu cliente sozinha e te cutuca antes do prazo estourar. Para marmorarias, gráficas, esquadrias, marcenarias e oficinas.",
  openGraph: {
    title: "Esteira — todo pedido à vista",
    description:
      "Acabe com o “cadê meu pedido?”: quadro por etapas, avanço pelo celular do chão de fábrica e aviso automático ao cliente.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
