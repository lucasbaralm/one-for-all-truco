// Texto das estatísticas na tela de fim de jogo do Ludo.

import type { Standing } from "./engine";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
// Partidas salvas antes das estatísticas existirem não têm esses números.
const num = (x: number | undefined) => x ?? 0;

/** Linha pequena de cada jogador: só o que aconteceu de fato ("💥 2 capturas · 😵 1 peça perdida"). */
export function standingLine(s: Standing): string {
  const parts: string[] = [];
  if (num(s.captures) > 0) parts.push(`💥 ${n(s.captures, "captura", "capturas")}`);
  if (num(s.captured) > 0) parts.push(`😵 ${n(s.captured, "peça perdida", "peças perdidas")}`);
  return parts.join(" · ");
}

/** Fichinhas do SEU desempenho. */
export function myChips(s: Standing | undefined): string[] {
  if (!s || num(s.rolls) === 0) return [];
  const chips = [`🎲 ${n(s.rolls, "rolagem", "rolagens")}`];
  if (num(s.sixes) > 0) chips.push(`6️⃣ ${n(s.sixes, "seis", "seis")}`);
  if (num(s.captures) > 0) chips.push(`💥 ${n(s.captures, "captura", "capturas")}`);
  if (num(s.captured) > 0) chips.push(`😵 ${n(s.captured, "peça perdida", "peças perdidas")}`);
  return chips;
}
