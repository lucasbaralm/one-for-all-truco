"use client";

import { useTheme, Theme } from "./ThemeProvider";
import { Button } from "./ui/button";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="absolute top-4 right-4 flex gap-2 z-50 bg-black/50 p-2 rounded-xl backdrop-blur-sm border border-white/10">
      <Button 
        variant={theme === "dark" ? "default" : "secondary"} 
        size="sm" 
        onClick={() => setTheme("dark")}
        className={theme === "dark" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-transparent text-white/70"}
      >
        Dark
      </Button>
      <Button 
        variant={theme === "classic" ? "default" : "secondary"} 
        size="sm" 
        onClick={() => setTheme("classic")}
        className={theme === "classic" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-transparent text-white/70"}
      >
        Classic
      </Button>
      <Button 
        variant={theme === "light" ? "default" : "secondary"} 
        size="sm" 
        onClick={() => setTheme("light")}
        className={theme === "light" ? "bg-gray-200 hover:bg-gray-300 text-black" : "bg-transparent text-white/70"}
      >
        Light
      </Button>
    </div>
  );
}
