// O baralho do Dobble (Spot It!): 55 cartas, 8 símbolos em cada, 57 símbolos
// no total — e QUALQUER par de cartas tem exatamente um símbolo em comum.
// Isso é um plano projetivo de ordem 7 (57 pontos, 57 retas, 8 pontos por
// reta); o jogo físico usa 55 das 57 retas.

export const ORDER = 7;
export const SYMBOLS_PER_CARD = ORDER + 1; // 8
export const SYMBOL_COUNT = ORDER * ORDER + ORDER + 1; // 57
export const DECK_SIZE = 55;

/**
 * Emojis (todos com apresentação de emoji "por padrão", sem precisar de
 * seletor de variação — assim aparecem coloridos em qualquer sistema) bem
 * distintos entre si. O índice no array É o id do símbolo.
 */
export const SYMBOLS: readonly string[] = [
  // céu e clima
  "🌞", "🌙", "⭐", "⚡", "🔥", "💧", "🌈", "⛄", "🌊", "🌋",
  // plantas e comida
  "🍎", "🍋", "🍒", "🍇", "🍉", "🍌", "🍓", "🥕", "🌽", "🍄", "🌵", "🌳", "🌸", "🌻", "🍀", "🍕", "🍩",
  // bichos
  "🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐸", "🐵", "🦁", "🐘", "🐢", "🐍", "🐙", "🐟", "🐞", "🦋", "🐝",
  // objetos
  "🚗", "🚀", "⚓", "🔑", "🔔", "🎈", "🎁", "⚽", "🎲", "🎵", "💣", "💡",
];

/** As 57 cartas possíveis (cada uma é uma lista de 8 ids de símbolos). */
export function buildAllCards(): number[][] {
  const n = ORDER;
  const cards: number[][] = [];

  // carta 0: os símbolos 0..n
  cards.push(Array.from({ length: n + 1 }, (_, i) => i));

  // n cartas que compartilham o símbolo 0 (e nada mais entre si)
  for (let j = 0; j < n; j++) {
    const card = [0];
    for (let k = 0; k < n; k++) card.push(n + 1 + n * j + k);
    cards.push(card);
  }

  // n*n cartas restantes: o símbolo i (1..n) + um de cada "grupo"
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < n; j++) {
      const card = [i];
      for (let k = 0; k < n; k++) card.push(n + 1 + n * k + ((i - 1) * k + j) % n);
      cards.push(card);
    }
  }
  return cards;
}

export const ALL_CARDS: readonly number[][] = buildAllCards();

/** O único símbolo em comum entre duas cartas (ids de carta do baralho completo). */
export function commonSymbol(a: number, b: number): number {
  const cardB = new Set(ALL_CARDS[b]);
  return ALL_CARDS[a].find((s) => cardB.has(s)) ?? -1;
}

export function cardHasSymbol(card: number, symbol: number): boolean {
  return ALL_CARDS[card]?.includes(symbol) ?? false;
}

/** Embaralhamento Fisher–Yates com rng injetável (testes usam um rng fixo). */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Baralho de jogo: 55 das 57 cartas, em ordem aleatória. */
export function newDeck(rng: () => number = Math.random): number[] {
  return shuffle(
    ALL_CARDS.map((_, i) => i),
    rng
  ).slice(0, DECK_SIZE);
}
