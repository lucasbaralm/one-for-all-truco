// Textos do Uno que mostram os números da partida.

import type { Standing } from "./engine";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const num = (x: number | undefined) => x ?? 0;

/** Resultado de cada jogador na tela de fim de jogo: "venceu" ou quantas cartas sobraram. */
export function resultLabel(s: Standing, rank: number): string {
  if (rank === 0) return "zerou a mão";
  return `${n(s.cards, "carta", "cartas")} (${s.handPoints} pts)`;
}

/** Linha pequena de cada jogador ("jogou 12 · comprou 5 · pegou 1"). */
export function standingLine(s: Standing): string {
  const parts = [`jogou ${num(s.played)}`, `comprou ${num(s.drawn)}`];
  if (num(s.caught) > 0) parts.push(`pegou ${num(s.caught)}`);
  if (num(s.forgot) > 0) parts.push(`esqueceu o UNO ${n(s.forgot, "vez", "vezes")}`);
  return parts.join(" · ");
}

/** Fichinhas do SEU desempenho. */
export function myChips(s: Standing | undefined): string[] {
  if (!s) return [];
  const chips = [`🃏 ${n(num(s.played), "carta jogada", "cartas jogadas")}`, `📥 ${n(num(s.drawn), "carta comprada", "cartas compradas")}`];
  if (num(s.caught) > 0) chips.push(`🚨 pegou ${n(s.caught, "jogador", "jogadores")} sem UNO`);
  if (num(s.forgot) > 0) chips.push(`😳 esqueceu o UNO ${n(s.forgot, "vez", "vezes")}`);
  return chips;
}
