// IA dos bots do Uno. Três níveis:
//  • easy   — joga qualquer carta possível, ao acaso (e às vezes esquece o UNO).
//  • medium — prefere carta comum da cor em que tem mais cartas e guarda o
//             Coringa pro fim; escolhe a cor mais frequente na mão.
//  • hard   — o mesmo, mais: se o próximo está com poucas cartas, ataca (+2, +4,
//             Pular, Inverter), mira a cor que o resto da mão pede e nunca esquece o UNO.
//
// O bot só olha o que um jogador de verdade enxerga + a própria mão.

import { UNO_COLORS, UnoColor, cardOf, isWild } from "./cards";
import { BotLevel, UnoState, currentPlayer, legalCards } from "./engine";
import { BOT_FORGET_UNO } from "./timing";

type Rng = () => number;

export type BotAction = { type: "play"; card: number; color?: UnoColor; uno: boolean } | { type: "draw" } | { type: "pass" };

/** A cor em que a mão (já sem a carta jogada) tem mais cartas; sem nenhuma colorida, sorteia. */
export function bestColor(hand: number[], rng: Rng): UnoColor {
  const count = new Map<UnoColor, number>(UNO_COLORS.map((c) => [c, 0]));
  for (const id of hand) {
    const c = cardOf(id).color;
    if (c) count.set(c, (count.get(c) ?? 0) + 1);
  }
  const best = Math.max(...count.values());
  if (best === 0) return UNO_COLORS[Math.floor(rng() * UNO_COLORS.length)];
  const top = UNO_COLORS.filter((c) => count.get(c) === best);
  return top[Math.floor(rng() * top.length)];
}

function nextHandSize(state: UnoState): number {
  const n = state.players.length;
  return state.players[(((state.turn + state.direction) % n) + n) % n].hand.length;
}

/** Nota de uma carta jogável pra esse bot (maior = melhor). */
function score(state: UnoState, hand: number[], id: number, level: BotLevel): number {
  const card = cardOf(id);
  const rest = hand.filter((h) => h !== id);
  const sameColor = card.color ? rest.filter((h) => cardOf(h).color === card.color).length : 0;
  let s = 0;
  if (isWild(card)) s -= 6; // guarda o Coringa
  else s += sameColor; // esvazia a cor em que mais tem
  if (card.kind !== "number" && !isWild(card)) s += 0.5;
  if (level === "hard") {
    const attack = nextHandSize(state) <= 2;
    if (attack && (card.kind === "draw2" || card.kind === "wild4")) s += 12;
    else if (attack && (card.kind === "skip" || card.kind === "reverse")) s += 7;
    // No fim da partida o Coringa é pra usar: com 2 cartas, ele garante a saída.
    if (isWild(card) && hand.length <= 2) s += 9;
  }
  return s;
}

export function chooseBotAction(state: UnoState, botId: string, level: BotLevel, rng: Rng = Math.random): BotAction {
  const me = currentPlayer(state);
  if (!me || me.id !== botId) return { type: "pass" };

  const legal = legalCards(state, botId);
  // Comprou uma carta jogável: joga (o fácil às vezes passa).
  if (state.pendingDrawn !== null) {
    if (legal.length === 0 || (level === "easy" && rng() < 0.3)) return { type: "pass" };
  } else if (legal.length === 0) {
    return { type: "draw" };
  }

  let pick: number;
  if (level === "easy") {
    pick = legal[Math.floor(rng() * legal.length)];
  } else {
    // melhor nota; empate sorteia
    const scored = legal.map((id) => ({ id, s: score(state, me.hand, id, level) }));
    const best = Math.max(...scored.map((x) => x.s));
    const top = scored.filter((x) => x.s === best);
    pick = top[Math.floor(rng() * top.length)].id;
  }

  const remaining = me.hand.filter((h) => h !== pick);
  const card = cardOf(pick);
  const color = isWild(card) ? bestColor(remaining, rng) : undefined;
  // Vai ficar com 1 carta: grita UNO junto com a jogada (a menos que "esqueça").
  const uno = remaining.length === 1 && rng() >= BOT_FORGET_UNO[level];
  return { type: "play", card: pick, color, uno };
}
