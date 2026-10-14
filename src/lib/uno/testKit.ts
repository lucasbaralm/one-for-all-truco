// Montagem de partidas de Uno nos testes: mãos, topo e vez exatamente como pedido
// (em vez de depender de sorteio). Não é arquivo de teste — é importado pelos *.test.ts.

import { DECK, UnoColor, UnoKind, cardOf } from "./cards";
import { UnoState, createLobby, joinLobby, startGame } from "./engine";

export const find = (color: UnoColor | null, kind: UnoKind, value: number | null = null, nth = 0): number =>
  DECK.filter((c) => c.color === color && c.kind === kind && c.value === value)[nth].id;

export function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

export const ids = (n: number) => ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, n);

export function lobby(players: string[]): UnoState {
  let s = createLobby();
  for (const id of players) s = must(joinLobby(s, { id, name: id.toUpperCase() })).state;
  return s;
}

export interface GameSpec {
  /** Mão de cada jogador (o que não for dito começa com 7 cartas quaisquer). */
  hands: Record<string, number[]>;
  top: number;
  /** Cor valendo (padrão: a do topo). */
  color?: UnoColor;
  turn?: number;
  direction?: 1 | -1;
  /** Monte de compra (a próxima carta é a ÚLTIMA). Padrão: todas as cartas que sobraram. */
  draw?: number[];
}

/** Partida em andamento com as mãos/topo/vez dados; todas as cartas continuam existindo (monte = o resto). */
export function game(spec: GameSpec): UnoState {
  const players = Object.keys(spec.hands);
  const given = [...Object.values(spec.hands).flat(), spec.top];
  if (new Set(given).size !== given.length) throw new Error("teste usou a MESMA carta duas vezes (mão/topo)");
  const started = must(startGame(lobby(players), () => 0)).state;
  const used = new Set([...Object.values(spec.hands).flat(), spec.top]);
  const rest = DECK.map((c) => c.id).filter((id) => !used.has(id));
  return {
    ...started,
    players: started.players.map((p) => ({ ...p, hand: spec.hands[p.id], unoCalled: false })),
    turn: spec.turn ?? 0,
    direction: spec.direction ?? 1,
    discard: [spec.top],
    draw: spec.draw ?? rest,
    color: spec.color ?? cardOf(spec.top).color ?? "red",
    pendingDrawn: null,
    exposed: null,
    events: [],
    stats: {},
  };
}

/** Todas as cartas do jogo (mãos + monte + descarte): sempre as 108, sem repetir. */
export const allCards = (s: UnoState) => [...s.players.flatMap((p) => p.hand), ...s.draw, ...s.discard];
