"use client";

import { Sparkles } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const THEMES = [
  { id: "aquarium" as const, icon: "🐠", label: "Aquário", active: "bg-cyan-600 hover:bg-cyan-700" },
  { id: "candy"   as const, icon: "🍬", label: "Doces",   active: "bg-pink-600 hover:bg-pink-700" },
  { id: "adventure" as const, icon: "⚔️", label: "Aventura", active: "bg-green-600 hover:bg-green-700" },
  { id: "pedro"   as const, icon: "🎭", label: "Pedro",   active: "bg-yellow-600 hover:bg-yellow-700" },
  { id: "lotr"    as const, icon: "💍", label: "Anéis",   active: "bg-amber-700 hover:bg-amber-800" },
  { id: "mpb"     as const, icon: "🎸", label: "MPB",     active: "bg-emerald-700 hover:bg-emerald-800" },
  { id: "lgbt"    as const, icon: "🏳️‍🌈", label: "Orgulho", active: "bg-fuchsia-600 hover:bg-fuchsia-700" },
  { id: "olivia"  as const, icon: "🐕", label: "Olivia",  active: "bg-orange-600 hover:bg-orange-700" },
  { id: "gatos"   as const, icon: "🐈", label: "Gatos",   active: "bg-purple-600 hover:bg-purple-700" },
  { id: "mamadores" as const, icon: "🎉", label: "Mamadores", active: "bg-red-600 hover:bg-red-700" },
  { id: "jessie"  as const, icon: "🌸", label: "Jessie",  active: "bg-rose-500 hover:bg-rose-600" },
];

function ThemeButton({
  t,
  active,
  onClick,
  size = "normal",
}: {
  t: (typeof THEMES)[number];
  active: boolean;
  onClick: () => void;
  size?: "normal" | "small";
}) {
  return (
    <button
      title={t.label}
      onClick={onClick}
      className={`${size === "small" ? "w-6 h-6 text-xs rounded" : "w-9 h-9 text-lg rounded-lg"} flex items-center justify-center transition-all border ${
        active
          ? `${t.active} border-white/30 scale-110 shadow-lg`
          : "bg-black/30 border-white/10 hover:bg-white/10 opacity-60 hover:opacity-100"
      }`}
    >
      {t.icon}
    </button>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      {/* Desktop: fileira de ícones, como sempre foi */}
      <div className="hidden sm:flex absolute top-4 right-4 gap-2 z-50 bg-black/50 p-2 rounded-xl backdrop-blur-sm border border-white/10">
        {THEMES.map((t) => (
          <ThemeButton key={t.id} t={t} active={theme === t.id} onClick={() => setTheme(t.id)} />
        ))}
      </div>

      {/* Mobile: menu hambúrguer com ícone de brilho, abre um painel com os temas */}
      <div className="sm:hidden absolute top-1 right-1 z-50">
        <Popover>
          <PopoverTrigger className="w-8 h-8 rounded-lg bg-black/50 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white">
            <Sparkles className="w-4 h-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 bg-zinc-900 border-zinc-800" side="bottom" align="end">
            <div className="grid grid-cols-4 gap-1.5">
              {THEMES.map((t) => (
                <ThemeButton key={t.id} t={t} active={theme === t.id} onClick={() => setTheme(t.id)} size="small" />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
