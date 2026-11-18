// Montagem de partidas de Forca nos testes: quem escolhe, a palavra, quem já chutou o quê e de
// quem é a vez exatamente como pedido. Não é arquivo de teste — é importado pelos *.test.ts.

import { ForcaState, Guess, MAX_LIVES, chooseWord, createLobby, joinLobby, startGame } from "./engine";
import { normalize } from "./words";

export function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

export const ids = (n: number) => ["a", "b", "c", "d"].slice(0, n);

export function lobby(players: string[]): ForcaState {
  let s = createLobby();
  for (const id of players) s = must(joinLobby(s, { id, name: id.toUpperCase() })).state;
  return s;
}

export interface ChoosingSpec {
  players?: string[];
  rounds?: number;
  /** Em que palavra da partida estamos (o escolhedor gira: palavra 1 = 1º jogador, 2 = 2º...). */
  roundNo?: number;
  now?: number;
}

/** Partida na fase "choosing": alguém precisa digitar a palavra. */
export function choosing(spec: ChoosingSpec = {}): ForcaState {
  const players = spec.players ?? ids(3);
  let s = must(startGame({ ...lobby(players), rounds: spec.rounds ?? 5 }, spec.now ?? 0)).state;
  const n = spec.roundNo ?? 1;
  if (n > 1) {
    const idx = (n - 1) % players.length;
    s = { ...s, roundNo: n, chooserId: players[idx], turn: idx };
  }
  return s;
}

export interface GameSpec extends ChoosingSpec {
  word: string;
  /** Letras já chutadas (certas ou erradas), pelo primeiro chutador. */
  guessed?: string[];
  lives?: number;
  /** Índice de quem chuta agora (padrão: o primeiro depois de quem escolheu). */
  turn?: number;
}

/** Partida na fase "playing" com a palavra exatamente como pedida. */
export function game(spec: GameSpec): ForcaState {
  const c = choosing(spec);
  const s = must(chooseWord(c, c.chooserId!, spec.word, spec.now ?? 0)).state;
  const first = s.players[s.turn].id;
  const norm = s.round!.norm;
  const guesses: Guess[] = (spec.guessed ?? []).map((l) => ({ letter: normalize(l), by: first, hits: [...norm].filter((ch) => ch === normalize(l)).length }));
  return { ...s, turn: spec.turn ?? s.turn, round: { ...s.round!, guesses, lives: spec.lives ?? MAX_LIVES } };
}
