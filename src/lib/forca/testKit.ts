// Montagem de partidas de Forca nos testes: a palavra, quem já chutou o quê e de
// quem é a vez exatamente como pedido (em vez de depender de sorteio). Não é
// arquivo de teste — é importado pelos *.test.ts.

import { mulberry32 } from "@/lib/random";
import { ForcaState, Guess, MAX_LIVES, createLobby, joinLobby, startGame } from "./engine";
import { TIMING } from "./timing";
import { normalize } from "./words";

export function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

export const ids = (n: number) => ["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, n);

export function lobby(players: string[]): ForcaState {
  let s = createLobby();
  for (const id of players) s = must(joinLobby(s, { id, name: id.toUpperCase() })).state;
  return s;
}

export interface GameSpec {
  word: string;
  category?: string;
  players?: string[];
  /** Letras já chutadas (certas ou erradas), por "a". */
  guessed?: string[];
  lives?: number;
  turn?: number;
  now?: number;
  rounds?: number;
  roundNo?: number;
}

/** Partida na fase "playing" com a palavra exatamente como pedida. */
export function game(spec: GameSpec): ForcaState {
  const base = must(startGame({ ...lobby(spec.players ?? ids(2)), rounds: spec.rounds ?? 5 }, mulberry32(1), spec.now ?? 0)).state;
  const norm = normalize(spec.word);
  const guesses: Guess[] = (spec.guessed ?? []).map((l) => ({ letter: l, by: "a", hits: [...norm].filter((c) => c === l).length }));
  const roundNo = spec.roundNo ?? 1;
  const category = spec.category ?? "Teste";
  return {
    ...base,
    roundNo,
    // o evento de abertura segue a palavra pedida, não a sorteada por startGame
    events: [{ t: "round", n: roundNo, category, length: norm.length }],
    round: { ...base.round!, n: roundNo, word: spec.word, norm, category, guesses, lives: spec.lives ?? MAX_LIVES },
    usedWords: [spec.word],
    turn: spec.turn ?? 0,
    turnDeadline: (spec.now ?? 0) + TIMING.TURN_MS,
  };
}
