export type Suit = 'hearts' | 'spades' | 'diamonds' | 'clubs';
export type Value = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  suit: Suit;
  value: Value;
}

const VALUES: Value[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SUITS: Suit[] = ['diamonds', 'spades', 'hearts', 'clubs'];

// A força base das cartas no Truco (índice maior = mais forte)
const BASE_VALUE_STRENGTH: Record<Value, number> = {
  '4': 1, '5': 2, '6': 3, '7': 4, 'Q': 5, 'J': 6, 'K': 7, 'A': 8, '2': 9, '3': 10
};

// Força dos naipes: usada tanto pra desempate de manilhas quanto pra desempate
// de valor entre cartas normais (ex: dois "2" fora de manilha) — Ouros < Espadas
// < Copas < Paus sempre, nunca "mela" por naipe.
const SUIT_STRENGTH: Record<Suit, number> = {
  'diamonds': 1, // Ouros / Pica-fumo
  'spades': 2,   // Espadilha
  'hearts': 3,   // Copas
  'clubs': 4     // Zap
};

/**
 * Cria um baralho de Truco limpo com 40 cartas.
 */
export function generateDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

/**
 * Embaralha o array de cartas (Fisher-Yates)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Retorna o valor da carta que será a manilha, baseado no vira.
 */
export function getManilhaValue(vira: Card): Value {
  const viraIndex = VALUES.indexOf(vira.value);
  // Se o vira for '3' (último índice), a manilha volta para o '4' (primeiro índice)
  const manilhaIndex = (viraIndex + 1) % VALUES.length;
  return VALUES[manilhaIndex];
}

/**
 * Retorna um número absoluto de força para uma carta, permitindo comparar qual vence a rodada.
 */
export function getCardStrength(card: Card, vira: Card): number {
  const manilhaValue = getManilhaValue(vira);

  // Se for manilha, ganha um bônus enorme (separado de qualquer carta normal)
  // + força do naipe (Zap ganha de Copas, etc).
  if (card.value === manilhaValue) {
    return 1000 + SUIT_STRENGTH[card.suit];
  }

  // Cartas normais: valor base decide primeiro, mas empate de valor (ex: dois
  // "2" fora de manilha) sempre desempata pelo naipe — Ouros < Espadas < Copas
  // < Paus, a mesma hierarquia da manilha — nunca por quem jogou primeiro.
  // O *10 garante que o naipe (no máximo +4) nunca "vaza" pro valor seguinte.
  return BASE_VALUE_STRENGTH[card.value] * 10 + SUIT_STRENGTH[card.suit];
}

/**
 * Descobre qual a carta vencedora de uma rodada (vaza).
 * Quem jogou a carta mais forte ganha. Empate de VALOR (ex: dois '3', nenhum
 * sendo manilha) nunca "mela" — desempata pelo naipe (Ouros < Espadas < Copas
 * < Paus), igual à hierarquia usada entre manilhas. Como não existem duas
 * cartas iguais (mesmo valor E naipe) num baralho de verdade, getCardStrength
 * garante uma força única por carta — empate de fato nunca acontece.
 */
export function getWinningCardIndex(playedCards: Card[], vira: Card): number {
  if (playedCards.length === 0) return -1;
  
  let bestIndex = 0;
  let maxStrength = getCardStrength(playedCards[0], vira);
  
  for (let i = 1; i < playedCards.length; i++) {
    const strength = getCardStrength(playedCards[i], vira);
    if (strength > maxStrength) {
      maxStrength = strength;
      bestIndex = i;
    }
  }
  
  return bestIndex;
}
