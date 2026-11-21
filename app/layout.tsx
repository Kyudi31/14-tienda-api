import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "14 · Inventario Tienda API",
  description: "API REST para Inventario de Tienda de Barrio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
