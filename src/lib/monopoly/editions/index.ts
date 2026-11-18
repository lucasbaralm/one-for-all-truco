import { BANCO } from "./banco";
import { MONOPOLY } from "./monopoly";
import type { Edition, EditionId, OwnableSquare, Square } from "./types";

export * from "./types";
export { BANCO, MONOPOLY };

export const EDITIONS: Record<EditionId, Edition> = { monopoly: MONOPOLY, banco: BANCO };
export const EDITION_IDS = Object.keys(EDITIONS) as EditionId[];

export const isEditionId = (x: unknown): x is EditionId => x === "monopoly" || x === "banco";
export const getEdition = (id: EditionId): Edition => EDITIONS[id];

export const SQUARE_COUNT = 40;

/** A casa dá dono (rua, ferrovia, companhia)? */
export const isOwnable = (sq: Square): sq is OwnableSquare => "price" in sq;

/** Posições de todas as casas do mesmo grupo de cor (inclui a própria). */
export function groupSquares(edition: Edition, group: string): number[] {
  const out: number[] = [];
  edition.squares.forEach((sq, i) => {
    if (sq.kind === "street" && sq.group === group) out.push(i);
  });
  return out;
}

/** Valor da hipoteca de uma casa (metade do preço). */
export const mortgageValue = (sq: OwnableSquare) => Math.floor(sq.price / 2);

/** Custo de tirar a hipoteca: o valor mais 10% de juros (em inteiros: 50 × 1,1 em ponto flutuante dá 56). */
export const unmortgageCost = (sq: OwnableSquare) => {
  const value = mortgageValue(sq);
  return value + Math.ceil(value / 10);
};
