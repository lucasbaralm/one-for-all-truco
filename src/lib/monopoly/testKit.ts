// Montagem de partidas de Monopoly / Banco Imobiliário nos testes: dados, dono das casas, dinheiro e
// baralhos exatamente como pedido (em vez de depender de sorteio). Não é arquivo de teste — é
// importado pelos *.test.ts.

import {
  BOT_PREFIX,
  MonoState,
  Result,
  addBot,
  createLobby,
  joinLobby,
  roll,
  startGame,
} from "./engine";
import { DeckId, EditionId, Square, getEdition } from "./editions";

export function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

export const ids = (n: number) => ["a", "b", "c", "d", "e", "f"].slice(0, n);

/** Faces dos dados na ordem em que forem pedidas (cada rng() vira UMA face). */
export function faces(...f: number[]): () => number {
  let i = 0;
  return () => (f[i++ % f.length] - 1) / 6 + 0.01;
}

export function lobby(edition: EditionId, players: string[]): MonoState {
  let s = createLobby(edition);
  for (const id of players) s = must(joinLobby(s, { id, name: id.toUpperCase() })).state;
  return s;
}

export interface GameSpec {
  edition?: EditionId;
  players?: string[];
  /** Duração em rodadas (0 = até a falência). */
  limit?: number;
}

/** Partida em andamento, a vez é do primeiro jogador e os baralhos estão em ordem (0, 1, 2...). */
export function game(spec: GameSpec = {}): MonoState {
  const edition = spec.edition ?? "monopoly";
  let s = lobby(edition, spec.players ?? ids(3));
  // direto no estado: os testes usam limites curtos (1, 2 rodadas) que a sala de verdade não oferece
  if (spec.limit) s = { ...s, settings: { limit: spec.limit } };
  s = must(startGame(s, () => 0)).state;
  const ed = getEdition(edition);
  return {
    ...s,
    turn: 0,
    decks: { chance: ed.decks.chance.map((_, i) => i), chest: ed.decks.chest.map((_, i) => i) },
    events: [],
  };
}

/** Partida com bots (todos menos o primeiro). */
export function lobbyWithBots(edition: EditionId, humans: string[], bots: number): MonoState {
  let s = lobby(edition, humans);
  for (let i = 0; i < bots; i++) s = must(addBot(s, "medium")).state;
  return s;
}

export const botIdOf = (n: number) => `${BOT_PREFIX}${n}`;

// ── Edição pontual do estado ───────────────────────────────────────────────

export function withPlayer(s: MonoState, id: string, patch: Partial<MonoState["players"][number]>): MonoState {
  return { ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}
export const withCash = (s: MonoState, id: string, cash: number) => withPlayer(s, id, { cash });
export const at = (s: MonoState, id: string, pos: number) => withPlayer(s, id, { pos });

/** Dá a casa a alguém (e, opcionalmente, casas/hipoteca). */
export function own(s: MonoState, idx: number, owner: string | null, patch: { houses?: number; mortgaged?: boolean } = {}): MonoState {
  return { ...s, props: s.props.map((p, i) => (i === idx ? { ...p!, owner, houses: patch.houses ?? 0, mortgaged: patch.mortgaged ?? false } : p)) };
}
export function ownAll(s: MonoState, owner: string, idxs: number[], patch: { houses?: number } = {}): MonoState {
  return idxs.reduce((acc, i) => own(acc, i, owner, patch), s);
}

export const withDeck = (s: MonoState, deck: DeckId, order: number[]): MonoState => ({ ...s, decks: { ...s.decks, [deck]: order } });

/** Índice da primeira carta do baralho cujo efeito bate com `pred`. */
export function cardIndex(edition: EditionId, deck: DeckId, pred: (fx: ReturnType<typeof getEdition>["decks"][DeckId][number]["fx"]) => boolean): number {
  const i = getEdition(edition).decks[deck].findIndex((c) => pred(c.fx));
  if (i < 0) throw new Error("carta não encontrada");
  return i;
}

/** Posição de uma casa pelo nome. */
export function squareIndex(edition: EditionId, name: string): number {
  const i = getEdition(edition).squares.findIndex((sq) => "name" in sq && sq.name === name);
  if (i < 0) throw new Error(`casa não encontrada: ${name}`);
  return i;
}

export const squareOf = (edition: EditionId, i: number): Square => getEdition(edition).squares[i];

/** Dois dados (a, b) que somam `dist`, sem dupla quando dá (2 e 12 só existem como dupla). */
export function pairFor(dist: number): [number, number] {
  if (dist < 2 || dist > 12) throw new Error("distância fora de 2–12");
  if (dist === 2) return [1, 1];
  if (dist === 12) return [6, 6];
  const a = Math.floor(dist / 2);
  const b = dist - a;
  // dist par: a === b (dupla) → 1 a menos, 1 a mais
  return a === b ? [a - 1, b + 1] : [a, b];
}

/** Rola de modo que a peça ande `dist` casas. */
export function rollBy(s: MonoState, actor: string, dist: number, rng?: () => number): Result {
  const [a, b] = pairFor(dist);
  return roll(s, actor, rng ?? faces(a, b));
}

/** Rola uma dupla (v, v). */
export const rollDouble = (s: MonoState, actor: string, v: number) => roll(s, actor, faces(v, v));
