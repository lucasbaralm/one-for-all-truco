"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "classic" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Carrega o tema do localStorage
    const savedTheme = localStorage.getItem("fodinha_theme") as Theme;
    if (savedTheme && ["dark", "classic", "light"].includes(savedTheme)) {
      setThemeState(savedTheme);
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("fodinha_theme", newTheme);
  };

  // Evita hidratação incorreta
  if (!mounted) {
    return <div className="min-h-screen bg-zinc-950" />;
  }

  // Aplica classe global
  let bgColorClass = "bg-zinc-950";
  if (theme === "classic") bgColorClass = "bg-emerald-900";
  if (theme === "light") bgColorClass = "bg-gray-100";

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={`min-h-screen flex flex-col transition-colors duration-500 ${bgColorClass}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
