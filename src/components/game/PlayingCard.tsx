import { Heart, Spade, Diamond, Club } from "lucide-react";
import type { Card as GameCard } from "@/lib/game/rules";

// ─────────────────────────────────────────────────────────────────────────────
// PLAYING CARD
// ─────────────────────────────────────────────────────────────────────────────
// Cada tema pode ter mais de uma imagem de verso — a carta N da mão usa
// images[N % images.length], ou seja, alterna: 1ª carta pega a 1ª imagem, 2ª
// carta pega a 2ª, e assim por diante, repetindo do início quando acabam.
const CARD_BACKS: Record<string, string[]> = {
  candy: ["/themes/card_back_candy.jpg"],
  adventure: ["/themes/card_back_adventure.jpg"],
  pedro: ["/themes/card_back_pedro.png"],
  aquarium: ["/themes/card_back_aquarium.jpg"],
  lotr: ["/themes/card_back_lotr.jpg"],
  mpb: ["/themes/card_back_mpb.jpg"],
  lgbt: ["/themes/card_back_lgbt.jpg"],
  olivia: ["/themes/card_back_olivia_1.png", "/themes/card_back_olivia_2.png", "/themes/card_back_olivia_3.jpg"],
  gatos: ["/themes/card_back_gatos_1.jpg", "/themes/card_back_gatos_2.jpg"],
  mamadores: ["/themes/card_back_mamadores_1.jpg", "/themes/card_back_mamadores_2.jpg"],
  jessie: ["/themes/card_back_jessie_1.jpg"],
};

// Fundo da mesa (a "vaza"), mesma imagem de fundo do tema — só recortada em círculo.
export const TABLE_BG: Record<string, string> = {
  candy: "/themes/bg_candy.jpg",
  adventure: "/themes/bg_adventure.jpg",
  pedro: "/themes/bg_pedro.jpg",
  aquarium: "/themes/bg_aquarium.jpg",
  lotr: "/themes/bg_lotr.jpg",
  mpb: "/themes/bg_mpb.jpg",
  lgbt: "/themes/bg_lgbt.jpg",
  olivia: "/themes/bg_olivia.png",
  gatos: "/themes/bg_gatos.jpg",
  mamadores: "/themes/bg_mamadores.jpg",
  jessie: "/themes/bg_jessie.jpg",
};

const CARD_BORDERS: Record<string, [string, string]> = {
  aquarium: ["border-red-400", "border-cyan-400"],
  candy: ["border-pink-400", "border-purple-400"],
  adventure: ["border-orange-400", "border-green-500"],
  pedro: ["border-yellow-400", "border-zinc-400"],
  lotr: ["border-amber-500", "border-stone-400"],
  mpb: ["border-orange-600", "border-teal-600"],
  lgbt: ["border-rose-500", "border-indigo-500"],
  olivia: ["border-orange-400", "border-amber-700"],
  gatos: ["border-purple-400", "border-slate-500"],
  mamadores: ["border-red-400", "border-yellow-500"],
  jessie: ["border-rose-400", "border-pink-600"],
};

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
  // o tema tem mais de uma imagem de verso (ver CARD_BACKS acima).
  backIndex?: number;
}) {
  if (hidden) {
    const backs = CARD_BACKS[theme] ?? CARD_BACKS.aquarium;
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
  const [redBorder, blackBorder] = CARD_BORDERS[theme] ?? CARD_BORDERS.aquarium;

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
