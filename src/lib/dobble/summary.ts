// Textos do Dobble que mostram tempo e números da partida.

import type { Standing } from "./engine";

/** 1234 → "1,2 s". */
// Math.round em vez de toFixed: (0.85).toFixed(1) dá "0.8" (ponto flutuante); 850 ms tem que virar "0,9 s".
export const fmtSeconds = (ms: number) => `${(Math.round(ms / 100) / 10).toFixed(1).replace(".", ",")} s`;

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const num = (x: number | undefined) => x ?? 0;

/** Linha pequena de cada jogador no fim do jogo ("12 rodadas · ⚡ 0,8 s · 2 erros"). */
export function standingLine(s: Standing): string {
  const parts: string[] = [];
  if (num(s.won) > 0) parts.push(n(s.won, "rodada", "rodadas"));
  if (s.fastestMs != null) parts.push(`⚡ ${fmtSeconds(s.fastestMs)}`);
  if (num(s.wrong) > 0) parts.push(n(s.wrong, "erro", "erros"));
  return parts.join(" · ");
}

/** Fichinhas do SEU desempenho. */
export function myChips(s: Standing | undefined): string[] {
  if (!s) return [];
  const chips: string[] = [];
  if (s.fastestMs != null) chips.push(`⚡ melhor tempo ${fmtSeconds(s.fastestMs)}`);
  chips.push(`🏅 ${n(num(s.won), "rodada ganha", "rodadas ganhas")}`);
  if (num(s.wrong) > 0) chips.push(`❌ ${n(s.wrong, "erro", "erros")}`);
  return chips;
}
