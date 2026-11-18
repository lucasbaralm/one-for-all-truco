// Regras da Forca (multiplayer, de 2 a 4 pessoas) como funções puras sobre um ForcaState — mesmo
// molde dos outros jogos: o room server (party/forca.ts) é a autoridade e roda este código.
//
// Como se joga:
//  • A cada rodada UMA pessoa escolhe a palavra (ou frase) digitando — sem categoria: a dica a
//    galera fala na call. As outras tentam acertar, chutando letras na sua vez, e dividem o MESMO
//    boneco: cada erro desenha mais uma parte (cabeça, tronco, braços, pernas, olhos, nariz, boca
//    e, por último, o chapéu — com o chapéu a forca fecha).
//  • Letra certa: +10 pontos por vez que ela aparece. Letra errada: o boneco ganha uma parte.
//    A vez passa pro próximo a cada chute, acertando ou errando.
//  • Chute da palavra inteira: acertou, +10 por letra que ainda estava escondida (e a rodada
//    acaba); errou, o boneco ganha DUAS partes.
//  • Quem completa a palavra (última letra ou chute certo) ganha +30.
//  • Quem escolheu ganha 10 por parte do boneco que a mesa precisou desenhar pra descobrir — palavra
//    difícil paga, mas só se for possível acertar: se o boneco fechar, o escolhedor não ganha nada.
//  • Cada um escolhe uma vez por volta (na ordem da sala). Depois das rodadas, vence quem tem mais pontos.
//
// A palavra NUNCA sai do servidor enquanto a rodada está aberta (toView só mostra o que já foi
// revelado — e a palavra inteira pra quem escolheu).

import { ALPHABET, LETTER_ORDER, MAX_WORD_CHARS, normalize, parseWord } from "./words";
import { TIMING } from "./timing";

export type ForcaPhase = "lobby" | "choosing" | "playing" | "round_end" | "game_over";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Partes do boneco: cabeça, tronco, 2 braços, 2 pernas, olhos, nariz, boca e chapéu. */
export const MAX_LIVES = 10;
/** Partes que um chute errado da palavra inteira desenha. */
export const WORD_PENALTY = 2;
export const LETTER_POINTS = 10;
export const FINISH_BONUS = 30;
/** Pontos do escolhedor por parte do boneco desenhada, quando a mesa acerta a palavra. */
export const CHOOSER_POINTS_PER_ERROR = 10;
export const ROUND_CHOICES = [1, 2, 3, 4, 5] as const;
export const DEFAULT_ROUNDS = 3;
/** Muda quando o formato do estado salvo muda (uma sala antiga volta pro lobby em vez de quebrar). */
export const FORCA_VERSION = 2;

type Rng = () => number;

export interface ForcaStats {
  /** Letras certas chutadas (cada chute que acertou). */
  hits: number;
  misses: number;
  /** Palavras que EU completei como chutador. */
  solved: number;
  /** Chutes de palavra inteira errados. */
  wordFails: number;
  /** Palavras que EU escolhi. */
  chosen: number;
  /** Palavras que EU escolhi e a mesa não descobriu. */
  stumped: number;
}
export const emptyStats = (): ForcaStats => ({ hits: 0, misses: 0, solved: 0, wordFails: 0, chosen: 0, stumped: 0 });

export interface ForcaPlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
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
  /** A palavra/frase com acento — SEGREDO do servidor (e de quem escolheu) até a rodada acabar. */
  word: string;
  /** Alinhada com `word`: a letra sem acento em cada caractere, " " nos espaços. */
  norm: string;
  guesses: Guess[];
  /** Partes do boneco que ainda faltam desenhar (de MAX_LIVES a 0). */
  lives: number;
  status: "playing" | "won" | "lost";
  solvedBy: string | null;
}

export type ForcaEvent =
  | { t: "round"; n: number; chooser: string }
  | { t: "chosen"; p: string; letters: number; words: number }
  | { t: "skipped"; p: string }
  | { t: "away"; p: string }
  | { t: "letter"; p: string; letter: string; hits: number; auto?: boolean }
  | { t: "word"; p: string; ok: boolean }
  | { t: "won"; p: string; points: number; chooser: number }
  | { t: "lost"; word: string };

export interface Standing extends ForcaStats {
  playerId: string;
  name: string;
  score: number;
}

export interface ForcaState {
  version: number;
  phase: ForcaPhase;
  players: ForcaPlayer[];
  hostId: string | null;
  /** Quantas palavras tem a partida. */
  rounds: number;
  roundNo: number;
  /** Quem escolhe a palavra desta rodada (null no lobby e no fim de jogo). */
  chooserId: string | null;
  round: RoundState | null;
  /** Índice (em players) de quem age: o escolhedor, enquanto escolhe; o chutador da vez, depois. */
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

export function createLobby(): ForcaState {
  return {
    version: FORCA_VERSION,
    phase: "lobby",
    players: [],
    hostId: null,
    rounds: DEFAULT_ROUNDS,
    roundNo: 0,
    chooserId: null,
    round: null,
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
  if (players.some((p) => p.id === current)) return current;
  return players[0]?.id ?? null;
}

const newPlayer = (id: string, name: string, avatarUrl: string | null | undefined): ForcaPlayer => ({
  id,
  name,
  avatarUrl: avatarUrl ?? null,
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
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, connected } : p)) };
}

/** Tira do lobby; numa partida rolando só marca como desconectado (a vez dele é pulada). */
export function removePlayer(state: ForcaState, id: string): ForcaState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
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
export const chooserOf = (state: ForcaState): ForcaPlayer | undefined => state.players.find((p) => p.id === state.chooserId);

/** Letras já chutadas na rodada (sem acento, maiúsculas). */
export const triedLetters = (round: RoundState): Set<string> => new Set(round.guesses.map((g) => g.letter));

/** Quantas letras da palavra ainda estão escondidas (contando cada ocorrência; espaço não conta). */
export function hiddenCount(round: RoundState): number {
  const tried = triedLetters(round);
  return [...round.norm].filter((l) => l !== " " && !tried.has(l)).length;
}

/**
 * A palavra como QUEM CHUTA vê: a letra (com acento) onde já foi revelada, " " nos espaços entre
 * as palavras, null onde ainda está escondida. É a única janela pra palavra secreta.
 */
export function publicPattern(round: RoundState, revealAll = false): (string | null)[] {
  const tried = triedLetters(round);
  return [...round.word].map((ch, i) => (round.norm[i] === " " ? " " : revealAll || tried.has(round.norm[i]) ? ch : null));
}

/** Próximo a chutar depois de `from`, pulando quem escolheu a palavra. */
function nextGuesser(state: ForcaState, from: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const i = wrap(n, from + step);
    if (state.players[i].id !== state.chooserId) return i;
  }
  return from;
}

const indexOfPlayer = (state: ForcaState, id: string | null) => state.players.findIndex((p) => p.id === id);

/** Abre a rodada `n`: o escolhedor da vez tem CHOOSE_MS pra digitar a palavra. */
function beginChoosing(state: ForcaState, n: number, now: number): ForcaState {
  const chooser = state.players[(n - 1) % state.players.length];
  return {
    ...state,
    phase: "choosing",
    roundNo: n,
    chooserId: chooser.id,
    round: null,
    turn: indexOfPlayer(state, chooser.id),
    turnDeadline: now + TIMING.CHOOSE_MS,
    events: [{ t: "round", n, chooser: chooser.id }],
    eventSeq: state.eventSeq + 1,
  };
}

export function startGame(state: ForcaState, now = 0): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");
  return ok(
    beginChoosing(
      {
        ...state,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        winnerId: null,
        standings: null,
        gameNumber: state.gameNumber + 1,
        stats: {},
      },
      1,
      now
    )
  );
}

/** Volta pro lobby depois da partida (revanche), mantendo quem segue conectado. */
export function returnToLobby(state: ForcaState): ForcaState {
  const players = state.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    roundNo: 0,
    chooserId: null,
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

const addScore = (players: ForcaPlayer[], id: string | null, points: number) => players.map((p) => (p.id === id ? { ...p, score: p.score + points } : p));

// ── Escolher a palavra ─────────────────────────────────────────────────────

/** O escolhedor digita a palavra (ou frase): a rodada começa e a vez vai pro primeiro chutador. */
export function chooseWord(state: ForcaState, playerId: string, raw: string, now: number): Result {
  if (state.phase !== "choosing") return fail("not_choosing");
  if (playerId !== state.chooserId) return fail("not_chooser");
  const parsed = parseWord(raw);
  if (!parsed) return fail("bad_word");
  const round: RoundState = { n: state.roundNo, word: parsed.word, norm: parsed.norm, guesses: [], lives: MAX_LIVES, status: "playing", solvedBy: null };
  const letters = parsed.norm.replace(/ /g, "").length;
  const words = parsed.norm.split(" ").length;
  return ok({
    ...state,
    phase: "playing",
    round,
    stats: bump(state.stats, playerId, "chosen"),
    turn: nextGuesser(state, indexOfPlayer(state, playerId)),
    turnDeadline: now + TIMING.TURN_MS,
    events: [{ t: "chosen", p: playerId, letters, words }],
    eventSeq: state.eventSeq + 1,
  });
}

/** O escolhedor demorou (ou saiu): a rodada é pulada, sem pontos pra ninguém. */
export function skipChooser(state: ForcaState, now: number): Result {
  if (state.phase !== "choosing" || !state.chooserId) return fail("not_choosing");
  const skipped: ForcaEvent = { t: "skipped", p: state.chooserId };
  const next = nextRound(state, now);
  return ok({ ...next, events: [skipped, ...next.events] });
}

// ── Chutar ─────────────────────────────────────────────────────────────────

/** Fecha a rodada (palavra completa ou boneco completo): a vez e o relógio param até a próxima. */
function closeRound(state: ForcaState, round: RoundState, patch: Partial<ForcaState>): ForcaState {
  return { ...state, ...patch, round, phase: "round_end", turnDeadline: 0 };
}

/** O boneco ficou completo (chapéu e tudo): a rodada acaba sem bônus, e o escolhedor não ganha nada. */
function loseRound(state: ForcaState, round: RoundState, stats: Record<string, ForcaStats> | undefined, events: ForcaEvent[]): ForcaState {
  const withStump = state.chooserId ? bump(stats, state.chooserId, "stumped") : stats;
  return closeRound(state, { ...round, lives: 0, status: "lost" }, { stats: withStump, events: [...events, { t: "lost", word: round.word }], eventSeq: state.eventSeq + 1 });
}

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
  const next: RoundState = { ...round, guesses: [...round.guesses, guess] };
  const events: ForcaEvent[] = [{ t: "letter", p: playerId, letter, hits, ...(auto ? { auto: true } : {}) }];
  let stats = state.stats;

  if (hits > 0) {
    let players = addScore(state.players, playerId, hits * LETTER_POINTS);
    stats = bump(stats, playerId, "hits");
    if (hiddenCount(next) === 0) {
      // Completou a palavra: bônus de quem completou e pontos do escolhedor (10 por parte do boneco).
      const chooserPoints = (MAX_LIVES - round.lives) * CHOOSER_POINTS_PER_ERROR;
      players = addScore(addScore(players, playerId, FINISH_BONUS), state.chooserId, chooserPoints);
      stats = bump(stats, playerId, "solved");
      events.push({ t: "won", p: playerId, points: hits * LETTER_POINTS + FINISH_BONUS, chooser: chooserPoints });
      return ok(closeRound(state, { ...next, status: "won", solvedBy: playerId }, { players, stats, events, eventSeq: state.eventSeq + 1 }));
    }
    // Acertou a letra: pontua e a vez passa.
    return ok({
      ...state,
      players,
      stats,
      round: next,
      turn: nextGuesser(state, state.turn),
      turnDeadline: now + TIMING.TURN_MS,
      events,
      eventSeq: state.eventSeq + 1,
    });
  }

  // Errou: o boneco ganha uma parte e a vez passa.
  stats = bump(stats, playerId, "misses");
  const lives = round.lives - 1;
  if (lives <= 0) return ok(loseRound(state, next, stats, events));
  return ok({
    ...state,
    stats,
    round: { ...next, lives },
    turn: nextGuesser(state, state.turn),
    turnDeadline: now + TIMING.TURN_MS,
    events,
    eventSeq: state.eventSeq + 1,
  });
}

/** Chute da palavra inteira (espaços e acentos não contam): acerta e leva o resto; erra e o boneco ganha 2 partes. */
export function guessWord(state: ForcaState, playerId: string, rawWord: string, now: number): Result {
  if (state.phase !== "playing" || !state.round) return fail("not_playing");
  const me = currentPlayer(state);
  if (!me || me.id !== playerId) return fail("not_your_turn");
  const word = normalize(rawWord);
  if (word.length < 2 || word.length > MAX_WORD_CHARS) return fail("bad_word");
  const round = state.round;

  if (word === round.norm.replace(/ /g, "")) {
    const points = hiddenCount(round) * LETTER_POINTS + FINISH_BONUS;
    const chooserPoints = (MAX_LIVES - round.lives) * CHOOSER_POINTS_PER_ERROR;
    const events: ForcaEvent[] = [
      { t: "word", p: playerId, ok: true },
      { t: "won", p: playerId, points, chooser: chooserPoints },
    ];
    const players = addScore(addScore(state.players, playerId, points), state.chooserId, chooserPoints);
    return ok(closeRound(state, { ...round, status: "won", solvedBy: playerId }, { players, stats: bump(state.stats, playerId, "solved"), events, eventSeq: state.eventSeq + 1 }));
  }

  const lives = Math.max(0, round.lives - WORD_PENALTY);
  const events: ForcaEvent[] = [{ t: "word", p: playerId, ok: false }];
  const stats = bump(state.stats, playerId, "wordFails");
  if (lives === 0) return ok(loseRound(state, round, stats, events));
  return ok({
    ...state,
    stats,
    round: { ...round, lives },
    turn: nextGuesser(state, state.turn),
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

/** Quem devia chutar caiu da conexão: a vez passa pro próximo chutador, sem castigo. */
export function skipTurn(state: ForcaState, now: number): Result {
  if (state.phase !== "playing" || !state.round) return fail("not_playing");
  const me = currentPlayer(state);
  if (!me) return fail("not_playing");
  return ok({
    ...state,
    turn: nextGuesser(state, state.turn),
    turnDeadline: now + TIMING.TURN_MS,
    events: [{ t: "away", p: me.id }],
    eventSeq: state.eventSeq + 1,
  });
}

// ── Próxima rodada e fim ───────────────────────────────────────────────────

function finishGame(state: ForcaState): ForcaState {
  const standings: Standing[] = state.players
    .map((p) => ({ ...emptyStats(), ...state.stats?.[p.id], playerId: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score || b.solved - a.solved || b.hits - a.hits);
  return { ...state, phase: "game_over", chooserId: null, turnDeadline: 0, winnerId: standings[0].playerId, standings, events: [], eventSeq: state.eventSeq + 1 };
}

/** A próxima rodada (outro escolhedor) — ou o fim do jogo, se foi a última. */
function nextRound(state: ForcaState, now: number): ForcaState {
  return state.roundNo < state.rounds ? beginChoosing(state, state.roundNo + 1, now) : finishGame(state);
}

/** Da rodada parada na mesa pra próxima — ou pro fim do jogo. */
export function advanceRound(state: ForcaState, now: number): Result {
  if (state.phase !== "round_end" || !state.round) return fail("not_round_end");
  return ok(nextRound(state, now));
}

// ── O que os clientes enxergam ─────────────────────────────────────────────

export interface ForcaPlayerView {
  id: string;
  name: string;
  avatarUrl?: string | null;
  connected: boolean;
  score: number;
}

export interface ForcaView {
  phase: ForcaPhase;
  players: ForcaPlayerView[];
  hostId: string | null;
  rounds: number;
  roundNo: number;
  chooserId: string | null;
  /** Letra (com acento) onde já foi revelada, " " nos espaços, null onde está escondida. Vazio enquanto ninguém escolheu. */
  pattern: (string | null)[];
  guesses: Guess[];
  lives: number;
  maxLives: number;
  status: "playing" | "won" | "lost" | null;
  solvedBy: string | null;
  /** A palavra inteira — só pra quem escolheu e, pra todo mundo, depois que a rodada termina. */
  word: string | null;
  turn: number;
  turnDeadline: number;
  events: ForcaEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
}

/** A visão de `viewerId` (null = quem só assiste): a palavra é segredo do escolhedor até a rodada acabar. */
export function toView(state: ForcaState, viewerId: string | null): ForcaView {
  const round = state.round;
  const finished = !!round && round.status !== "playing";
  const seesWord = finished || (viewerId !== null && viewerId === state.chooserId);
  // O evento `lost` carrega a palavra: só entra depois de a rodada acabar (ou pra quem escolheu).
  const events = state.events.map((e) => (e.t === "lost" && !seesWord ? ({ t: "lost", word: "" } as ForcaEvent) : e));
  return {
    phase: state.phase,
    players: state.players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, connected: p.connected, score: p.score })),
    hostId: state.hostId,
    rounds: state.rounds,
    roundNo: state.roundNo,
    chooserId: state.chooserId,
    pattern: round ? publicPattern(round, finished) : [],
    guesses: round ? round.guesses : [],
    lives: round ? round.lives : MAX_LIVES,
    maxLives: MAX_LIVES,
    status: round ? round.status : null,
    solvedBy: round ? round.solvedBy : null,
    word: round && seesWord ? round.word : null,
    turn: state.turn,
    turnDeadline: state.turnDeadline,
    events,
    eventSeq: state.eventSeq,
    winnerId: state.winnerId,
    standings: state.standings,
    gameNumber: state.gameNumber,
  };
}
