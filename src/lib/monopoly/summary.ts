// Textos do Monopoly / Banco Imobiliário que mostram os números da partida.

import type { EditionId } from "./editions";
import type { Standing } from "./engine";
import { money } from "./labels";

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const num = (x: number | undefined) => x ?? 0;

/** Resultado de cada jogador na tela de fim de jogo: o patrimônio, ou "faliu". */
export function resultLabel(s: Standing, rank: number, edition: EditionId): string {
  if (s.bankrupt && rank > 0) return "faliu";
  return `patrimônio ${money(edition, s.netWorth)}`;
}

/** Linha pequena de cada jogador ("12 propriedades · 3 construções · aluguel recebido $450"). */
export function standingLine(s: Standing, edition: EditionId): string {
  const parts = [n(num(s.props), "propriedade", "propriedades")];
  if (num(s.buildings) > 0) parts.push(n(s.buildings, "construção", "construções"));
  if (num(s.rentIn) > 0) parts.push(`aluguel recebido ${money(edition, s.rentIn)}`);
  return parts.join(" · ");
}

/** Fichinhas do SEU desempenho. */
export function myChips(s: Standing | undefined, edition: EditionId): string[] {
  if (!s) return [];
  const chips = [`🏠 ${n(num(s.props), "propriedade", "propriedades")}`];
  if (num(s.buildings) > 0) chips.push(`🏗️ ${n(s.buildings, "construção", "construções")}`);
  if (num(s.rentIn) > 0) chips.push(`💰 aluguel recebido ${money(edition, s.rentIn)}`);
  if (num(s.rentOut) > 0) chips.push(`💸 aluguel pago ${money(edition, s.rentOut)}`);
  if (num(s.doubles) > 0) chips.push(`🎲 ${n(s.doubles, "dupla", "duplas")}`);
  if (num(s.jailed) > 0) chips.push(`🚔 preso ${n(s.jailed, "vez", "vezes")}`);
  if (num(s.trades) > 0) chips.push(`🤝 ${n(s.trades, "troca", "trocas")}`);
  return chips;
}
