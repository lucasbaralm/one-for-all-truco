// Regras da Mímica Love Songs (multiplayer, de 2 a 8 pessoas) como funções puras sobre um MimicaState —
// mesmo molde dos outros jogos: o room server (party/mimica.ts) é a autoridade e roda este código.
//
// Como se joga:
//  • A cada turno UMA pessoa faz a mímica. Ela recebe uma carta com 4 músicas — 3 do Brasil e 1 do
//    mundo, sorteadas de 300 de cada lado (os últimos ~40 anos, com muita MPB e rock nacional) — e escolhe uma. As outras veem só o tamanho do
//    título (uma casinha por letra) e se a música é do Brasil ou do mundo, e tentam acertar digitando.
//  • Quem faz a mímica não fala, não faz som, não soletra: a câmera da call é o palco (o jogo não
//    transmite vídeo — a galera abre uma call, como na Forca).
//  • Acertou o título: o primeiro a acertar ganha o valor da música (10 do Brasil, 15 do mundo) mais 1 a 5
//    pontos pela rapidez; quem fez a mímica ganha o valor da música. Ninguém acertou em 90 s: ninguém ganha.
//  • Na metade do tempo aparece a primeira letra de cada palavra.
//  • Chute que o servidor recusou por um detalhe (apelido, grafia): quem faz a mímica pode aceitar na mão.
//  • Cada pessoa faz a mímica `rounds` vezes (na ordem da sala). No fim, vence quem tem mais pontos.
//
// A música escolhida e a carta NUNCA saem do servidor enquanto o turno está aberto (toView só manda
// a carta pra quem faz a mímica, a música escolhida só pra ela e, pra todo mundo, depois que o turno acaba).
// A "faixa extra" da caixa física não existe aqui.

import { IDS_BY_KIND, SONGS, Song, SongKind, isCorrectGuess, songOf } from "./catalog";
import { TIMING } from "./timing";
import { titleKey, titlePattern, titleShape } from "./titles";

export type MimicaPhase = "lobby" | "picking" | "miming" | "turn_end" | "game_over";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** Quantas vezes cada pessoa faz a mímica. */
export const ROUND_CHOICES = [1, 2, 3, 4, 5] as const;
export const DEFAULT_ROUNDS = 2;
/** Muda quando o formato do estado salvo muda (uma sala antiga volta pro lobby em vez de quebrar). */
export const MIMICA_VERSION = 1;

/** A carta: 3 músicas do Brasil e 1 do mundo. */
export const CARD_BR = 3;
export const CARD_WORLD = 1;
export const SONG_POINTS: Record<SongKind, number> = { br: 10, world: 15 };
/** Bônus de rapidez de quem acerta (1 a 5, proporcional ao tempo que sobrou). */
export const MAX_SPEED_BONUS = 5;
export const MAX_GUESS_CHARS = 60;
/** Quantos chutes do turno a sala guarda (os mais antigos saem). */
export const MAX_GUESSES_KEPT = 30;

type Rng = () => number;

export interface MimicaStats {
  /** Músicas que EU acertei como chutador. */
  guessed: number;
  /** Chutes meus que erraram. */
  wrong: number;
  /** Mímicas que EU fiz. */
  mimed: number;
  /** Das minhas mímicas, as que a mesa acertou. */
  solvedMimes: number;
  /** Das minhas mímicas, as que ninguém acertou. */
  failedMimes: number;
}
export const emptyStats = (): MimicaStats => ({ guessed: 0, wrong: 0, mimed: 0, solvedMimes: 0, failedMimes: 0 });

export interface MimicaPlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
  connected: boolean;
  score: number;
}

export interface Guess {
  /** Número do chute no turno (o que "aceitar" aponta). */
  n: number;
  by: string;
  text: string;
  ok: boolean;
}

export type TurnStatus = "picking" | "miming" | "solved" | "timeout" | "skipped";

export interface Turn {
  n: number;
  mimerId: string;
  /** As 4 músicas da carta (ids) — SEGREDO de quem faz a mímica. */
  card: number[];
  /** A escolhida — SEGREDO de quem faz a mímica até o turno acabar. */
  songId: number | null;
  guesses: Guess[];
  nextGuess: number;
  /** 1 = a primeira letra de cada palavra já apareceu. */
  hint: 0 | 1;
  status: TurnStatus;
  solvedBy: string | null;
  /** Quando cada pessoa chutou pela última vez (relógio do servidor). */
  lastGuessAt: Record<string, number>;
}

export type MimicaEvent =
  | { t: "turn"; n: number; mimer: string }
  | { t: "picked"; p: string; kind: SongKind; words: number; letters: number; auto?: boolean }
  | { t: "hint" }
  | { t: "wrong"; p: string; text: string }
  | { t: "solved"; p: string; mimer: string; points: number; bonus: number; mimerPoints: number; title: string; artist: string; accepted?: boolean }
  | { t: "timeout"; title: string; artist: string; gaveUp?: boolean }
  | { t: "skipped"; p: string; title: string | null; artist: string | null };

export interface Standing extends MimicaStats {
  playerId: string;
  name: string;
  score: number;
}

export interface MimicaState {
  version: number;
  phase: MimicaPhase;
  players: MimicaPlayer[];
  hostId: string | null;
  /** Quantas vezes cada pessoa faz a mímica. */
  rounds: number;
  /** Turno atual (1…totalTurns); 0 no lobby. */
  turnNo: number;
  totalTurns: number;
  turn: Turn | null;
  /** Até quando (relógio do servidor, ms) vale a escolha / a mímica; 0 = sem contagem. */
  deadline: number;
  /** Quando a dica aparece (relógio do servidor); 0 = não há dica pendente. */
  hintAt: number;
  /** Músicas que já saíram numa carta: não repetem enquanto houver outras do mesmo lado. */
  used: number[];
  events: MimicaEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
  stats?: Record<string, MimicaStats>;
}

export type Result = { ok: true; state: MimicaState } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const ok = (state: MimicaState): Result => ({ ok: true, state });

export function createLobby(): MimicaState {
  return {
    version: MIMICA_VERSION,
    phase: "lobby",
    players: [],
    hostId: null,
    rounds: DEFAULT_ROUNDS,
    turnNo: 0,
    totalTurns: 0,
    turn: null,
    deadline: 0,
    hintAt: 0,
    used: [],
    events: [],
    eventSeq: 0,
    winnerId: null,
    standings: null,
    gameNumber: 0,
    stats: {},
  };
}

// ── Lobby ──────────────────────────────────────────────────────────────────

function pickHost(players: MimicaPlayer[], current: string | null): string | null {
  if (players.some((p) => p.id === current)) return current;
  return players[0]?.id ?? null;
}

const newPlayer = (id: string, name: string, avatarUrl: string | null | undefined): MimicaPlayer => ({
  id,
  name,
  avatarUrl: avatarUrl ?? null,
  connected: true,
  score: 0,
});

export function joinLobby(state: MimicaState, who: { id: string; name: string; avatarUrl?: string | null }): Result {
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

export function setPlayerConnected(state: MimicaState, id: string, connected: boolean): MimicaState {
  if (!state.players.some((p) => p.id === id)) return state;
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, connected } : p)) };
}

/** Tira do lobby; numa partida rolando só marca como desconectado (a vez dele é pulada). */
export function removePlayer(state: MimicaState, id: string): MimicaState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
}

export function setRounds(state: MimicaState, rounds: number): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (!(ROUND_CHOICES as readonly number[]).includes(rounds)) return fail("bad_rounds");
  return ok({ ...state, rounds });
}

export function canStart(state: MimicaState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS;
}

// ── Peças do jogo ───────────────────────────────────────────────────────────

const shuffled = <T>(items: T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Sorteia `count` músicas de um lado que ainda não saíram (se faltar, o lado todo volta pro baralho). */
function takeFrom(kind: SongKind, count: number, used: Set<number>, rng: Rng): number[] {
  const pool = IDS_BY_KIND[kind];
  let free = pool.filter((id) => !used.has(id));
  if (free.length < count) {
    for (const id of pool) used.delete(id);
    free = [...pool];
  }
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    const j = Math.floor(rng() * free.length);
    picked.push(free.splice(j, 1)[0]);
  }
  for (const id of picked) used.add(id);
  return picked;
}

/** Monta a carta: 3 músicas do Brasil e 1 do mundo, em ordem embaralhada. */
export function drawCard(usedIds: number[], rng: Rng): { card: number[]; used: number[] } {
  const used = new Set(usedIds);
  const card = shuffled([...takeFrom("br", CARD_BR, used, rng), ...takeFrom("world", CARD_WORLD, used, rng)], rng);
  return { card, used: [...used] };
}

export const mimerOf = (state: MimicaState): MimicaPlayer | undefined => state.players.find((p) => p.id === state.turn?.mimerId);

/** A música escolhida do turno (undefined enquanto ninguém escolheu). */
export const chosenSong = (state: MimicaState): Song | undefined => songOf(state.turn?.songId);

const bump = (stats: Record<string, MimicaStats> | undefined, id: string, field: keyof MimicaStats, by = 1) => ({
  ...stats,
  [id]: { ...(stats?.[id] ?? emptyStats()), [field]: (stats?.[id]?.[field] ?? 0) + by },
});

const addScore = (players: MimicaPlayer[], id: string | null, points: number) => players.map((p) => (p.id === id ? { ...p, score: p.score + points } : p));

/** Abre o turno `n`: quem faz a mímica (rodízio na ordem da sala) tem PICK_MS pra escolher da carta. */
function beginTurn(state: MimicaState, n: number, rng: Rng, now: number): MimicaState {
  const mimer = state.players[(n - 1) % state.players.length];
  const { card, used } = drawCard(state.used, rng);
  return {
    ...state,
    phase: "picking",
    turnNo: n,
    turn: { n, mimerId: mimer.id, card, songId: null, guesses: [], nextGuess: 1, hint: 0, status: "picking", solvedBy: null, lastGuessAt: {} },
    deadline: now + TIMING.PICK_MS,
    hintAt: 0,
    used,
    events: [{ t: "turn", n, mimer: mimer.id }],
    eventSeq: state.eventSeq + 1,
  };
}

export function startGame(state: MimicaState, rng: Rng = Math.random, now = 0): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");
  return ok(
    beginTurn(
      {
        ...state,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        totalTurns: state.rounds * state.players.length,
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

/** Volta pro lobby depois da partida (revanche), mantendo quem segue conectado. */
export function returnToLobby(state: MimicaState): MimicaState {
  const players = state.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    turnNo: 0,
    totalTurns: 0,
    turn: null,
    deadline: 0,
    hintAt: 0,
    events: [],
    winnerId: null,
    standings: null,
  };
}

// ── Escolher a música ──────────────────────────────────────────────────────

/** Quem faz a mímica escolhe uma das músicas da carta: a mímica começa e o relógio corre. `auto` = o servidor escolheu por falta de tempo. */
export function pickSong(state: MimicaState, playerId: string, songId: number, now: number, auto = false): Result {
  const turn = state.turn;
  if (state.phase !== "picking" || !turn) return fail("not_picking");
  if (playerId !== turn.mimerId) return fail("not_mimer");
  const song = turn.card.includes(songId) ? songOf(songId) : undefined;
  if (!song) return fail("bad_song");
  const { words, letters } = titleShape(song.title);
  return ok({
    ...state,
    phase: "miming",
    turn: { ...turn, songId, status: "miming" },
    deadline: now + TIMING.MIME_MS,
    hintAt: now + Math.round(TIMING.MIME_MS * TIMING.HINT_AT),
    stats: bump(state.stats, playerId, "mimed"),
    events: [{ t: "picked", p: playerId, kind: song.kind, words, letters, ...(auto ? { auto: true } : {}) }],
    eventSeq: state.eventSeq + 1,
  });
}

/** Estourou o tempo da escolha: o servidor escolhe uma da carta por quem não escolheu. */
export function autoPick(state: MimicaState, rng: Rng, now: number): Result {
  const turn = state.turn;
  if (state.phase !== "picking" || !turn) return fail("not_picking");
  return pickSong(state, turn.mimerId, turn.card[Math.floor(rng() * turn.card.length)], now, true);
}

// ── Chutar ─────────────────────────────────────────────────────────────────

function closeTurn(state: MimicaState, turn: Turn, patch: Partial<MimicaState>): MimicaState {
  return { ...state, ...patch, turn, phase: "turn_end", deadline: 0, hintAt: 0 };
}

/** Alguém acertou (chute que bateu, ou chute que quem faz a mímica aceitou): o turno acaba e os pontos saem. */
function solve(state: MimicaState, turn: Turn, guess: Guess, now: number, accepted: boolean): MimicaState {
  const song = songOf(turn.songId)!;
  const base = SONG_POINTS[song.kind];
  const left = Math.max(0, state.deadline - now);
  const bonus = Math.min(MAX_SPEED_BONUS, Math.max(1, Math.ceil((MAX_SPEED_BONUS * left) / TIMING.MIME_MS)));
  const done: Guess = { ...guess, ok: true };
  const guesses = turn.guesses.some((g) => g.n === guess.n) ? turn.guesses.map((g) => (g.n === guess.n ? done : g)) : [...turn.guesses, done];
  const players = addScore(addScore(state.players, guess.by, base + bonus), turn.mimerId, base);
  const stats = bump(bump(state.stats, guess.by, "guessed"), turn.mimerId, "solvedMimes");
  const event: MimicaEvent = {
    t: "solved",
    p: guess.by,
    mimer: turn.mimerId,
    points: base + bonus,
    bonus,
    mimerPoints: base,
    title: song.title,
    artist: song.artist,
    ...(accepted ? { accepted: true } : {}),
  };
  return closeTurn(state, { ...turn, guesses: guesses.slice(-MAX_GUESSES_KEPT), status: "solved", solvedBy: guess.by }, { players, stats, events: [event], eventSeq: state.eventSeq + 1 });
}

/** Chute de título de quem está na mesa (menos quem faz a mímica). Acertou, o turno acaba; errou, o chute fica à mostra. */
export function submitGuess(state: MimicaState, playerId: string, rawText: string, now: number): Result {
  const turn = state.turn;
  if (state.phase !== "miming" || !turn || turn.songId === null) return fail("not_miming");
  if (!state.players.some((p) => p.id === playerId)) return fail("not_in_room");
  if (playerId === turn.mimerId) return fail("mimer_cannot_guess");
  const text = typeof rawText === "string" ? rawText.trim().replace(/\s+/g, " ") : "";
  const key = titleKey(text);
  if (!key || text.length > MAX_GUESS_CHARS) return fail("bad_guess");
  const last = turn.lastGuessAt[playerId];
  if (last !== undefined && now - last < TIMING.GUESS_COOLDOWN_MS) return fail("too_fast");
  if (turn.guesses.some((g) => g.by === playerId && titleKey(g.text) === key)) return fail("already_guessed");

  const song = songOf(turn.songId)!;
  const guess: Guess = { n: turn.nextGuess, by: playerId, text, ok: false };
  if (isCorrectGuess(text, song)) return ok(solve(state, { ...turn, nextGuess: turn.nextGuess + 1 }, { ...guess, text: song.title }, now, false));

  const next: Turn = {
    ...turn,
    guesses: [...turn.guesses, guess].slice(-MAX_GUESSES_KEPT),
    nextGuess: turn.nextGuess + 1,
    lastGuessAt: { ...turn.lastGuessAt, [playerId]: now },
  };
  return ok({
    ...state,
    turn: next,
    stats: bump(state.stats, playerId, "wrong"),
    events: [{ t: "wrong", p: playerId, text }],
    eventSeq: state.eventSeq + 1,
  });
}

/** Quem faz a mímica aceita um chute que o servidor recusou (grafia diferente, apelido): vale como acerto. */
export function acceptGuess(state: MimicaState, playerId: string, n: number, now: number): Result {
  const turn = state.turn;
  if (state.phase !== "miming" || !turn || turn.songId === null) return fail("not_miming");
  if (playerId !== turn.mimerId) return fail("not_mimer");
  const guess = turn.guesses.find((g) => g.n === n && !g.ok);
  if (!guess) return fail("no_such_guess");
  return ok(solve(state, turn, guess, now, true));
}

// ── Dica, fim do tempo, desistir, pular ─────────────────────────────────────

/** Metade do tempo: a primeira letra de cada palavra aparece nas casinhas. */
export function showHint(state: MimicaState): Result {
  const turn = state.turn;
  if (state.phase !== "miming" || !turn || turn.hint === 1) return fail("no_hint");
  return ok({ ...state, turn: { ...turn, hint: 1 }, hintAt: 0, events: [{ t: "hint" }], eventSeq: state.eventSeq + 1 });
}

function failTurn(state: MimicaState, gaveUp: boolean): MimicaState {
  const turn = state.turn!;
  const song = songOf(turn.songId)!;
  return closeTurn(
    state,
    { ...turn, status: "timeout" },
    {
      stats: bump(state.stats, turn.mimerId, "failedMimes"),
      events: [{ t: "timeout", title: song.title, artist: song.artist, ...(gaveUp ? { gaveUp: true } : {}) }],
      eventSeq: state.eventSeq + 1,
    }
  );
}

/** Acabou o tempo da mímica e ninguém acertou. */
export function timeoutMime(state: MimicaState): Result {
  if (state.phase !== "miming" || !state.turn || state.turn.songId === null) return fail("not_miming");
  return ok(failTurn(state, false));
}

/** Quem faz a mímica desiste: o turno acaba sem pontos, e a música é revelada. */
export function giveUp(state: MimicaState, playerId: string): Result {
  if (state.phase !== "miming" || !state.turn || state.turn.songId === null) return fail("not_miming");
  if (playerId !== state.turn.mimerId) return fail("not_mimer");
  return ok(failTurn(state, true));
}

/** Quem devia fazer a mímica caiu da conexão: o turno é pulado, sem castigo. */
export function skipTurn(state: MimicaState): Result {
  const turn = state.turn;
  if ((state.phase !== "picking" && state.phase !== "miming") || !turn) return fail("not_playing");
  const song = songOf(turn.songId);
  return ok(
    closeTurn(
      state,
      { ...turn, status: "skipped" },
      { events: [{ t: "skipped", p: turn.mimerId, title: song?.title ?? null, artist: song?.artist ?? null }], eventSeq: state.eventSeq + 1 }
    )
  );
}

// ── Próximo turno e fim ────────────────────────────────────────────────────

function finishGame(state: MimicaState): MimicaState {
  const standings: Standing[] = state.players
    .map((p) => ({ ...emptyStats(), ...state.stats?.[p.id], playerId: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score || b.guessed - a.guessed || b.solvedMimes - a.solvedMimes);
  return { ...state, phase: "game_over", deadline: 0, hintAt: 0, winnerId: standings[0].playerId, standings, events: [], eventSeq: state.eventSeq + 1 };
}

/** Da mímica parada na mesa pro próximo turno — ou pro fim do jogo. */
export function advanceTurn(state: MimicaState, rng: Rng, now: number): Result {
  if (state.phase !== "turn_end" || !state.turn) return fail("not_turn_end");
  return ok(state.turnNo < state.totalTurns ? beginTurn(state, state.turnNo + 1, rng, now) : finishGame(state));
}

// ── O que os clientes enxergam ─────────────────────────────────────────────

export interface MimicaPlayerView {
  id: string;
  name: string;
  avatarUrl?: string | null;
  connected: boolean;
  score: number;
}

export interface SongView {
  id: number;
  title: string;
  artist: string;
  kind: SongKind;
  points: number;
}

export interface GuessView {
  n: number;
  by: string;
  text: string;
  ok: boolean;
}

export interface MimicaView {
  phase: MimicaPhase;
  players: MimicaPlayerView[];
  hostId: string | null;
  rounds: number;
  turnNo: number;
  totalTurns: number;
  mimerId: string | null;
  status: TurnStatus | null;
  /** A carta (4 músicas) — só pra quem faz a mímica, enquanto escolhe. */
  card: SongView[] | null;
  /** A música — só pra quem faz a mímica durante a mímica e, pra todo mundo, quando o turno acaba. */
  song: SongView | null;
  /** Brasil ou mundo: todo mundo sabe depois da escolha. */
  kind: SongKind | null;
  /** Quanto vale a música escolhida. */
  worth: number | null;
  /** Letra onde já foi revelada, " "/pontuação como estão, null onde está escondida. Vazio enquanto ninguém escolheu. */
  pattern: (string | null)[];
  hint: 0 | 1;
  guesses: GuessView[];
  solvedBy: string | null;
  deadline: number;
  hintAt: number;
  events: MimicaEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
}

const songView = (s: Song): SongView => ({ id: s.id, title: s.title, artist: s.artist, kind: s.kind, points: SONG_POINTS[s.kind] });

/** A visão de `viewerId` (null = quem só assiste): a carta e a música são segredo de quem faz a mímica até o turno acabar. */
export function toView(state: MimicaState, viewerId: string | null): MimicaView {
  const turn = state.turn;
  const song = songOf(turn?.songId);
  const finished = !!turn && (turn.status === "solved" || turn.status === "timeout" || turn.status === "skipped");
  const isMimer = !!turn && viewerId !== null && viewerId === turn.mimerId;
  const seesSong = !!song && (finished || (isMimer && turn.status === "miming"));
  // Os eventos que carregam o título só existem com o turno encerrado — quem não pode ver a música (um evento antigo, uma sala restaurada) recebe o evento sem ela.
  const events = state.events.map((e): MimicaEvent => {
    if (finished) return e;
    if (e.t === "solved" || e.t === "timeout") return { ...e, title: "", artist: "" };
    if (e.t === "skipped") return { ...e, title: null, artist: null };
    return e;
  });
  return {
    phase: state.phase,
    players: state.players.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, connected: p.connected, score: p.score })),
    hostId: state.hostId,
    rounds: state.rounds,
    turnNo: state.turnNo,
    totalTurns: state.totalTurns,
    mimerId: turn?.mimerId ?? null,
    status: turn?.status ?? null,
    card: isMimer && turn.status === "picking" ? turn.card.map((id) => songView(SONGS[id])) : null,
    song: seesSong ? songView(song) : null,
    kind: song ? song.kind : null,
    worth: song ? SONG_POINTS[song.kind] : null,
    pattern: song ? titlePattern(song.title, turn!.hint, finished) : [],
    hint: turn?.hint ?? 0,
    guesses: turn ? turn.guesses.map((g) => ({ n: g.n, by: g.by, text: g.text, ok: g.ok })) : [],
    solvedBy: turn?.solvedBy ?? null,
    deadline: state.deadline,
    hintAt: state.hintAt,
    events,
    eventSeq: state.eventSeq,
    winnerId: state.winnerId,
    standings: state.standings,
    gameNumber: state.gameNumber,
  };
}
