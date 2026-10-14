// Regras do Uno como funções puras sobre um UnoState — mesmo molde da Fodinha,
// do Ludo e do Dobble: o room server (party/uno.ts) é a autoridade e roda este
// código; o cliente só desenha o que recebe.
//
// Regras:
//  • 7 cartas pra cada um; vira uma carta no centro. Joga carta da mesma cor,
//    do mesmo número ou do mesmo símbolo; Coringa serve em qualquer hora.
//  • Pular: o próximo perde a vez. Inverter: muda o sentido (com 2 jogadores
//    vale como Pular). +2: o próximo compra 2 e perde a vez. Coringa: escolhe a cor.
//  • Coringa +4: escolhe a cor, o próximo compra 4 e perde a vez — e só pode ser
//    jogado por quem NÃO tem carta da cor atual na mão (o servidor confere, então
//    não precisa de "desafio").
//  • Sem carta que sirva (ou se quiser), compra uma: se der pra jogar ela, pode;
//    se não, passa. Sem empilhar +2/+4.
//  • UNO: ficou com UMA carta sem ter gritado UNO? Qualquer outro jogador pode
//    "pegar" antes de a próxima pessoa jogar: você compra 2. Dá pra gritar UNO
//    junto com a jogada (a última antes de ficar com uma) ou logo depois.
//  • Ganha quem esvaziar a mão primeiro.
//
// A mão de cada jogador é segredo: o que vai pros clientes é toView(state, quem).

import { UNO_COLORS, UnoCard, UnoColor, cardOf, cardPoints, DECK, isWild, matches, shuffle } from "./cards";

export type BotLevel = "easy" | "medium" | "hard";
export type UnoPhase = "lobby" | "playing" | "game_over";

export const BOT_PREFIX = "bot:";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const HAND_SIZE = 7;

type Rng = () => number;

export interface UnoStats {
  played: number;
  drawn: number;
  /** Vezes que EU peguei alguém sem UNO. */
  caught: number;
  /** Vezes que esqueci o UNO e fui pego. */
  forgot: number;
}
export const emptyStats = (): UnoStats => ({ played: 0, drawn: 0, caught: 0, forgot: 0 });

export interface UnoPlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  hand: number[];
  /** Já gritou UNO (vale enquanto sobrarem 1–2 cartas). */
  unoCalled: boolean;
}

/** O que aconteceu na última ação — vira linha do histórico e animação na tela. */
export type UnoEvent =
  | { t: "play"; p: string; card: number; color: UnoColor }
  | { t: "draw"; p: string; n: number; penalty?: boolean }
  | { t: "skip"; p: string }
  | { t: "reverse" }
  | { t: "pass"; p: string }
  | { t: "uno"; p: string }
  | { t: "catch"; by: string; target: string }
  | { t: "reshuffle" };

export interface Standing extends UnoStats {
  playerId: string;
  name: string;
  /** Cartas que sobraram na mão (0 = quem ganhou). */
  cards: number;
  /** Pontos das cartas que sobraram. */
  handPoints: number;
}

export interface UnoState {
  phase: UnoPhase;
  players: UnoPlayer[];
  hostId: string | null;
  /** Índice (em players) de quem joga. */
  turn: number;
  direction: 1 | -1;
  /** Monte de compra (segredo do servidor): a próxima carta é a última do array. */
  draw: number[];
  /** Pilha de descarte: o topo é a última. */
  discard: number[];
  /** Cor valendo agora (a do topo, ou a escolhida num coringa). */
  color: UnoColor;
  /** Carta que o jogador da vez acabou de comprar e PODE jogar (ou passar). */
  pendingDrawn: number | null;
  /** Quem ficou com 1 carta sem gritar UNO e ainda pode ser pego. */
  exposed: string | null;
  events: UnoEvent[];
  /** Sobe a cada ação que mudou o jogo — a tela usa pra saber o que é novo. */
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  /** Sobe a cada partida iniciada. */
  gameNumber: number;
  stats?: Record<string, UnoStats>;
}

export type Result = { ok: true; state: UnoState } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const ok = (state: UnoState): Result => ({ ok: true, state });

export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);

export function createLobby(): UnoState {
  return {
    phase: "lobby",
    players: [],
    hostId: null,
    turn: 0,
    direction: 1,
    draw: [],
    discard: [],
    color: "red",
    pendingDrawn: null,
    exposed: null,
    events: [],
    eventSeq: 0,
    winnerId: null,
    standings: null,
    gameNumber: 0,
    stats: {},
  };
}

// ── Lobby ──────────────────────────────────────────────────────────────────

function pickHost(players: UnoPlayer[], current: string | null): string | null {
  if (players.some((p) => p.id === current && !p.bot)) return current;
  return players.find((p) => !p.bot)?.id ?? null;
}

const newPlayer = (id: string, name: string, avatarUrl: string | null | undefined, bot?: BotLevel): UnoPlayer => ({
  id,
  name,
  avatarUrl: avatarUrl ?? null,
  bot,
  connected: true,
  hand: [],
  unoCalled: false,
});

export function joinLobby(state: UnoState, who: { id: string; name: string; avatarUrl?: string | null }): Result {
  const existing = state.players.find((p) => p.id === who.id);
  if (existing) {
    // Reconexão (ou refresh): só atualiza nome/foto e marca como conectado.
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

export function setPlayerConnected(state: UnoState, id: string, connected: boolean): UnoState {
  if (!state.players.some((p) => p.id === id)) return state;
  return { ...state, players: state.players.map((p) => (p.id === id && !p.bot ? { ...p, connected } : p)) };
}

/** Tira do lobby; numa partida rolando só marca como desconectado (um bot joga por ele). */
export function removePlayer(state: UnoState, id: string): UnoState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
}

const BOT_NAMES = ["Robô Zeca", "Robô Bia", "Robô Tião", "Robô Dani", "Robô Juca", "Robô Lia", "Robô Nando", "Robô Mel"];

export function addBot(state: UnoState, level: BotLevel): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  let n = 1;
  while (state.players.some((p) => p.id === `${BOT_PREFIX}${n}`)) n++;
  return ok({ ...state, players: [...state.players, newPlayer(`${BOT_PREFIX}${n}`, BOT_NAMES[(n - 1) % BOT_NAMES.length], null, level)] });
}

export function setBotLevel(state: UnoState, botId: string, level: BotLevel): Result {
  if (!state.players.some((p) => p.id === botId && p.bot)) return fail("not_a_bot");
  return ok({ ...state, players: state.players.map((p) => (p.id === botId ? { ...p, bot: level } : p)) });
}

export function canStart(state: UnoState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS;
}

// ── Peças do jogo ───────────────────────────────────────────────────────────

const wrap = (n: number, i: number) => ((i % n) + n) % n;

export const currentPlayer = (state: UnoState): UnoPlayer | undefined => state.players[state.turn];
export const topCard = (state: UnoState): UnoCard => cardOf(state.discard[state.discard.length - 1]);

/** Tira `n` cartas do monte; acabou, embaralha o descarte (menos o topo) de volta. */
function takeCards(draw: number[], discard: number[], n: number, rng: Rng) {
  let d = [...draw];
  let pile = [...discard];
  let reshuffled = false;
  const cards: number[] = [];
  for (let i = 0; i < n; i++) {
    if (d.length === 0) {
      if (pile.length <= 1) break; // não sobrou nada pra comprar
      const top = pile[pile.length - 1];
      d = shuffle(pile.slice(0, -1), rng);
      pile = [top];
      reshuffled = true;
    }
    cards.push(d.pop()!);
  }
  return { cards, draw: d, discard: pile, reshuffled };
}

const bump = (stats: Record<string, UnoStats> | undefined, id: string, field: keyof UnoStats, by = 1) => ({
  ...stats,
  [id]: { ...(stats?.[id] ?? emptyStats()), [field]: (stats?.[id]?.[field] ?? 0) + by },
});

/** A carta cabe agora na mão dessa pessoa (inclui a regra do +4)? */
function playable(state: UnoState, player: UnoPlayer, cardId: number): boolean {
  const card = cardOf(cardId);
  if (!matches(card, topCard(state), state.color)) return false;
  // +4 só pra quem não tem carta da cor atual.
  if (card.kind === "wild4" && player.hand.some((h) => cardOf(h).color === state.color)) return false;
  return true;
}

/** Ids das cartas que a pessoa pode jogar agora (vazio se não é a vez dela). */
export function legalCards(state: UnoState, playerId: string): number[] {
  if (state.phase !== "playing") return [];
  const p = currentPlayer(state);
  if (!p || p.id !== playerId) return [];
  // Comprou uma carta jogável: só ela (ou passar).
  if (state.pendingDrawn !== null) return p.hand.includes(state.pendingDrawn) && playable(state, p, state.pendingDrawn) ? [state.pendingDrawn] : [];
  return p.hand.filter((id) => playable(state, p, id));
}

/** Pontos das cartas que a pessoa ainda tem na mão. */
export const handPoints = (p: UnoPlayer) => p.hand.reduce((n, id) => n + cardPoints(cardOf(id)), 0);

// ── Começo ─────────────────────────────────────────────────────────────────

export function startGame(state: UnoState, rng: Rng = Math.random): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");

  let deck = shuffle(
    DECK.map((c) => c.id),
    rng
  );
  const hands: number[][] = state.players.map(() => []);
  for (let r = 0; r < HAND_SIZE; r++) for (const h of hands) h.push(deck.pop()!);

  // A primeira carta do centro nunca é Coringa +4 (volta pro fundo do monte).
  let starter = deck.pop()!;
  while (cardOf(starter).kind === "wild4") {
    deck = [starter, ...deck];
    starter = deck.pop()!;
  }
  const sc = cardOf(starter);
  const n = state.players.length;
  let turn = Math.floor(rng() * n);
  let direction: 1 | -1 = 1;
  const color: UnoColor = sc.color ?? UNO_COLORS[Math.floor(rng() * UNO_COLORS.length)];
  const events: UnoEvent[] = [];
  let discard = [starter];

  // O efeito da carta inicial vale pra quem joga primeiro.
  if (sc.kind === "skip" || (sc.kind === "reverse" && n === 2)) {
    events.push({ t: "skip", p: state.players[turn].id });
    turn = wrap(n, turn + 1);
  } else if (sc.kind === "reverse") {
    direction = -1;
    events.push({ t: "reverse" });
  } else if (sc.kind === "draw2") {
    const took = takeCards(deck, discard, 2, rng);
    deck = took.draw;
    discard = took.discard;
    hands[turn] = [...hands[turn], ...took.cards];
    events.push({ t: "draw", p: state.players[turn].id, n: 2, penalty: true }, { t: "skip", p: state.players[turn].id });
    turn = wrap(n, turn + 1);
  }

  return ok({
    ...state,
    phase: "playing",
    players: state.players.map((p, i) => ({ ...p, hand: hands[i], unoCalled: false })),
    turn,
    direction,
    draw: deck,
    discard,
    color,
    pendingDrawn: null,
    exposed: null,
    events,
    eventSeq: state.eventSeq + 1,
    winnerId: null,
    standings: null,
    gameNumber: state.gameNumber + 1,
    stats: {},
  });
}

/** Volta pro lobby depois da partida (revanche), mantendo bots e quem segue conectado. */
export function returnToLobby(state: UnoState): UnoState {
  const players = state.players.filter((p) => p.bot || p.connected).map((p) => ({ ...p, hand: [], unoCalled: false }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    turn: 0,
    direction: 1,
    draw: [],
    discard: [],
    pendingDrawn: null,
    exposed: null,
    events: [],
    winnerId: null,
    standings: null,
  };
}

// ── Jogo ───────────────────────────────────────────────────────────────────

function buildStandings(state: UnoState, winnerId: string): Standing[] {
  return state.players
    .map((p) => ({
      ...emptyStats(),
      ...state.stats?.[p.id],
      playerId: p.id,
      name: p.name,
      cards: p.hand.length,
      handPoints: handPoints(p),
    }))
    .sort((a, b) => {
      if (a.playerId === winnerId) return -1;
      if (b.playerId === winnerId) return 1;
      return a.cards - b.cards || a.handPoints - b.handPoints;
    });
}

/** Quem age (de quem é a vez) acabou de agir: o UNO esquecido de quem jogou antes já não pode ser pego. */
const settle = (state: UnoState, extra: Partial<UnoState>): UnoState => ({
  ...state,
  ...extra,
  eventSeq: state.eventSeq + 1,
});

export function playCard(state: UnoState, playerId: string, cardId: number, color: UnoColor | undefined, callUno: boolean, rng: Rng = Math.random): Result {
  if (state.phase !== "playing") return fail("not_playing");
  const me = currentPlayer(state);
  if (!me || me.id !== playerId) return fail("not_your_turn");
  if (!me.hand.includes(cardId)) return fail("not_in_hand");
  const card = cardOf(cardId);
  if (state.pendingDrawn !== null && cardId !== state.pendingDrawn) return fail("must_play_drawn");
  // Coringa sempre combina com o topo: se não pode ser jogado, é a regra do +4 (tem carta da cor atual).
  if (!legalCards(state, playerId).includes(cardId)) return fail(card.kind === "wild4" ? "wild4_blocked" : "illegal_card");
  if (isWild(card) && (!color || !UNO_COLORS.includes(color))) return fail("need_color");

  const n = state.players.length;
  const newColor: UnoColor = isWild(card) ? (color as UnoColor) : (card.color as UnoColor);
  const hand = me.hand.filter((id) => id !== cardId);
  const called = me.unoCalled || (callUno && hand.length === 1);
  const events: UnoEvent[] = [{ t: "play", p: me.id, card: cardId, color: newColor }];
  if (callUno && hand.length === 1 && !me.unoCalled) events.push({ t: "uno", p: me.id });

  let players = state.players.map((p) => (p.id === me.id ? { ...p, hand, unoCalled: called } : p));
  let draw = state.draw;
  let discard = [...state.discard, cardId];
  let direction = state.direction;
  let turn = wrap(n, state.turn + direction);
  let stats = bump(state.stats, me.id, "played");

  const hitNext = (count: number) => {
    const target = turn; // o próximo, antes de pular
    const took = takeCards(draw, discard, count, rng);
    draw = took.draw;
    discard = took.discard;
    if (took.reshuffled) events.push({ t: "reshuffle" });
    const t = players[target];
    players = players.map((p, i) => (i === target ? { ...p, hand: [...p.hand, ...took.cards], unoCalled: false } : p));
    stats = bump(stats, t.id, "drawn", took.cards.length);
    events.push({ t: "draw", p: t.id, n: took.cards.length, penalty: true }, { t: "skip", p: t.id });
    turn = wrap(n, target + direction);
  };

  switch (card.kind) {
    case "skip": {
      events.push({ t: "skip", p: players[turn].id });
      turn = wrap(n, turn + direction);
      break;
    }
    case "reverse": {
      if (n === 2) {
        // Com 2 jogadores, inverter vale como pular: quem jogou joga de novo.
        events.push({ t: "skip", p: players[turn].id });
        turn = wrap(n, turn + direction);
      } else {
        direction = (direction === 1 ? -1 : 1) as 1 | -1;
        events.push({ t: "reverse" });
        turn = wrap(n, state.turn + direction);
      }
      break;
    }
    case "draw2":
      hitNext(2);
      break;
    case "wild4":
      hitNext(4);
      break;
    default:
      break;
  }

  const base: Partial<UnoState> = { players, draw, discard, color: newColor, direction, turn, pendingDrawn: null, events, stats };

  if (hand.length === 0) {
    const finished = { ...state, ...base, phase: "game_over" as const, winnerId: me.id, exposed: null };
    return ok(settle(finished as UnoState, { standings: buildStandings(finished as UnoState, me.id) }));
  }
  // Ficou com uma carta sem ter gritado UNO: vulnerável até a próxima pessoa agir.
  return ok(settle(state, { ...base, exposed: hand.length === 1 && !called ? me.id : null }));
}

export function drawCard(state: UnoState, playerId: string, rng: Rng = Math.random): Result {
  if (state.phase !== "playing") return fail("not_playing");
  const me = currentPlayer(state);
  if (!me || me.id !== playerId) return fail("not_your_turn");
  if (state.pendingDrawn !== null) return fail("already_drew");

  const n = state.players.length;
  const took = takeCards(state.draw, state.discard, 1, rng);
  const events: UnoEvent[] = [];
  if (took.reshuffled) events.push({ t: "reshuffle" });
  const next = wrap(n, state.turn + state.direction);

  // Nada pra comprar (todas as cartas estão nas mãos): só passa.
  if (took.cards.length === 0) {
    events.push({ t: "pass", p: me.id });
    return ok(settle(state, { turn: next, pendingDrawn: null, exposed: null, events }));
  }

  const [drawn] = took.cards;
  const players = state.players.map((p) => (p.id === me.id ? { ...p, hand: [...p.hand, drawn], unoCalled: false } : p));
  events.push({ t: "draw", p: me.id, n: 1 });
  const stats = bump(state.stats, me.id, "drawn");
  const after: UnoState = { ...state, players, draw: took.draw, discard: took.discard };
  if (playable(after, players[state.turn], drawn)) {
    // Dá pra jogar a carta comprada: a vez continua com ela na mão.
    return ok(settle(state, { players, draw: took.draw, discard: took.discard, pendingDrawn: drawn, exposed: null, events, stats }));
  }
  events.push({ t: "pass", p: me.id });
  return ok(settle(state, { players, draw: took.draw, discard: took.discard, turn: next, pendingDrawn: null, exposed: null, events, stats }));
}

/** Comprou uma carta que dava pra jogar e preferiu não jogar. */
export function passTurn(state: UnoState, playerId: string): Result {
  if (state.phase !== "playing") return fail("not_playing");
  const me = currentPlayer(state);
  if (!me || me.id !== playerId) return fail("not_your_turn");
  if (state.pendingDrawn === null) return fail("must_draw");
  return ok(settle(state, { turn: wrap(state.players.length, state.turn + state.direction), pendingDrawn: null, exposed: null, events: [{ t: "pass", p: me.id }] }));
}

/** Pode gritar UNO agora? Com 1 carta (a qualquer hora) ou com 2 na sua vez (antes de jogar a penúltima). */
export function canCallUno(state: UnoState, playerId: string): boolean {
  if (state.phase !== "playing") return false;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.unoCalled) return false;
  return p.hand.length === 1 || (p.hand.length === 2 && currentPlayer(state)?.id === playerId);
}

export function callUno(state: UnoState, playerId: string): Result {
  if (state.phase !== "playing") return fail("not_playing");
  if (!state.players.some((p) => p.id === playerId)) return fail("not_in_room");
  if (!canCallUno(state, playerId)) return fail("cannot_uno");
  return ok(
    settle(state, {
      players: state.players.map((p) => (p.id === playerId ? { ...p, unoCalled: true } : p)),
      exposed: state.exposed === playerId ? null : state.exposed,
      events: [{ t: "uno", p: playerId }],
    })
  );
}

/** Pega quem ficou com 1 carta sem gritar UNO: ele compra 2. */
export function catchUno(state: UnoState, catcherId: string, rng: Rng = Math.random): Result {
  if (state.phase !== "playing") return fail("not_playing");
  if (!state.players.some((p) => p.id === catcherId)) return fail("not_in_room");
  const targetId = state.exposed;
  if (!targetId || targetId === catcherId) return fail("nobody_to_catch");

  const took = takeCards(state.draw, state.discard, 2, rng);
  const events: UnoEvent[] = [{ t: "catch", by: catcherId, target: targetId }];
  if (took.reshuffled) events.push({ t: "reshuffle" });
  events.push({ t: "draw", p: targetId, n: took.cards.length, penalty: true });
  let stats = bump(state.stats, catcherId, "caught");
  stats = bump(stats, targetId, "forgot");
  stats = bump(stats, targetId, "drawn", took.cards.length);
  return ok(
    settle(state, {
      players: state.players.map((p) => (p.id === targetId ? { ...p, hand: [...p.hand, ...took.cards], unoCalled: false } : p)),
      draw: took.draw,
      discard: took.discard,
      exposed: null,
      events,
      stats,
    })
  );
}

// ── O que cada cliente enxerga ─────────────────────────────────────────────

export interface UnoPlayerView {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  /** Quantas cartas tem (a mão dos outros nunca sai do servidor). */
  cards: number;
  unoCalled: boolean;
}

export interface UnoView {
  phase: UnoPhase;
  players: UnoPlayerView[];
  hostId: string | null;
  turn: number;
  direction: 1 | -1;
  /** A MINHA mão (vazia pra quem só assiste). */
  hand: number[];
  /** O que posso jogar agora. */
  legal: number[];
  top: number | null;
  color: UnoColor | null;
  drawCount: number;
  discardCount: number;
  /** As últimas cartas do descarte (a do topo por último), pro desenho da pilha. */
  recent: number[];
  /** Comprei uma carta jogável: posso jogá-la ou passar. */
  drawnCard: number | null;
  canDraw: boolean;
  canPass: boolean;
  canUno: boolean;
  canCatch: boolean;
  exposed: string | null;
  events: UnoEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
}

export function toView(state: UnoState, viewerId: string | null): UnoView {
  const me = state.players.find((p) => p.id === viewerId);
  const myTurn = state.phase === "playing" && !!me && currentPlayer(state)?.id === me.id;
  const inGame = state.phase !== "lobby";
  return {
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      bot: p.bot,
      connected: p.connected,
      cards: p.hand.length,
      unoCalled: p.unoCalled,
    })),
    hostId: state.hostId,
    turn: state.turn,
    direction: state.direction,
    hand: me ? [...me.hand] : [],
    legal: me ? legalCards(state, me.id) : [],
    top: inGame && state.discard.length > 0 ? state.discard[state.discard.length - 1] : null,
    color: inGame ? state.color : null,
    drawCount: state.draw.length,
    discardCount: state.discard.length,
    recent: state.discard.slice(-4),
    drawnCard: myTurn ? state.pendingDrawn : null,
    canDraw: myTurn && state.pendingDrawn === null,
    canPass: myTurn && state.pendingDrawn !== null,
    canUno: !!me && canCallUno(state, me.id),
    canCatch: state.phase === "playing" && !!me && !!state.exposed && state.exposed !== me.id,
    exposed: state.exposed,
    events: state.events,
    eventSeq: state.eventSeq,
    winnerId: state.winnerId,
    standings: state.standings,
    gameNumber: state.gameNumber,
  };
}
