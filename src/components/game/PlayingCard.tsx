import { Heart, Spade, Diamond, Club } from "lucide-react";
import type { Card as GameCard } from "@/lib/game/rules";
import { THEME_BG, themeById } from "@/lib/themes";

// ─────────────────────────────────────────────────────────────────────────────
// PLAYING CARD
// ─────────────────────────────────────────────────────────────────────────────
// Cada tema pode ter mais de uma imagem de verso — a carta N da mão usa
// images[N % images.length], ou seja, alterna: 1ª carta pega a 1ª imagem, 2ª
// carta pega a 2ª, e assim por diante, repetindo do início quando acabam.
// Os versos e as bordas de cada tema vivem no registro (src/lib/themes.ts).

// Fundo da mesa (a "vaza"), mesma imagem de fundo do tema — só recortada em círculo.
export const TABLE_BG: Record<string, string> = THEME_BG;

export function PlayingCard({
  card,
  hidden = false,
  theme = "aquarium",
  backIndex = 0,
}: {
  card: GameCard;
  hidden?: boolean;
  theme?: string;
  // Posição da carta na mão (0 = 1ª carta) — decide qual verso mostrar, quando
  // o tema tem mais de uma imagem de verso (ver cardBacks no registro).
  backIndex?: number;
}) {
  if (hidden) {
    const backs = themeById(theme).cardBacks;
    const back = backs[backIndex % backs.length];
    return (
      <div
        className="w-[4.32rem] h-[5.76rem] sm:w-[7.2rem] sm:h-[10.08rem] rounded-lg sm:rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.6)] border-2 border-white/20 bg-cover bg-center overflow-hidden select-none"
        style={{ backgroundImage: `url(${back})` }}
      />
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const Icon = { hearts: Heart, spades: Spade, diamonds: Diamond, clubs: Club }[card.suit];
  const [redBorder, blackBorder] = themeById(theme).cardBorders;

  return (
    <div
      className={`w-[4.32rem] h-[5.76rem] sm:w-[7.2rem] sm:h-[10.08rem] bg-white/96 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.5)] flex flex-col justify-between p-1.5 sm:p-2.5 border-2 ${isRed ? redBorder : blackBorder} ${isRed ? "text-red-600" : "text-zinc-900"} select-none`}>
      <div className="text-sm sm:text-[1.35rem] font-bold leading-none">{card.value}</div>
      <div className="flex-1 flex items-center justify-center">
        <Icon className="w-6 h-6 sm:w-12 sm:h-12 fill-current" />
      </div>
      <div className="text-sm sm:text-[1.35rem] font-bold leading-none rotate-180">{card.value}</div>
    </div>
  );
}
