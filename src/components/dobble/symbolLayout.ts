import { ALL_CARDS, shuffle } from "@/lib/dobble/cards";
import { mulberry32 } from "@/lib/random";

// Como os 8 símbolos de uma carta ficam dispostos: um no meio e sete em volta,
// cada um com tamanho e giro diferentes (é isso que faz o Dobble ser difícil).
// O sorteio usa o id da carta como semente — a MESMA carta sempre tem o mesmo
// visual, em qualquer tela e a cada renderização.

export interface SymbolSpot {
  symbol: number;
  /** Centro do símbolo, em % do diâmetro da carta (0..100). */
  x: number;
  y: number;
  /** Lado da caixa do símbolo, em % do diâmetro. */
  size: number;
  /** Giro em graus. */
  rotate: number;
}

const cache = new Map<number, SymbolSpot[]>();

export function layoutCard(card: number): SymbolSpot[] {
  const cached = cache.get(card);
  if (cached) return cached;

  const rng = mulberry32(card * 7919 + 13);
  const symbols = shuffle(ALL_CARDS[card], rng);
  const jitter = (amount: number) => (rng() - 0.5) * 2 * amount;
  const scale = () => 0.82 + rng() * 0.36;

  const spots: SymbolSpot[] = [
    // o do meio (um pouco maior)
    { symbol: symbols[0], x: 50 + jitter(1.5), y: 50 + jitter(1.5), size: 27 * scale(), rotate: jitter(110) },
  ];
  const start = rng() * Math.PI * 2;
  for (let i = 0; i < 7; i++) {
    const angle = start + (i / 7) * Math.PI * 2 + jitter(0.1);
    const radius = 33.5 + jitter(1.4);
    spots.push({
      symbol: symbols[i + 1],
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      size: 24 * scale(),
      rotate: jitter(110),
    });
  }
  cache.set(card, spots);
  return spots;
}
