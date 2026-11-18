import { DeckId, EditionId, getEdition } from "./editions";
import type { BotLevel } from "./engine";

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: "Fácil", medium: "Médio", hard: "Difícil" };

/**
 * "$1.500" (Monopoly) / "R$ 2.500" (Banco Imobiliário): milhar com ponto e a moeda da edição. Feito à mão
 * (não toLocaleString) pra servidor e navegador escreverem IGUAL, com ou sem ICU. Negativo leva "−" na frente.
 */
export function money(edition: EditionId, amount: number): string {
  const n = Math.round(amount);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "−" : ""}${getEdition(edition).currency}${digits}`;
}

/** Nome de uma casa do tabuleiro; as de carta usam o nome do baralho ("Sorte", "Caixa Comunitária"). */
export function squareLabel(edition: EditionId, idx: number): string {
  const ed = getEdition(edition);
  const sq = ed.squares[idx];
  if (!sq) return "?";
  return sq.kind === "card" ? ed.deckNames[sq.deck] : sq.name;
}

/** O texto de uma carta de Sorte / Caixa Comunitária. */
export function cardText(edition: EditionId, deck: DeckId, idx: number): string {
  return getEdition(edition).decks[deck][idx]?.text ?? "";
}

/** A duração da partida (0 = até a falência). */
export function limitLabel(limit: number): string {
  if (limit <= 0) return "Até a falência";
  return `${limit} ${limit === 1 ? "rodada" : "rodadas"}`;
}
