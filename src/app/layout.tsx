import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <div className="absolute top-4 right-4 z-50">
            <ThemeSelector />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
