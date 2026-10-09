// Regras do Ludo como funções puras sobre um LudoState — mesmo padrão do
// state-machine.ts da Fodinha: o servidor (party/ludo.ts) e o modo local
// contra bots rodam exatamente este código, então nunca divergem.
//
// Regras implementadas (as mais comuns no Brasil):
//  • Precisa tirar 6 pra tirar uma peça da base.
//  • Tirar 6 dá outra jogada; três 6 seguidos perdem a vez.
//  • Cair numa casa com peça adversária sozinha a manda de volta pra base
//    (e dá outra jogada). Casas seguras (saídas e estrelas) não capturam.
//  • Duas peças da mesma cor na mesma casa formam uma barreira: não podem
//    ser capturadas.
//  • Chegar em casa (56) exige o número exato e também dá outra jogada.
//  • Ganha quem levar as 4 peças pra casa primeiro.

import {
  COLORS,
  FINISHED,
  IN_BASE,
  LudoColor,
  PIECES_PER_PLAYER,
  isOnRing,
  isSafeRingIndex,
  ringIndexOf,
} from "./board";

export type BotLevel = "easy" | "medium" | "hard";
export type LudoPhase = "lobby" | "rolling" | "moving" | "game_over";
export type ExtraReason = "six" | "capture" | "home";

export const BOT_PREFIX = "bot:";
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export interface LudoPlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
  color: LudoColor;
  /** Preenchido quando é controlado pelo servidor/modo local (nível da IA). */
  bot?: BotLevel;
  connected: boolean;
  /** 4 peças: -1 base, 0..50 anel, 51..55 reta final, 56 em casa. */
  pieces: number[];
}

export interface LudoMove {
  piece: number;
  from: number;
  to: number;
}

export interface Capture {
  playerId: string;
  piece: number;
  /** Progresso que a peça capturada tinha (relativo à cor DELA). */
  from: number;
}

export interface LastRoll {
  seq: number;
  playerId: string;
  value: number;
  forfeited: boolean;
}

export interface LastMove {
  seq: number;
  playerId: string;
  piece: number;
  from: number;
  to: number;
  dice: number;
  captures: Capture[];
  finished: boolean;
}

export interface Standing {
  playerId: string;
  name: string;
  color: LudoColor;
  finished: number;
  progress: number;
}

export interface LudoState {
  phase: LudoPhase;
  players: LudoPlayer[];
  hostId: string | null;
  /** Índice (em players) de quem tem a vez. */
  turn: number;
  dice: number | null;
  sixStreak: number;
  /** O último 6 foi o terceiro seguido: a jogada está perdida. */
  forfeit: boolean;
  rollSeq: number;
  moveSeq: number;
  lastRoll: LastRoll | null;
  lastMove: LastMove | null;
  /** Por que o jogador da vez joga de novo (null = turno normal). */
  extraTurn: ExtraReason | null;
  winnerId: string | null;
  standings: Standing[] | null;
  /** Sobe a cada partida iniciada — a UI usa pra zerar animações. */
  gameNumber: number;
}

export type Result = { ok: true; state: LudoState } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });
const ok = (state: LudoState): Result => ({ ok: true, state });

export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);

export function freshPieces(): number[] {
  return Array.from({ length: PIECES_PER_PLAYER }, () => IN_BASE);
}

export function createLobby(): LudoState {
  return {
    phase: "lobby",
    players: [],
    hostId: null,
    turn: 0,
    dice: null,
    sixStreak: 0,
    forfeit: false,
    rollSeq: 0,
    moveSeq: 0,
    lastRoll: null,
    lastMove: null,
    extraTurn: null,
    winnerId: null,
    standings: null,
    gameNumber: 0,
  };
}

// ── Lobby ──────────────────────────────────────────────────────────────────

// Com 2 jogadores a segunda cor padrão é a oposta (azul), como no tabuleiro físico.
const COLOR_PICK_ORDER: LudoColor[] = ["red", "blue", "green", "yellow"];

function firstFreeColor(players: LudoPlayer[]): LudoColor | null {
  return COLOR_PICK_ORDER.find((c) => !players.some((p) => p.color === c)) ?? null;
}

function pickHost(players: LudoPlayer[], current: string | null): string | null {
  const stillHere = players.find((p) => p.id === current && !p.bot);
  if (stillHere) return stillHere.id;
  return players.find((p) => !p.bot)?.id ?? null;
}

export function joinLobby(
  state: LudoState,
  who: { id: string; name: string; avatarUrl?: string | null },
  color?: LudoColor
): Result {
  const existing = state.players.find((p) => p.id === who.id);
  if (existing) {
    // Reconexão (ou refresh): só atualiza nome/foto e marca como conectado.
    return ok({
      ...state,
      players: state.players.map((p) =>
        p.id === who.id ? { ...p, name: who.name, avatarUrl: who.avatarUrl ?? null, connected: true } : p
      ),
      hostId: pickHost(state.players, state.hostId),
    });
  }
  if (state.phase !== "lobby") return fail("game_in_progress");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");

  const wanted = color && !state.players.some((p) => p.color === color) ? color : firstFreeColor(state.players);
  if (!wanted) return fail("room_full");

  const players = [
    ...state.players,
    {
      id: who.id,
      name: who.name,
      avatarUrl: who.avatarUrl ?? null,
      color: wanted,
      connected: true,
      pieces: freshPieces(),
    },
  ];
  return ok({ ...state, players, hostId: pickHost(players, state.hostId) });
}

export function setPlayerConnected(state: LudoState, id: string, connected: boolean): LudoState {
  if (!state.players.some((p) => p.id === id)) return state;
  return {
    ...state,
    players: state.players.map((p) => (p.id === id && !p.bot ? { ...p, connected } : p)),
  };
}

/** Tira o jogador da sala (só no lobby); numa partida rolando só marca como desconectado. */
export function removePlayer(state: LudoState, id: string): LudoState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
}

export function changeColor(state: LudoState, id: string, color: LudoColor): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (!state.players.some((p) => p.id === id)) return fail("not_in_room");
  if (state.players.some((p) => p.color === color && p.id !== id)) return fail("color_taken");
  return ok({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, color } : p)) });
}

const BOT_NAMES = ["Robô Zeca", "Robô Bia", "Robô Tião", "Robô Dani", "Robô Juca", "Robô Lia"];

export function addBot(state: LudoState, level: BotLevel, color?: LudoColor): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  const wanted = color && !state.players.some((p) => p.color === color) ? color : firstFreeColor(state.players);
  if (!wanted) return fail("room_full");

  let n = 1;
  while (state.players.some((p) => p.id === `${BOT_PREFIX}${n}`)) n++;
  const bot: LudoPlayer = {
    id: `${BOT_PREFIX}${n}`,
    name: BOT_NAMES[(n - 1) % BOT_NAMES.length],
    avatarUrl: null,
    color: wanted,
    bot: level,
    connected: true,
    pieces: freshPieces(),
  };
  return ok({ ...state, players: [...state.players, bot] });
}

export function setBotLevel(state: LudoState, botId: string, level: BotLevel): Result {
  const bot = state.players.find((p) => p.id === botId && p.bot);
  if (!bot) return fail("not_a_bot");
  return ok({ ...state, players: state.players.map((p) => (p.id === botId ? { ...p, bot: level } : p)) });
}

export function canStart(state: LudoState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS;
}

export function startGame(state: LudoState, rng: () => number = Math.random): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");

  // Turno segue o sentido horário do tabuleiro, então ordena por cor.
  const players = [...state.players]
    .sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color))
    .map((p) => ({ ...p, pieces: freshPieces() }));

  return ok({
    ...state,
    phase: "rolling",
    players,
    turn: Math.floor(rng() * players.length),
    dice: null,
    sixStreak: 0,
    forfeit: false,
    lastRoll: null,
    lastMove: null,
    extraTurn: null,
    winnerId: null,
    standings: null,
    gameNumber: state.gameNumber + 1,
  });
}

/** Volta pro lobby depois de uma partida (revanche), mantendo bots e quem segue conectado. */
export function returnToLobby(state: LudoState): LudoState {
  const players = state.players
    .filter((p) => p.bot || p.connected)
    .map((p) => ({ ...p, pieces: freshPieces() }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    turn: 0,
    dice: null,
    sixStreak: 0,
    forfeit: false,
    extraTurn: null,
    winnerId: null,
    standings: null,
  };
}

// ── Jogo ───────────────────────────────────────────────────────────────────

export function currentPlayer(state: LudoState): LudoPlayer | undefined {
  return state.players[state.turn];
}

export function legalMoves(state: LudoState): LudoMove[] {
  if (state.phase !== "moving" || state.dice === null || state.forfeit) return [];
  const player = currentPlayer(state);
  if (!player) return [];
  const d = state.dice;
  const moves: LudoMove[] = [];
  player.pieces.forEach((from, piece) => {
    if (from === FINISHED) return;
    if (from === IN_BASE) {
      if (d === 6) moves.push({ piece, from, to: 0 });
      return;
    }
    const to = from + d;
    if (to <= FINISHED) moves.push({ piece, from, to });
  });
  return moves;
}

/**
 * Jogadas que de fato são diferentes entre si: várias peças na base (ou
 * empilhadas na mesma casa) levam ao mesmo resultado, então contam como uma.
 */
export function distinctMoves(moves: LudoMove[]): LudoMove[] {
  const seen = new Set<number>();
  return moves.filter((m) => {
    if (seen.has(m.from)) return false;
    seen.add(m.from);
    return true;
  });
}

export function rollDice(state: LudoState, playerId: string, value: number): Result {
  if (state.phase !== "rolling") return fail("not_rolling");
  if (currentPlayer(state)?.id !== playerId) return fail("not_your_turn");
  if (!Number.isInteger(value) || value < 1 || value > 6) return fail("bad_dice");

  const sixStreak = value === 6 ? state.sixStreak + 1 : 0;
  const forfeit = sixStreak >= 3;
  return ok({
    ...state,
    phase: "moving",
    dice: value,
    sixStreak,
    forfeit,
    extraTurn: null,
    rollSeq: state.rollSeq + 1,
    lastRoll: { seq: state.rollSeq + 1, playerId, value, forfeited: forfeit },
  });
}

function capturesAt(players: LudoPlayer[], mover: LudoPlayer, to: number): Capture[] {
  if (!isOnRing(to)) return [];
  const idx = ringIndexOf(mover.color, to);
  if (isSafeRingIndex(idx)) return [];

  const captures: Capture[] = [];
  for (const other of players) {
    if (other.id === mover.id) continue;
    const here: { piece: number; progress: number }[] = [];
    other.pieces.forEach((progress, piece) => {
      if (isOnRing(progress) && ringIndexOf(other.color, progress) === idx) here.push({ piece, progress });
    });
    // Duas ou mais da mesma cor formam barreira: ninguém é capturado.
    if (here.length === 1) captures.push({ playerId: other.id, piece: here[0].piece, from: here[0].progress });
  }
  return captures;
}

export function buildStandings(players: LudoPlayer[]): Standing[] {
  return players
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      color: p.color,
      finished: p.pieces.filter((x) => x === FINISHED).length,
      progress: p.pieces.reduce((sum, x) => sum + (x === IN_BASE ? 0 : x + 1), 0),
    }))
    .sort((a, b) => b.finished - a.finished || b.progress - a.progress);
}

function nextTurn(state: LudoState): number {
  return (state.turn + 1) % state.players.length;
}

export function movePiece(state: LudoState, playerId: string, piece: number): Result {
  if (state.phase !== "moving") return fail("not_moving");
  const mover = currentPlayer(state);
  if (!mover || mover.id !== playerId) return fail("not_your_turn");
  const move = legalMoves(state).find((m) => m.piece === piece);
  if (!move || state.dice === null) return fail("illegal_move");

  const captures = capturesAt(state.players, mover, move.to);
  const finished = move.to === FINISHED;

  const players = state.players.map((p) => {
    if (p.id === mover.id) {
      return { ...p, pieces: p.pieces.map((x, i) => (i === piece ? move.to : x)) };
    }
    const hit = captures.filter((c) => c.playerId === p.id);
    if (hit.length === 0) return p;
    return { ...p, pieces: p.pieces.map((x, i) => (hit.some((c) => c.piece === i) ? IN_BASE : x)) };
  });

  const lastMove: LastMove = {
    seq: state.moveSeq + 1,
    playerId,
    piece,
    from: move.from,
    to: move.to,
    dice: state.dice,
    captures,
    finished,
  };
  const base = { ...state, players, moveSeq: state.moveSeq + 1, lastMove, dice: null, forfeit: false };

  const moverNow = players.find((p) => p.id === mover.id)!;
  if (moverNow.pieces.every((x) => x === FINISHED)) {
    return ok({
      ...base,
      phase: "game_over",
      winnerId: mover.id,
      standings: buildStandings(players),
      extraTurn: null,
    });
  }

  const extra: ExtraReason | null =
    captures.length > 0 ? "capture" : finished ? "home" : state.dice === 6 ? "six" : null;

  if (extra) {
    return ok({
      ...base,
      phase: "rolling",
      sixStreak: state.dice === 6 ? state.sixStreak : 0,
      extraTurn: extra,
    });
  }
  return ok({ ...base, phase: "rolling", turn: nextTurn(state), sixStreak: 0, extraTurn: null });
}

/** Sem jogada possível (ou três 6 seguidos): passa a vez. */
export function passTurn(state: LudoState): Result {
  if (state.phase !== "moving") return fail("not_moving");
  if (legalMoves(state).length > 0) return fail("has_moves");

  // 6 sem jogada ainda dá outra rolada, a menos que tenha sido o terceiro.
  const rollsAgain = state.dice === 6 && !state.forfeit;
  return ok({
    ...state,
    phase: "rolling",
    dice: null,
    forfeit: false,
    turn: rollsAgain ? state.turn : nextTurn(state),
    sixStreak: rollsAgain ? state.sixStreak : 0,
    extraTurn: rollsAgain ? "six" : null,
  });
}

export function pieceProgressTotal(player: LudoPlayer): number {
  return player.pieces.reduce((sum, x) => sum + (x === IN_BASE ? 0 : x + 1), 0);
}
