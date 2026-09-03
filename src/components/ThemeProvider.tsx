"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "aquarium" | "candy" | "adventure" | "pedro" | "lotr" | "mpb" | "lgbt" | "olivia" | "gatos" | "mamadores" | "jessie";

const ALL_THEMES: Theme[] = ["aquarium", "candy", "adventure", "pedro", "lotr", "mpb", "lgbt", "olivia", "gatos", "mamadores", "jessie"];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_BG: Record<Theme, string> = {
  aquarium: "/themes/bg_aquarium.jpg",
  candy: "/themes/bg_candy.jpg",
  adventure: "/themes/bg_adventure.jpg",
  pedro: "/themes/bg_pedro.jpg",
  lotr: "/themes/bg_lotr.jpg",
  mpb: "/themes/bg_mpb.jpg",
  lgbt: "/themes/bg_lgbt.jpg",
  olivia: "/themes/bg_olivia.png",
  gatos: "/themes/bg_gatos.jpg",
  mamadores: "/themes/bg_mamadores.jpg",
  jessie: "/themes/bg_jessie.jpg",
};

const THEME_OVERLAY: Record<Theme, string> = {
  aquarium: "bg-black/60",
  candy: "bg-black/50",
  adventure: "bg-black/65",
  pedro: "bg-black/55",
  lotr: "bg-black/60",
  mpb: "bg-black/50",
  lgbt: "bg-black/55",
  olivia: "bg-black/60",
  gatos: "bg-black/55",
  mamadores: "bg-black/55",
  jessie: "bg-black/60",
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("aquarium");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("fodinha_theme") as Theme;
    if (savedTheme && ALL_THEMES.includes(savedTheme)) {
      setThemeState(savedTheme);
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("fodinha_theme", newTheme);
  };

  if (!mounted) return <div className="min-h-screen bg-zinc-950" />;

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div
        className="min-h-screen flex flex-col transition-all duration-700 bg-cover bg-center relative"
        style={{ backgroundImage: `url(${THEME_BG[theme]})` }}
      >
        <div className={`absolute inset-0 ${THEME_OVERLAY[theme]} pointer-events-none z-0`} />
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
