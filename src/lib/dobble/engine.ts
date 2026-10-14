// Regras do Dobble (Spot It!) como funções puras sobre um DobbleState — mesmo
// padrão da Fodinha e do Ludo: o room server (party/dobble.ts) é a autoridade
// e roda este código; o cliente só desenha o que recebe.
//
// Cada jogador tem uma carta virada na frente dele e há uma carta no centro.
// A carta do centro e a de qualquer jogador têm SEMPRE exatamente um símbolo
// em comum: quem achar e "gritar" primeiro (clicar nele) ganha a rodada.
//
// Dois modos, como na caixa do jogo:
//  • Torre — o vencedor leva a carta do centro e a põe em cima da sua pilha
//    (ela vira a carta dele). Acabaram as cartas do centro: quem tem a maior
//    pilha vence.
//  • Poço  — cada um tem um monte virado pra baixo; o vencedor da rodada joga
//    a carta dele no centro e vira a próxima. Quem esvaziar o monte primeiro vence.
//
// Como no julgamento da vaza da Fodinha, a rodada ganha fica parada na mesa
// (fase "round_end") antes de avançar — todo mundo vê quem achou e qual era o símbolo.

import { cardHasSymbol, commonSymbol, newDeck } from "./cards";

export type BotLevel = "easy" | "medium" | "hard";
export type DobbleMode = "tower" | "well";
export type DobblePhase = "lobby" | "countdown" | "playing" | "round_end" | "game_over";

export const BOT_PREFIX = "bot:";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** Errou o símbolo: fica sem poder jogar por esse tempo. */
export const LOCK_MS = 2000;

export interface DobblePlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  /** A carta virada na frente do jogador (null = ainda não virou / acabou). */
  hand: number | null;
  /** Poço: o monte virado pra baixo (a ordem é segredo do servidor). */
  pile: number[];
  /** Torre: quantas cartas o jogador tem (a inicial conta). */
  stack: number;
}

export interface Claim {
  seq: number;
  round: number;
  playerId: string;
  symbol: number;
  /** Quanto tempo a rodada levou pra ser ganha (relógio do servidor); null se não dá pra saber. */
  reactionMs: number | null;
  /** As duas cartas no momento do acerto (o estado só troca elas ao avançar). */
  centerCard: number;
  handCard: number;
}

export interface Wrong {
  seq: number;
  playerId: string;
  symbol: number;
}

/** Números da partida de cada jogador (só pra tela de fim de jogo — não mexem nas regras). */
export interface DobbleStats {
  /** Rodadas ganhas. */
  won: number;
  /** Cliques num símbolo errado. */
  wrong: number;
  /** Melhor tempo (ms) entre as rodadas que ganhou. */
  fastestMs: number | null;
}

export const emptyStats = (): DobbleStats => ({ won: 0, wrong: 0, fastestMs: null });

export interface Standing extends DobbleStats {
  playerId: string;
  name: string;
  /** Torre: cartas na pilha. Poço: cartas que ainda faltavam jogar. */
  cards: number;
}

export interface DobbleState {
  phase: DobblePhase;
  mode: DobbleMode;
  players: DobblePlayer[];
  hostId: string | null;
  center: number | null;
  /** Torre: cartas do centro ainda viradas pra baixo (segredo do servidor). */
  draw: number[];
  round: number;
  lastClaim: Claim | null;
  claimSeq: number;
  lastWrong: Wrong | null;
  wrongSeq: number;
  /** Até quando (ms, relógio do servidor) cada jogador está de castigo. */
  lockedUntil: Record<string, number>;
  winnerId: string | null;
  standings: Standing[] | null;
  /** Sobe a cada partida — a UI usa pra zerar animações. */
  gameNumber: number;
  /** Quando (relógio do servidor) a rodada atual abriu — base do tempo de reação. */
  roundStartedAt?: number;
  /** Estatísticas por jogador (ausente em salas salvas antes deste campo existir). */
  stats?: Record<string, DobbleStats>;
}

export type Result = { ok: true; state: DobbleState } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const ok = (state: DobbleState): Result => ({ ok: true, state });

export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);

export function createLobby(): DobbleState {
  return {
    phase: "lobby",
    mode: "tower",
    players: [],
    hostId: null,
    center: null,
    draw: [],
    round: 0,
    lastClaim: null,
    claimSeq: 0,
    lastWrong: null,
    wrongSeq: 0,
    lockedUntil: {},
    winnerId: null,
    standings: null,
    gameNumber: 0,
  };
}

// ── Lobby ──────────────────────────────────────────────────────────────────

const blank = (): Pick<DobblePlayer, "hand" | "pile" | "stack"> => ({ hand: null, pile: [], stack: 0 });

function pickHost(players: DobblePlayer[], current: string | null): string | null {
  if (players.some((p) => p.id === current && !p.bot)) return current;
  return players.find((p) => !p.bot)?.id ?? null;
}

export function joinLobby(state: DobbleState, who: { id: string; name: string; avatarUrl?: string | null }): Result {
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
  const players = [
    ...state.players,
    { id: who.id, name: who.name, avatarUrl: who.avatarUrl ?? null, connected: true, ...blank() },
  ];
  return ok({ ...state, players, hostId: pickHost(players, state.hostId) });
}

export function setPlayerConnected(state: DobbleState, id: string, connected: boolean): DobbleState {
  if (!state.players.some((p) => p.id === id)) return state;
  return { ...state, players: state.players.map((p) => (p.id === id && !p.bot ? { ...p, connected } : p)) };
}

/** Tira do lobby; numa partida rolando só marca como desconectado. */
export function removePlayer(state: DobbleState, id: string): DobbleState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
}

export function setMode(state: DobbleState, mode: DobbleMode): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (mode !== "tower" && mode !== "well") return fail("bad_mode");
  return ok({ ...state, mode });
}

const BOT_NAMES = ["Robô Zeca", "Robô Bia", "Robô Tião", "Robô Dani", "Robô Juca", "Robô Lia", "Robô Nando", "Robô Mel"];

export function addBot(state: DobbleState, level: BotLevel): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  let n = 1;
  while (state.players.some((p) => p.id === `${BOT_PREFIX}${n}`)) n++;
  const bot: DobblePlayer = {
    id: `${BOT_PREFIX}${n}`,
    name: BOT_NAMES[(n - 1) % BOT_NAMES.length],
    avatarUrl: null,
    bot: level,
    connected: true,
    ...blank(),
  };
  return ok({ ...state, players: [...state.players, bot] });
}

export function setBotLevel(state: DobbleState, botId: string, level: BotLevel): Result {
  if (!state.players.some((p) => p.id === botId && p.bot)) return fail("not_a_bot");
  return ok({ ...state, players: state.players.map((p) => (p.id === botId ? { ...p, bot: level } : p)) });
}

export function canStart(state: DobbleState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS;
}

/** Embaralha, distribui e abre a contagem regressiva (as cartas ainda não aparecem). */
export function startGame(state: DobbleState, rng: () => number = Math.random): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");

  const deck = newDeck(rng);
  const center = deck.pop()!;
  const n = state.players.length;
  let draw: number[] = [];
  let players: DobblePlayer[];

  if (state.mode === "tower") {
    // Uma carta pra cada um; o resto vira o monte de onde saem as cartas do centro.
    players = state.players.map((p) => ({ ...p, hand: deck.pop()!, pile: [], stack: 1 }));
    draw = deck;
  } else {
    // Poço: o baralho é dividido por igual (sobras ficam de fora), tudo virado pra baixo.
    const per = Math.floor(deck.length / n);
    players = state.players.map((p, i) => {
      const pile = deck.slice(i * per, (i + 1) * per);
      return { ...p, hand: null, pile, stack: pile.length };
    });
  }

  return ok({
    ...state,
    phase: "countdown",
    players,
    center,
    draw,
    round: 0,
    lastClaim: null,
    lastWrong: null,
    lockedUntil: {},
    winnerId: null,
    standings: null,
    gameNumber: state.gameNumber + 1,
    roundStartedAt: 0,
    stats: {},
  });
}

/** Fim da contagem: vira as cartas e abre a primeira rodada (`now`: relógio do servidor, pro tempo de reação). */
export function beginPlay(state: DobbleState, now = 0): Result {
  if (state.phase !== "countdown") return fail("not_countdown");
  const players =
    state.mode === "well"
      ? state.players.map((p) => ({ ...p, hand: p.pile[0] ?? null, pile: p.pile.slice(1) }))
      : state.players;
  return ok({ ...state, phase: "playing", players, round: 1, roundStartedAt: now });
}

/** Volta pro lobby depois da partida, mantendo modo, bots e quem segue conectado. */
export function returnToLobby(state: DobbleState): DobbleState {
  const players = state.players.filter((p) => p.bot || p.connected).map((p) => ({ ...p, ...blank() }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    center: null,
    draw: [],
    round: 0,
    lastClaim: null,
    lastWrong: null,
    lockedUntil: {},
    winnerId: null,
    standings: null,
  };
}

// ── Jogo ───────────────────────────────────────────────────────────────────

/** Cartas que o jogador ainda tem (Torre: a pilha; Poço: o que falta jogar). */
export function cardsOf(state: DobbleState, p: DobblePlayer): number {
  return state.mode === "tower" ? p.stack : p.pile.length + (p.hand !== null ? 1 : 0);
}

/** O símbolo certo pro jogador agora (usado pelos bots e pelos testes). */
export function matchFor(state: DobbleState, playerId: string): number | null {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.hand === null || state.center === null) return null;
  return commonSymbol(p.hand, state.center);
}

/**
 * Um jogador gritou um símbolo. Acertou: ganha a rodada. Errou: fica de
 * castigo (LOCK_MS) — o erro não é um "erro de API", é parte do jogo, então
 * volta ok com o estado novo (todo mundo vê quem errou).
 */
export function claim(state: DobbleState, playerId: string, symbol: number, round: number, now: number): Result {
  if (state.phase !== "playing") return fail("not_playing");
  if (round !== state.round) return fail("late");
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("not_in_room");
  if (!Number.isInteger(symbol)) return fail("bad_symbol");
  if ((state.lockedUntil[playerId] ?? 0) > now) return fail("locked");
  if (player.hand === null || state.center === null) return fail("no_card");

  const mine = state.stats?.[playerId] ?? emptyStats();

  if (cardHasSymbol(player.hand, symbol) && cardHasSymbol(state.center, symbol)) {
    const seq = state.claimSeq + 1;
    const reactionMs = state.roundStartedAt ? Math.max(0, now - state.roundStartedAt) : null;
    const fastestMs = reactionMs === null ? mine.fastestMs : mine.fastestMs === null ? reactionMs : Math.min(mine.fastestMs, reactionMs);
    return ok({
      ...state,
      phase: "round_end",
      claimSeq: seq,
      lastClaim: { seq, round, playerId, symbol, reactionMs, centerCard: state.center, handCard: player.hand },
      stats: { ...state.stats, [playerId]: { ...mine, won: mine.won + 1, fastestMs } },
      players: state.mode === "tower" ? state.players.map((p) => (p.id === playerId ? { ...p, stack: p.stack + 1 } : p)) : state.players,
    });
  }

  const seq = state.wrongSeq + 1;
  return ok({
    ...state,
    wrongSeq: seq,
    lastWrong: { seq, playerId, symbol },
    stats: { ...state.stats, [playerId]: { ...mine, wrong: mine.wrong + 1 } },
    lockedUntil: { ...state.lockedUntil, [playerId]: now + LOCK_MS },
  });
}

function buildStandings(state: DobbleState, winnerId: string): Standing[] {
  return state.players
    .map((p) => ({ ...emptyStats(), ...state.stats?.[p.id], playerId: p.id, name: p.name, cards: cardsOf(state, p) }))
    .sort((a, b) => {
      if (a.playerId === winnerId) return -1;
      if (b.playerId === winnerId) return 1;
      // Torre: mais cartas é melhor. Poço: menos cartas faltando é melhor.
      return state.mode === "tower" ? b.cards - a.cards : a.cards - b.cards;
    });
}

/** Passa da rodada ganha (parada na mesa) pra próxima — ou pro fim do jogo. */
export function advanceRound(state: DobbleState, now = 0): Result {
  if (state.phase !== "round_end" || !state.lastClaim) return fail("not_round_end");
  const { playerId: winnerId, centerCard, handCard } = state.lastClaim;
  const base = { ...state, lockedUntil: {} };

  if (state.mode === "tower") {
    // O vencedor leva a carta do centro: ela passa a ser a carta dele.
    const players = state.players.map((p) => (p.id === winnerId ? { ...p, hand: centerCard } : p));
    if (state.draw.length === 0) {
      const done = { ...base, players, center: null };
      // Torre acaba quando o centro esvazia: vence quem tem mais cartas (empate: vale a ordem dos assentos).
      const top = [...players].sort((a, b) => b.stack - a.stack)[0];
      return ok({ ...done, phase: "game_over", winnerId: top.id, standings: buildStandings(done, top.id) });
    }
    const draw = state.draw.slice(0, -1);
    return ok({ ...base, players, draw, center: state.draw[state.draw.length - 1], phase: "playing", round: state.round + 1, roundStartedAt: now });
  }

  // Poço: o vencedor joga a carta dele no centro e vira a próxima do monte.
  const players = state.players.map((p) =>
    p.id === winnerId ? { ...p, hand: p.pile[0] ?? null, pile: p.pile.slice(1) } : p
  );
  const winner = players.find((p) => p.id === winnerId)!;
  if (winner.hand === null) {
    const done = { ...base, players, center: handCard };
    return ok({ ...done, phase: "game_over", winnerId, standings: buildStandings(done, winnerId) });
  }
  return ok({ ...base, players, center: handCard, phase: "playing", round: state.round + 1, roundStartedAt: now });
}

// ── O que os clientes enxergam ─────────────────────────────────────────────

export interface DobblePlayerView {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  hand: number | null;
  /** Torre: pilha. Poço: cartas que faltam. */
  cards: number;
}

/**
 * Estado público: o que está virado pra cima (cartas na frente de cada um e no
 * centro) aparece; a ordem dos montes (segredo — dava pra "se preparar" pra
 * próxima rodada) nunca sai do servidor. Durante a contagem tudo está virado
 * pra baixo.
 */
export interface DobbleView {
  phase: DobblePhase;
  mode: DobbleMode;
  players: DobblePlayerView[];
  hostId: string | null;
  center: number | null;
  /** Torre: cartas que ainda vão entrar no centro. */
  drawCount: number;
  round: number;
  lastClaim: Claim | null;
  lastWrong: Wrong | null;
  lockedUntil: Record<string, number>;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
}

export function toView(state: DobbleState): DobbleView {
  const faceUp = state.phase === "playing" || state.phase === "round_end" || state.phase === "game_over";
  return {
    phase: state.phase,
    mode: state.mode,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      bot: p.bot,
      connected: p.connected,
      hand: faceUp ? p.hand : null,
      cards: state.phase === "lobby" ? 0 : cardsOf(state, p),
    })),
    hostId: state.hostId,
    center: faceUp ? state.center : null,
    drawCount: state.draw.length,
    round: state.round,
    lastClaim: state.lastClaim,
    lastWrong: state.lastWrong,
    lockedUntil: state.lockedUntil,
    winnerId: state.winnerId,
    standings: state.standings,
    gameNumber: state.gameNumber,
  };
}
