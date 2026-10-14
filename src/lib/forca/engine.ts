// Regras da Forca (multiplayer) como funções puras sobre um ForcaState — mesmo
// molde dos outros jogos: o room server (party/forca.ts) é a autoridade e roda
// este código; a palavra secreta NUNCA sai do servidor enquanto a rodada está
// aberta (toView só manda o que já foi revelado).
//
// Regras:
//  • O servidor sorteia uma palavra por rodada (com a categoria de dica). A forca é
//    de TODOS: 6 vidas, e cada erro tira uma.
//  • Na sua vez, chute uma letra (ou a palavra inteira). Acertou a letra? +10 pontos por
//    vez que ela aparece. Errou? A mesa perde 1 vida. Nos dois casos a vez passa pro
//    próximo — ninguém "limpa" uma palavra sozinho enquanto os outros esperam.
//  • Chutar a palavra inteira: acertou, ganha +10 por letra ainda escondida (e a rodada
//    acaba); errou, a mesa perde 2 vidas.
//  • Quem completa a palavra (revelando a última letra ou acertando o chute) ganha +30.
//  • As vidas acabaram? A palavra é revelada e ninguém ganha o bônus.
//  • Passou de 25 s sem chutar, o servidor chuta uma letra por você.
//  • Depois de todas as rodadas, vence quem tem mais pontos.
//
// As letras são comparadas SEM acento: chutar "A" revela o "Ã" de AVIÃO.

import { ALPHABET, LETTER_ORDER, WORDS, WordEntry, normalize } from "./words";
import { TIMING } from "./timing";

export type BotLevel = "easy" | "medium" | "hard";
export type ForcaPhase = "lobby" | "playing" | "round_end" | "game_over";

export const BOT_PREFIX = "bot:";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_LIVES = 6;
/** Vidas que um chute errado da palavra inteira custa. */
export const WORD_PENALTY = 2;
export const LETTER_POINTS = 10;
export const FINISH_BONUS = 30;
export const ROUND_CHOICES = [3, 5, 8] as const;
export const DEFAULT_ROUNDS = 5;

type Rng = () => number;

export interface ForcaStats {
  /** Letras certas chutadas (cada chute que acertou). */
  hits: number;
  misses: number;
  /** Palavras que EU completei. */
  solved: number;
  /** Chutes de palavra inteira errados. */
  wordFails: number;
}
export const emptyStats = (): ForcaStats => ({ hits: 0, misses: 0, solved: 0, wordFails: 0 });

export interface ForcaPlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  score: number;
}

export interface Guess {
  letter: string;
  by: string;
  /** Quantas vezes a letra aparece na palavra (0 = errou). */
  hits: number;
  /** O servidor chutou por falta de tempo. */
  auto?: boolean;
}

export interface RoundState {
  n: number;
  /** A palavra com acento — SEGREDO do servidor até a rodada acabar. */
  word: string;
  /** A mesma sem acento (é com ela que se compara). */
  norm: string;
  category: string;
  guesses: Guess[];
  lives: number;
  status: "playing" | "won" | "lost";
  solvedBy: string | null;
}

export type ForcaEvent =
  | { t: "round"; n: number; category: string; length: number }
  | { t: "letter"; p: string; letter: string; hits: number; auto?: boolean }
  | { t: "word"; p: string; ok: boolean }
  | { t: "won"; p: string; points: number }
  | { t: "lost"; word: string };

export interface Standing extends ForcaStats {
  playerId: string;
  name: string;
  score: number;
}

export interface ForcaState {
  phase: ForcaPhase;
  players: ForcaPlayer[];
  hostId: string | null;
  /** Quantas palavras tem a partida. */
  rounds: number;
  roundNo: number;
  round: RoundState | null;
  usedWords: string[];
  /** Índice (em players) de quem chuta. */
  turn: number;
  /** Até quando (relógio do servidor, ms) a vez dessa pessoa vale; 0 = sem contagem. */
  turnDeadline: number;
  events: ForcaEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
  stats?: Record<string, ForcaStats>;
}

export type Result = { ok: true; state: ForcaState } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const ok = (state: ForcaState): Result => ({ ok: true, state });

export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);

export function createLobby(): ForcaState {
  return {
    phase: "lobby",
    players: [],
    hostId: null,
    rounds: DEFAULT_ROUNDS,
    roundNo: 0,
    round: null,
    usedWords: [],
    turn: 0,
    turnDeadline: 0,
    events: [],
    eventSeq: 0,
    winnerId: null,
    standings: null,
    gameNumber: 0,
    stats: {},
  };
}

// ── Lobby ──────────────────────────────────────────────────────────────────

function pickHost(players: ForcaPlayer[], current: string | null): string | null {
  if (players.some((p) => p.id === current && !p.bot)) return current;
  return players.find((p) => !p.bot)?.id ?? null;
}

const newPlayer = (id: string, name: string, avatarUrl: string | null | undefined, bot?: BotLevel): ForcaPlayer => ({
  id,
  name,
  avatarUrl: avatarUrl ?? null,
  bot,
  connected: true,
  score: 0,
});

export function joinLobby(state: ForcaState, who: { id: string; name: string; avatarUrl?: string | null }): Result {
  const existing = state.players.find((p) => p.id === who.id);
  if (existing) {
    return ok({
      ...state,
      players: state.players.map((p) => (p.id === who.id ? { ...p, name: who.name, avatarUrl: who.avatarUrl ?? null, connected: true } : p)),
      hostId: pickHost(state.players, state.hostId),
    });
  }
  if (state.phase !== "lobby") return fail("game_in_progress");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  const players = [...state.players, newPlayer(who.id, who.name, who.avatarUrl)];
  return ok({ ...state, players, hostId: pickHost(players, state.hostId) });
}

export function setPlayerConnected(state: ForcaState, id: string, connected: boolean): ForcaState {
  if (!state.players.some((p) => p.id === id)) return state;
  return { ...state, players: state.players.map((p) => (p.id === id && !p.bot ? { ...p, connected } : p)) };
}

/** Tira do lobby; numa partida rolando só marca como desconectado (um bot chuta por ele). */
export function removePlayer(state: ForcaState, id: string): ForcaState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
}

const BOT_NAMES = ["Robô Zeca", "Robô Bia", "Robô Tião", "Robô Dani", "Robô Juca", "Robô Lia", "Robô Nando", "Robô Mel"];

export function addBot(state: ForcaState, level: BotLevel): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  let n = 1;
  while (state.players.some((p) => p.id === `${BOT_PREFIX}${n}`)) n++;
  return ok({ ...state, players: [...state.players, newPlayer(`${BOT_PREFIX}${n}`, BOT_NAMES[(n - 1) % BOT_NAMES.length], null, level)] });
}

export function setBotLevel(state: ForcaState, botId: string, level: BotLevel): Result {
  if (!state.players.some((p) => p.id === botId && p.bot)) return fail("not_a_bot");
  return ok({ ...state, players: state.players.map((p) => (p.id === botId ? { ...p, bot: level } : p)) });
}

export function setRounds(state: ForcaState, rounds: number): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) return fail("bad_rounds");
  return ok({ ...state, rounds });
}

export function canStart(state: ForcaState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS;
}

// ── Peças do jogo ───────────────────────────────────────────────────────────

const wrap = (n: number, i: number) => ((i % n) + n) % n;

export const currentPlayer = (state: ForcaState): ForcaPlayer | undefined => state.players[state.turn];

/** Letras já chutadas na rodada (sem acento, maiúsculas). */
export const triedLetters = (round: RoundState): Set<string> => new Set(round.guesses.map((g) => g.letter));

/** Quantas letras da palavra ainda estão escondidas (contando cada ocorrência). */
export function hiddenCount(round: RoundState): number {
  const tried = triedLetters(round);
  return [...round.norm].filter((l) => !tried.has(l)).length;
}

/**
 * A palavra como QUALQUER UM vê: a letra (com acento) onde já foi revelada, null onde ainda
 * está escondida. É a única janela pra palavra secreta — a visão e os bots usam só isso.
 */
export function publicPattern(round: RoundState, revealAll = false): (string | null)[] {
  const tried = triedLetters(round);
  return [...round.word].map((ch, i) => (revealAll || tried.has(round.norm[i]) ? ch : null));
}

function pickWord(used: string[], rng: Rng): WordEntry {
  const fresh = WORDS.filter((w) => !used.includes(w.word));
  const pool = fresh.length > 0 ? fresh : WORDS;
  return pool[Math.floor(rng() * pool.length)];
}

function beginRound(state: ForcaState, n: number, rng: Rng, now: number, extra: Partial<ForcaState> = {}): ForcaState {
  const entry = pickWord(state.usedWords, rng);
  const round: RoundState = {
    n,
    word: entry.word,
    norm: normalize(entry.word),
    category: entry.category,
    guesses: [],
    lives: MAX_LIVES,
    status: "playing",
    solvedBy: null,
  };
  return {
    ...state,
    ...extra,
    phase: "playing",
    roundNo: n,
    round,
    usedWords: [...state.usedWords, entry.word],
    // Quem abre a rodada gira: rodada 1 = 1º jogador, rodada 2 = 2º...
    turn: (n - 1) % state.players.length,
    turnDeadline: now + TIMING.TURN_MS,
    events: [{ t: "round", n, category: entry.category, length: round.norm.length }],
    eventSeq: state.eventSeq + 1,
  };
}

export function startGame(state: ForcaState, rng: Rng = Math.random, now = 0): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");
  return ok(
    beginRound(
      {
        ...state,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        usedWords: [],
        winnerId: null,
        standings: null,
        gameNumber: state.gameNumber + 1,
        stats: {},
      },
      1,
      rng,
      now
    )
  );
}

/** Volta pro lobby depois da partida (revanche), mantendo bots e quem segue conectado. */
export function returnToLobby(state: ForcaState): ForcaState {
  const players = state.players.filter((p) => p.bot || p.connected).map((p) => ({ ...p, score: 0 }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    roundNo: 0,
    round: null,
    turn: 0,
    turnDeadline: 0,
    events: [],
    winnerId: null,
    standings: null,
  };
}

const bump = (stats: Record<string, ForcaStats> | undefined, id: string, field: keyof ForcaStats, by = 1) => ({
  ...stats,
  [id]: { ...(stats?.[id] ?? emptyStats()), [field]: (stats?.[id]?.[field] ?? 0) + by },
});

const addScore = (players: ForcaPlayer[], id: string, points: number) => players.map((p) => (p.id === id ? { ...p, score: p.score + points } : p));

// ── Jogo ───────────────────────────────────────────────────────────────────

/** Chute de uma letra (a vez é de quem chuta). `auto` = o servidor chutou por falta de tempo. */
export function guessLetter(state: ForcaState, playerId: string, rawLetter: string, now: number, auto = false): Result {
  if (state.phase !== "playing" || !state.round) return fail("not_playing");
  const me = currentPlayer(state);
  if (!me || me.id !== playerId) return fail("not_your_turn");
  const letter = normalize(rawLetter);
  if (letter.length !== 1 || !ALPHABET.includes(letter)) return fail("bad_letter");
  const round = state.round;
  if (triedLetters(round).has(letter)) return fail("already_guessed");

  const hits = [...round.norm].filter((l) => l === letter).length;
  const guess: Guess = { letter, by: playerId, hits, ...(auto ? { auto: true } : {}) };
  const guesses = [...round.guesses, guess];
  const events: ForcaEvent[] = [{ t: "letter", p: playerId, letter, hits, ...(auto ? { auto: true } : {}) }];
  let players = state.players;
  let stats = state.stats;
  const next: RoundState = { ...round, guesses };

  if (hits > 0) {
    players = addScore(players, playerId, hits * LETTER_POINTS);
    stats = bump(stats, playerId, "hits");
    if (hiddenCount(next) === 0) {
      // Completou a palavra.
      players = addScore(players, playerId, FINISH_BONUS);
      stats = bump(stats, playerId, "solved");
      events.push({ t: "won", p: playerId, points: hits * LETTER_POINTS + FINISH_BONUS });
      return ok({ ...state, players, stats, round: { ...next, status: "won", solvedBy: playerId }, phase: "round_end", turnDeadline: 0, events, eventSeq: state.eventSeq + 1 });
    }
    // Acertou a letra: pontua e a vez passa (a contagem do tempo recomeça pro próximo).
    return ok({
      ...state,
      players,
      stats,
      round: next,
      turn: wrap(state.players.length, state.turn + 1),
      turnDeadline: now + TIMING.TURN_MS,
      events,
      eventSeq: state.eventSeq + 1,
    });
  }

  // Errou: a mesa perde uma vida e a vez passa.
  stats = bump(stats, playerId, "misses");
  const lives = round.lives - 1;
  if (lives <= 0) {
    events.push({ t: "lost", word: round.word });
    return ok({ ...state, stats, round: { ...next, lives: 0, status: "lost" }, phase: "round_end", turnDeadline: 0, events, eventSeq: state.eventSeq + 1 });
  }
  return ok({
    ...state,
    stats,
    round: { ...next, lives },
    turn: wrap(state.players.length, state.turn + 1),
    turnDeadline: now + TIMING.TURN_MS,
    events,
    eventSeq: state.eventSeq + 1,
  });
}

/** Chute da palavra inteira: acerta e leva o resto; erra e a mesa perde 2 vidas. */
export function guessWord(state: ForcaState, playerId: string, rawWord: string, now: number): Result {
  if (state.phase !== "playing" || !state.round) return fail("not_playing");
  const me = currentPlayer(state);
  if (!me || me.id !== playerId) return fail("not_your_turn");
  const word = normalize(rawWord);
  if (word.length < 2 || word.length > 30) return fail("bad_word");
  const round = state.round;

  if (word === round.norm) {
    const points = hiddenCount(round) * LETTER_POINTS + FINISH_BONUS;
    const events: ForcaEvent[] = [
      { t: "word", p: playerId, ok: true },
      { t: "won", p: playerId, points },
    ];
    return ok({
      ...state,
      players: addScore(state.players, playerId, points),
      stats: bump(state.stats, playerId, "solved"),
      round: { ...round, status: "won", solvedBy: playerId },
      phase: "round_end",
      turnDeadline: 0,
      events,
      eventSeq: state.eventSeq + 1,
    });
  }

  const lives = Math.max(0, round.lives - WORD_PENALTY);
  const events: ForcaEvent[] = [{ t: "word", p: playerId, ok: false }];
  const stats = bump(state.stats, playerId, "wordFails");
  if (lives === 0) {
    events.push({ t: "lost", word: round.word });
    return ok({ ...state, stats, round: { ...round, lives: 0, status: "lost" }, phase: "round_end", turnDeadline: 0, events, eventSeq: state.eventSeq + 1 });
  }
  return ok({
    ...state,
    stats,
    round: { ...round, lives },
    turn: wrap(state.players.length, state.turn + 1),
    turnDeadline: now + TIMING.TURN_MS,
    events,
    eventSeq: state.eventSeq + 1,
  });
}

/** Estourou o tempo da vez: chuta uma letra (das mais comuns, com um pouco de sorte) por quem não jogou. */
export function timeoutTurn(state: ForcaState, rng: Rng, now: number): Result {
  if (state.phase !== "playing" || !state.round) return fail("not_playing");
  const me = currentPlayer(state);
  if (!me) return fail("not_playing");
  const tried = triedLetters(state.round);
  const free = [...LETTER_ORDER].filter((l) => !tried.has(l));
  if (free.length === 0) return fail("no_letters");
  // Entre as 5 mais frequentes que ainda não saíram.
  const pick = free[Math.floor(rng() * Math.min(5, free.length))];
  return guessLetter(state, me.id, pick, now, true);
}

/** Da rodada parada na mesa pra próxima — ou pro fim do jogo. */
export function advanceRound(state: ForcaState, rng: Rng, now: number): Result {
  if (state.phase !== "round_end" || !state.round) return fail("not_round_end");
  if (state.roundNo < state.rounds) return ok(beginRound(state, state.roundNo + 1, rng, now));
  const standings: Standing[] = state.players
    .map((p) => ({ ...emptyStats(), ...state.stats?.[p.id], playerId: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score || b.solved - a.solved || b.hits - a.hits);
  return ok({ ...state, phase: "game_over", turnDeadline: 0, winnerId: standings[0].playerId, standings, events: [], eventSeq: state.eventSeq + 1 });
}

// ── O que os clientes enxergam ─────────────────────────────────────────────

export interface ForcaPlayerView {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  score: number;
}

export interface ForcaView {
  phase: ForcaPhase;
  players: ForcaPlayerView[];
  hostId: string | null;
  rounds: number;
  roundNo: number;
  category: string | null;
  /** Letra (com acento) onde já foi revelada, null onde está escondida. Vazio fora de rodada. */
  pattern: (string | null)[];
  guesses: Guess[];
  lives: number;
  maxLives: number;
  status: "playing" | "won" | "lost" | null;
  solvedBy: string | null;
  /** A palavra inteira — só depois que a rodada termina. */
  word: string | null;
  turn: number;
  turnDeadline: number;
  events: ForcaEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
}

export function toView(state: ForcaState): ForcaView {
  const round = state.round;
  const finished = !!round && round.status !== "playing";
  // `lost`/`round` events carry the word: só entram depois de a rodada acabar.
  const events = state.events.map((e) => (e.t === "lost" && !finished ? ({ t: "lost", word: "" } as ForcaEvent) : e));
  return {
    phase: state.phase,
    players: state.players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, bot: p.bot, connected: p.connected, score: p.score })),
    hostId: state.hostId,
    rounds: state.rounds,
    roundNo: state.roundNo,
    category: round ? round.category : null,
    pattern: round ? publicPattern(round, finished) : [],
    guesses: round ? round.guesses : [],
    lives: round ? round.lives : MAX_LIVES,
    maxLives: MAX_LIVES,
    status: round ? round.status : null,
    solvedBy: round ? round.solvedBy : null,
    word: round && finished ? round.word : null,
    turn: state.turn,
    turnDeadline: state.turnDeadline,
    events,
    eventSeq: state.eventSeq,
    winnerId: state.winnerId,
    standings: state.standings,
    gameNumber: state.gameNumber,
  };
}
