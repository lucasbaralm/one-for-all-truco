// Textos da Forca que mostram os números da partida.

import type { Standing } from "./engine";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const num = (x: number | undefined) => x ?? 0;

/** Resultado de cada jogador na tela de fim de jogo. */
export const resultLabel = (s: Standing) => `${s.score} pts`;

/** Linha pequena de cada jogador ("2 palavras · 14 letras certas · 3 erros · escolheu 2"). */
export function standingLine(s: Standing): string {
  const parts: string[] = [];
  if (num(s.solved) > 0) parts.push(n(s.solved, "palavra completada", "palavras completadas"));
  parts.push(n(num(s.hits), "letra certa", "letras certas"));
  if (num(s.misses) > 0) parts.push(n(s.misses, "erro", "erros"));
  if (num(s.wordFails) > 0) parts.push(n(s.wordFails, "chute de palavra errado", "chutes de palavra errados"));
  if (num(s.chosen) > 0) {
    const stumped = num(s.stumped);
    parts.push(`escolheu ${n(s.chosen, "palavra", "palavras")}${stumped > 0 ? ` (${stumped === 1 ? "1 ninguém acertou" : `${stumped} ninguém acertou`})` : ""}`);
  }
  return parts.join(" · ");
}

/** Fichinhas do SEU desempenho. */
export function myChips(s: Standing | undefined): string[] {
  if (!s) return [];
  const chips = [`⭐ ${s.score} pontos`];
  if (num(s.solved) > 0) chips.push(`🏅 ${n(s.solved, "palavra completada", "palavras completadas")}`);
  chips.push(`✅ ${n(num(s.hits), "letra certa", "letras certas")}`);
  if (num(s.misses) > 0) chips.push(`❌ ${n(s.misses, "erro", "erros")}`);
  if (num(s.chosen) > 0) chips.push(`✏️ ${n(s.chosen, "palavra escolhida", "palavras escolhidas")}`);
  if (num(s.stumped) > 0) chips.push(`😈 ${n(s.stumped, "palavra que ninguém acertou", "palavras que ninguém acertou")}`);
  return chips;
}
