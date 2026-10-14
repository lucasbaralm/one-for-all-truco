// O baralho do Uno (108 cartas) e o que diz se uma carta pode ser jogada em cima
// de outra. Cada carta física tem um id fixo (0–107): o servidor e as telas só
// trocam ids — e a mão de cada jogador é segredo do servidor (engine.toView).
//
// Por cor: um 0, dois de cada 1–9, dois Pular, dois Inverter, dois +2 (25 cartas × 4)
// + 4 Coringas + 4 Coringas +4.

export type UnoColor = "red" | "yellow" | "green" | "blue";
export const UNO_COLORS: readonly UnoColor[] = ["red", "yellow", "green", "blue"];

export type UnoKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  id: number;
  kind: UnoKind;
  /** null nos coringas (a cor vale a que o jogador escolher ao jogar). */
  color: UnoColor | null;
  /** Só nas cartas de número. */
  value: number | null;
}

export const DECK_SIZE = 108;

function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  const add = (kind: UnoKind, color: UnoColor | null, value: number | null) => deck.push({ id: deck.length, kind, color, value });
  for (const color of UNO_COLORS) {
    add("number", color, 0);
    for (let v = 1; v <= 9; v++) {
      add("number", color, v);
      add("number", color, v);
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      add(kind, color, null);
      add(kind, color, null);
    }
  }
  for (let i = 0; i < 4; i++) add("wild", null, null);
  for (let i = 0; i < 4; i++) add("wild4", null, null);
  return deck;
}

export const DECK: readonly UnoCard[] = buildDeck();

export const cardOf = (id: number): UnoCard => DECK[id];
export const isWild = (card: UnoCard) => card.kind === "wild" || card.kind === "wild4";

/**
 * A carta combina com o topo? Coringa sempre combina (o +4 tem uma regra a mais,
 * que depende da mão: ver engine.legalCards); as outras combinam pela cor atual,
 * pelo mesmo número ou pelo mesmo símbolo (Pular em Pular...).
 */
export function matches(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  if (isWild(card)) return true;
  if (card.color === currentColor) return true;
  if (card.kind === "number") return top.kind === "number" && top.value === card.value;
  return card.kind === top.kind;
}

/** Pontos da carta que sobra na mão (placar do fim de jogo). */
export function cardPoints(card: UnoCard): number {
  if (card.kind === "number") return card.value ?? 0;
  return isWild(card) ? 50 : 20;
}

const KIND_RANK: Record<UnoKind, number> = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 };

/** Ordem da mão na tela: por cor (coringas no fim), números antes dos símbolos, e pelo número. */
export function compareCards(a: number, b: number): number {
  const ca = cardOf(a);
  const cb = cardOf(b);
  const colorA = ca.color ? UNO_COLORS.indexOf(ca.color) : UNO_COLORS.length;
  const colorB = cb.color ? UNO_COLORS.indexOf(cb.color) : UNO_COLORS.length;
  return colorA - colorB || KIND_RANK[ca.kind] - KIND_RANK[cb.kind] || (ca.value ?? 0) - (cb.value ?? 0) || a - b;
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
