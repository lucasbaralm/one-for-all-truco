import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeSelector } from "@/components/ThemeSelector";

export const metadata: Metadata = {
  title: "Fodinha Multiplayer",
  description: "O melhor jogo de cartas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${nunito.variable} font-sans h-full antialiased dark`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <ThemeSelector />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
