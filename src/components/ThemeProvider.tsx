"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { resolveTheme, themeById, type Theme } from "@/lib/themes";

// Os temas (ids, fundos, camadas escuras…) vivem em src/lib/themes.ts. O tipo
// continua sendo exportado daqui para quem já importava `Theme` deste arquivo.
export type { Theme } from "@/lib/themes";

// Chave do localStorage — NÃO mudar: quem já escolheu um tema reabre com ele.
const STORAGE_KEY = "fodinha_theme";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// O tema escolhido mora no localStorage (um sistema externo ao React), então é
// lido com useSyncExternalStore: no servidor / na hidratação o snapshot é `null`
// ("ainda não sei") e o provider mostra só o fundo escuro, igual ao HTML do
// servidor; logo depois o React relê o valor salvo — sem setState em effect.
const listeners = new Set<() => void>();
// Última escolha feita nesta sessão; vale mesmo se o localStorage estiver bloqueado
// (modo privado etc.) — nesse caso o tema só dura até recarregar.
let sessionTheme: Theme | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function readSaved(): string | null {
  if (sessionTheme) return sessionTheme;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Tema salvo que não existe mais (ou lixo) cai no tema padrão.
const getSnapshot = (): Theme | null => resolveTheme(readSaved());
const getServerSnapshot = (): Theme | null => null;

function saveTheme(theme: Theme) {
  sessionTheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // sem persistência: o tema vale só até recarregar.
  }
  listeners.forEach((l) => l());
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (saved === null) return <div className="min-h-screen bg-zinc-950" />;

  const theme: Theme = saved;
  const def = themeById(theme);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: saveTheme }}>
      <div
        className="min-h-screen flex flex-col transition-all duration-700 bg-cover bg-center relative"
        style={{ backgroundImage: `url(${def.bg})` }}
      >
        <div className={`absolute inset-0 ${def.overlay} pointer-events-none z-0`} />
        <div className="relative z-10 flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
