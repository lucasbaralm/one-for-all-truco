// Textos da Mímica que mostram os números da partida.

import type { Standing } from "./engine";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const num = (x: number | undefined) => x ?? 0;

/** Resultado de cada jogador na tela de fim de jogo. */
export const resultLabel = (s: Standing) => `${s.score} pts`;

/** Linha pequena de cada jogador ("3 músicas acertadas · 2 mímicas acertadas pela galera · 1 ninguém acertou"). */
export function standingLine(s: Standing): string {
  const parts: string[] = [n(num(s.guessed), "música acertada", "músicas acertadas")];
  if (num(s.wrong) > 0) parts.push(n(s.wrong, "chute errado", "chutes errados"));
  if (num(s.mimed) > 0) {
    const solved = num(s.solvedMimes);
    parts.push(`${n(s.mimed, "mímica", "mímicas")} (${solved === 0 ? "ninguém acertou" : `a galera acertou ${solved}`})`);
  }
  return parts.join(" · ");
}

/** Fichinhas do SEU desempenho. */
export function myChips(s: Standing | undefined): string[] {
  if (!s) return [];
  const chips = [`⭐ ${s.score} pontos`, `🎯 ${n(num(s.guessed), "música acertada", "músicas acertadas")}`];
  if (num(s.mimed) > 0) chips.push(`🎭 ${n(s.mimed, "mímica", "mímicas")}`);
  if (num(s.solvedMimes) > 0) chips.push(`👏 ${n(s.solvedMimes, "mímica entendida", "mímicas entendidas")}`);
  if (num(s.failedMimes) > 0) chips.push(`🤷 ${n(s.failedMimes, "mímica que ninguém entendeu", "mímicas que ninguém entendeu")}`);
  if (num(s.wrong) > 0) chips.push(`❌ ${n(s.wrong, "chute errado", "chutes errados")}`);
  return chips;
}
