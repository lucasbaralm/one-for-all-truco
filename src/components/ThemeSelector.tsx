"use client";

import { Sparkles } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { groupedThemes, themeById, type Theme, type ThemeDef } from "@/lib/themes";

function ThemeButton({
  t,
  active,
  onClick,
}: {
  t: ThemeDef;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={t.label}
      aria-label={t.label}
      aria-pressed={active}
      onClick={onClick}
      className={`w-8 h-8 sm:w-9 sm:h-9 text-base sm:text-lg rounded-md sm:rounded-lg flex items-center justify-center transition-all border ${
        active
          ? `${t.activeClass} border-white/30 scale-110 shadow-lg`
          : "bg-black/30 border-white/10 hover:bg-white/10 opacity-60 hover:opacity-100"
      }`}
    >
      {t.icon}
    </button>
  );
}

// O conteúdo do painel: os temas agrupados (Clássicos, Hora de Aventura, Mais
// temas), cada grupo com um título pequeno e uma grade de ícones. Separado do
// popover para poder ser testado sem abrir nada.
export function ThemeGrid({ theme, onSelect }: { theme: Theme; onSelect: (theme: Theme) => void }) {
  return (
    <div className="flex flex-col gap-2.5 sm:gap-3">
      {groupedThemes().map((g) => (
        <section key={g.id} aria-label={g.label} data-theme-group={g.id}>
          <h3 className="mb-1 sm:mb-1.5 px-0.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            {g.label}
          </h3>
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
            {g.themes.map((t) => (
              <ThemeButton key={t.id} t={t} active={theme === t.id} onClick={() => onSelect(t.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  // Um único gatilho (brilho ✨) em qualquer tamanho de tela — clicar abre um
  // painel com todos os temas, em vez de ocupar o topo com uma fileira de ícones.
  // O painel rola quando não cabe (telas baixas / celular na horizontal).
  return (
    <div className="absolute top-1 right-1 sm:top-4 sm:right-4 z-50">
      <Popover>
        <PopoverTrigger
          aria-label="Escolher tema"
          className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-black/50 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all"
        >
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 sm:p-3 bg-zinc-900 border-zinc-800" side="bottom" align="end">
          <div className="flex items-baseline justify-between gap-3 px-0.5">
            <span className="text-xs font-bold text-white">Tema</span>
            <span className="text-[11px] text-zinc-400 truncate">{themeById(theme).label}</span>
          </div>
          <div className="max-h-[min(70vh,26rem)] overflow-y-auto overscroll-contain pr-0.5">
            <ThemeGrid theme={theme} onSelect={setTheme} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
