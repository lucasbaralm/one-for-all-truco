// Montagem de partidas de Mímica nos testes: quem faz a mímica, qual música saiu na carta e em que
// pé está o turno, exatamente como pedido. Não é arquivo de teste — é importado pelos *.test.ts.

import { SONGS, Song } from "./catalog";
import { MimicaState, createLobby, joinLobby, pickSong, startGame } from "./engine";

export function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

export const ids = (n: number) => ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, n);

/** Gerador de "sorte" que repete a lista dada (valores em [0,1)). */
export const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

export const songNamed = (title: string): Song => {
  const song = SONGS.find((s) => s.title === title);
  if (!song) throw new Error(`música fora do catálogo: ${title}`);
  return song;
};

export function lobby(players: string[]): MimicaState {
  let s = createLobby();
  for (const id of players) s = must(joinLobby(s, { id, name: id.toUpperCase() })).state;
  return s;
}

export interface TurnSpec {
  players?: string[];
  rounds?: number;
  rng?: () => number;
  now?: number;
  /** Em que mímica da partida estamos (o rodízio: 1 = 1º jogador, 2 = 2º...). */
  turnNo?: number;
  /** Música que precisa estar na carta (entra no lugar da primeira opção se não saiu). */
  title?: string;
}

/** Partida na fase "picking": quem faz a mímica ainda não escolheu da carta. */
export function picking(spec: TurnSpec = {}): MimicaState {
  const players = spec.players ?? ids(3);
  let s = must(startGame({ ...lobby(players), rounds: spec.rounds ?? 2 }, spec.rng ?? (() => 0.5), spec.now ?? 0)).state;
  const n = spec.turnNo ?? 1;
  if (n > 1) s = { ...s, turnNo: n, turn: { ...s.turn!, n, mimerId: players[(n - 1) % players.length] } };
  if (spec.title) {
    const song = songNamed(spec.title);
    if (!s.turn!.card.includes(song.id)) s = { ...s, turn: { ...s.turn!, card: [song.id, ...s.turn!.card.slice(1)] } };
  }
  return s;
}

export interface MimeSpec extends TurnSpec {
  /** Quando a mímica começa (relógio do servidor). */
  startedAt?: number;
}

/** Partida na fase "miming" com a música pedida (padrão: a 1ª da carta). */
export function miming(spec: MimeSpec = {}): MimicaState {
  const p = picking(spec);
  const song = spec.title ? songNamed(spec.title) : SONGS[p.turn!.card[0]];
  return must(pickSong(p, p.turn!.mimerId, song.id, spec.startedAt ?? spec.now ?? 0)).state;
}
