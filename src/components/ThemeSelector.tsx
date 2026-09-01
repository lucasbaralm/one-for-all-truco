"use client";

import { useTheme } from "./ThemeProvider";
import { Fish, Lollipop, Sword } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEMES = [
  { id: "aquarium" as const, icon: "🐠", label: "Aquário", active: "bg-cyan-600 hover:bg-cyan-700" },
  { id: "candy"   as const, icon: "🍬", label: "Doces",   active: "bg-pink-600 hover:bg-pink-700" },
  { id: "adventure" as const, icon: "⚔️", label: "Aventura", active: "bg-green-600 hover:bg-green-700" },
  { id: "pedro"   as const, icon: "🎭", label: "Pedro",   active: "bg-yellow-600 hover:bg-yellow-700" },
  { id: "lotr"    as const, icon: "💍", label: "Anéis",   active: "bg-amber-700 hover:bg-amber-800" },
  { id: "mpb"     as const, icon: "🎸", label: "MPB",     active: "bg-emerald-700 hover:bg-emerald-800" },
  { id: "lgbt"    as const, icon: "🏳️‍🌈", label: "Orgulho", active: "bg-fuchsia-600 hover:bg-fuchsia-700" },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="absolute top-4 right-4 flex gap-2 z-50 bg-black/50 p-2 rounded-xl backdrop-blur-sm border border-white/10">
      {THEMES.map(t => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => setTheme(t.id)}
          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all border ${
            theme === t.id
              ? `${t.active} border-white/30 scale-110 shadow-lg`
              : "bg-black/30 border-white/10 hover:bg-white/10 opacity-60 hover:opacity-100"
          }`}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
