// Regras do Monopoly / Banco Imobiliário como funções puras sobre um MonoState — o mesmo molde do
// Uno e do Ludo: o room server (party/monopoly.ts) é a autoridade e roda este código; o cliente só
// desenha o que recebe. UM motor serve as duas edições (ver editions/): o que muda — tabuleiro,
// cartas, dinheiro, leilão — vem dos dados da edição.
//
// Regras (as do jogo de tabuleiro):
//  • Cada um começa com o dinheiro da edição na casa de partida. Joga-se 2 dados e anda a soma.
//    Passar (ou cair) na partida paga o salário.
//  • Casa livre (rua, ferrovia/companhia): compre pelo preço. Recusou? No Monopoly vai a leilão
//    entre todos; no Banco Imobiliário a propriedade só fica livre.
//  • Casa com dono: pague o aluguel. Rua com o grupo de cor inteiro e sem casas paga o dobro;
//    com 1–4 casas ou hotel paga a tabela. Hipotecada não cobra. Ferrovias/companhias cobram
//    por quantas o dono tem; companhias de serviço, pelo dado.
//  • Construir: só com o grupo de cor inteiro (nenhuma hipotecada), UMA casa por vez e sempre
//    parelho dentro do grupo; 4 casas viram hotel. O banco tem 32 casas e 12 hotéis.
//  • Hipoteca: metade do preço, sem casas no grupo; tirar custa o valor + 10%.
//  • Cartas (Sorte / Caixa Comunitária; no Banco Imobiliário, "Sorte ou Revés"), impostos, prisão.
//  • Prisão: vá pra lá pela casa "Vá para a Prisão", por carta ou por 3 duplas seguidas. Saia
//    pagando a fiança, com a carta, ou tirando dupla (3 tentativas; na 3ª paga e anda).
//  • Dobrou os dados? Joga de novo (a 3ª dupla seguida vai pra prisão).
//  • Trocas: na sua vez, propõe a outro jogador dinheiro/propriedades/cartas; ele aceita ou não.
//  • Faltou dinheiro pra pagar? Vende casas / hipoteca pra levantar; sem jeito, declara falência
//    (tudo vai pro credor, ou pro banco). Ganha quem sobrar — ou, com limite de rodadas, quem
//    tiver mais patrimônio quando elas acabarem.

import {
  Card,
  CardEffect,
  DeckId,
  Edition,
  EditionId,
  HOTELS_TOTAL,
  HOUSES_TOTAL,
  OwnableSquare,
  RentSet,
  SQUARE_COUNT,
  Square,
  getEdition,
  groupSquares,
  isOwnable,
  mortgageValue,
  unmortgageCost,
} from "./editions";

export type BotLevel = "easy" | "medium" | "hard";
export type MonoPhase = "lobby" | "playing" | "game_over";
/** O que o jogo espera agora: rolar, decidir a compra, leilão, dívida, ou fase livre (construir/trocar/encerrar). */
export type Step = "roll" | "buy" | "auction" | "debt" | "manage";

export const BOT_PREFIX = "bot:";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
/** Opções de duração da partida: 0 = até a falência; senão, número de rodadas (todos jogaram = 1 rodada). */
export const LIMIT_OPTIONS = [0, 20, 40] as const;
export const STATE_VERSION = 1;

type Rng = () => number;

export interface MonoStats {
  rentIn: number;
  rentOut: number;
  bought: number;
  built: number;
  jailed: number;
  trades: number;
  doubles: number;
}
export const emptyStats = (): MonoStats => ({ rentIn: 0, rentOut: 0, bought: 0, built: 0, jailed: 0, trades: 0, doubles: 0 });

export interface JailCard {
  deck: DeckId;
  idx: number;
}

export interface MonoPlayer {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: BotLevel;
  connected: boolean;
  cash: number;
  pos: number;
  /** null = livre; senão, quantas vezes já tentou sair tirando dupla (0, 1 ou 2). */
  jail: number | null;
  jailCards: JailCard[];
  bankrupt: boolean;
}

export interface PropState {
  owner: string | null;
  /** 0–4 casas; 5 = hotel. */
  houses: number;
  mortgaged: boolean;
}

export type DebtReason = "rent" | "tax" | "card" | "bail" | "repairs";

export interface Debt {
  amount: number;
  /** Quem recebe: um jogador, "bank" ou "each" (cada um dos outros jogadores, `per` pra cada). */
  to: string;
  reason: DebtReason;
  sq?: number;
  per?: number;
  /** Depois de pagar: encerra a jogada ("finish") ou anda o que os dados mandaram ("move", fiança forçada). */
  next: "finish" | "move";
}

export interface Auction {
  sq: number;
  bid: number;
  leader: string | null;
  /** Ordem dos lances (a partir de quem vem depois de quem recusou). */
  order: string[];
  passed: string[];
  /** De quem é a vez de dar lance. */
  bidder: string;
}

export interface Bundle {
  cash: number;
  props: number[];
  jailCards: number;
}
/** `from` entrega `give` e recebe `take` de `to`. */
export interface Trade {
  from: string;
  to: string;
  give: Bundle;
  take: Bundle;
}

/** O que aconteceu na última ação — vira linha do histórico e animação na tela. */
export type MonoEvent =
  | { t: "roll"; p: string; d: [number, number] }
  | { t: "move"; p: string; from: number; to: number }
  | { t: "go"; p: string; amount: number }
  | { t: "buy"; p: string; sq: number; price: number }
  | { t: "rent"; p: string; to: string; sq: number; amount: number; dice?: number }
  | { t: "tax"; p: string; sq: number; amount: number }
  | { t: "bonus"; p: string; sq: number; amount: number }
  | { t: "card"; p: string; deck: DeckId; card: number }
  | { t: "cash"; p: string; amount: number }
  | { t: "each"; p: string; per: number; total: number }
  | { t: "repairs"; p: string; amount: number }
  | { t: "jail"; p: string; why: "square" | "card" | "doubles" }
  | { t: "bail"; p: string; how: "paid" | "card" | "doubles" | "forced" }
  | { t: "jail_fail"; p: string; tries: number }
  | { t: "auction"; sq: number }
  | { t: "bid"; p: string; amount: number }
  | { t: "auction_pass"; p: string }
  | { t: "sold"; sq: number; to: string | null; amount: number }
  | { t: "build"; p: string; sq: number; level: number; cost: number }
  | { t: "sell"; p: string; sq: number; level: number; amount: number }
  | { t: "mortgage"; p: string; sq: number; amount: number }
  | { t: "unmortgage"; p: string; sq: number; cost: number }
  | { t: "trade_offer"; from: string; to: string }
  | { t: "trade_done"; from: string; to: string }
  | { t: "trade_no"; from: string; to: string; cancelled: boolean }
  | { t: "debt"; p: string; amount: number; to: string }
  | { t: "bankrupt"; p: string; to: string }
  | { t: "turn"; p: string }
  /** last = sobrou um; limit = acabaram as rodadas; humans = só sobraram bots (ninguém olhando a partida jogar). */
  | { t: "end"; mode: "last" | "limit" | "humans" };

export interface Standing extends MonoStats {
  playerId: string;
  name: string;
  netWorth: number;
  cash: number;
  props: number;
  buildings: number;
  bankrupt: boolean;
}

export interface MonoState {
  version: number;
  edition: EditionId;
  phase: MonoPhase;
  settings: { limit: number };
  players: MonoPlayer[];
  hostId: string | null;
  /** Uma entrada por casa do tabuleiro; null nas casas que não dão dono. */
  props: (PropState | null)[];
  /** Ordem das cartas de cada baralho (a próxima é a primeira). Segredo do servidor. */
  decks: Record<DeckId, number[]>;
  /** Índice (em players) de quem joga. */
  turn: number;
  step: Step;
  /** Rodada atual (1 = todo mundo ainda joga a primeira vez). */
  round: number;
  dice: [number, number] | null;
  /** Duplas seguidas nesta vez. */
  doubles: number;
  auction: Auction | null;
  trade: Trade | null;
  debt: Debt | null;
  events: MonoEvent[];
  /** Sobe a cada ação que mudou o jogo — a tela usa pra saber o que é novo. */
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  /** Falidos, na ordem em que saíram. */
  eliminated: string[];
  /** Sobe a cada partida iniciada. */
  gameNumber: number;
  stats: Record<string, MonoStats>;
}

/** O que as consultas puras leem (edição, jogadores, casas): tanto o estado do servidor quanto a visão do cliente servem. */
export type BoardState = Pick<MonoState, "edition" | "players" | "props">;

export type Result = { ok: true; state: MonoState } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export const isBotId = (id: string) => id.startsWith(BOT_PREFIX);

export function createLobby(edition: EditionId): MonoState {
  return {
    version: STATE_VERSION,
    edition,
    phase: "lobby",
    settings: { limit: 0 },
    players: [],
    hostId: null,
    props: [],
    decks: { chance: [], chest: [] },
    turn: 0,
    step: "roll",
    round: 1,
    dice: null,
    doubles: 0,
    auction: null,
    trade: null,
    debt: null,
    events: [],
    eventSeq: 0,
    winnerId: null,
    standings: null,
    eliminated: [],
    gameNumber: 0,
    stats: {},
  };
}

// ── Utilidades ─────────────────────────────────────────────────────────────

const clone = <T>(x: T): T => structuredClone(x);
export const edition = (s: Pick<MonoState, "edition">): Edition => getEdition(s.edition);
export const currentPlayer = (s: MonoState): MonoPlayer | undefined => s.players[s.turn];
export const playerById = (s: Pick<MonoState, "players">, id: string | null | undefined) => (id ? s.players.find((p) => p.id === id) : undefined);
export const alivePlayers = (s: MonoState) => s.players.filter((p) => !p.bankrupt);
const squareAt = (s: Pick<MonoState, "edition">, i: number): Square => edition(s).squares[i];

/** Nome de uma casa do tabuleiro (cartas usam o nome do baralho). */
export function squareName(s: Pick<MonoState, "edition">, i: number): string {
  const sq = getEdition(s.edition).squares[i];
  return sq.kind === "card" ? getEdition(s.edition).deckNames[sq.deck] : sq.name;
}

/** Posições de tudo o que a pessoa possui. */
export function ownedBy(s: BoardState, id: string): number[] {
  const out: number[] = [];
  s.props.forEach((p, i) => {
    if (p?.owner === id) out.push(i);
  });
  return out;
}

/** Dono de todas as ruas do grupo? */
export function ownsGroup(s: BoardState, id: string, group: string): boolean {
  return groupSquares(edition(s), group).every((i) => s.props[i]?.owner === id);
}

export function countOwnedKind(s: BoardState, id: string, kind: RentSet): number {
  let n = 0;
  edition(s).squares.forEach((sq, i) => {
    if (sq.kind === kind && s.props[i]?.owner === id) n++;
  });
  return n;
}

/** Casas e hotéis que ainda sobram no banco. */
export function supply(s: BoardState): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const p of s.props) {
    if (!p) continue;
    if (p.houses === 5) hotels++;
    else houses += p.houses;
  }
  return { houses: HOUSES_TOTAL - houses, hotels: HOTELS_TOTAL - hotels };
}

/** Quanto vale a pessoa (dinheiro + propriedades + construções). */
/** Aceita o estado ou a visão (o que a tela recebe): só lê edição, jogadores e casas. */
export function netWorth(s: BoardState, id: string): number {
  const p = playerById(s, id);
  if (!p || p.bankrupt) return 0;
  const ed = edition(s);
  let total = p.cash;
  s.props.forEach((pr, i) => {
    if (pr?.owner !== id) return;
    const sq = ed.squares[i];
    if (!isOwnable(sq)) return;
    total += pr.mortgaged ? mortgageValue(sq) : sq.price;
    if (sq.kind === "street") total += pr.houses * sq.houseCost;
  });
  return total;
}

/** Posição de casa que o cliente mandou: inteiro dentro do tabuleiro (nunca confie no que vem da rede). */
const validSquare = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < SQUARE_COUNT;

export const diceTotal = (s: MonoState) => (s.dice ? s.dice[0] + s.dice[1] : 0);

const rollOne = (rng: Rng) => 1 + Math.floor(rng() * 6);

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface RentOpts {
  /** Multiplicador (carta "avance até a mais próxima": o dobro). */
  mult?: number;
  /** Companhia de serviço pela carta: 10 vezes o dado. */
  utilityTen?: boolean;
}

/** Quanto o dono recebe de quem cair na casa agora (0 = livre, do próprio ou hipotecada). */
export function rentOf(s: BoardState, idx: number, dice: number, opts: RentOpts = {}): number {
  const pr = s.props[idx];
  const sq = squareAt(s, idx);
  if (!pr || !pr.owner || pr.mortgaged || !isOwnable(sq)) return 0;
  const ed = edition(s);
  const mult = opts.mult ?? 1;
  switch (sq.kind) {
    case "street": {
      if (pr.houses > 0) return sq.rent[pr.houses];
      return sq.rent[0] * (ownsGroup(s, pr.owner, sq.group) ? 2 : 1);
    }
    case "railroad": {
      const n = countOwnedKind(s, pr.owner, "railroad");
      return (ed.railroadRent[n - 1] ?? 0) * mult;
    }
    case "company": {
      const n = countOwnedKind(s, pr.owner, "company");
      return (ed.companyRent[n - 1] ?? 0) * mult;
    }
    case "utility": {
      const n = countOwnedKind(s, pr.owner, "utility");
      const m = opts.utilityTen ? 10 : (ed.utilityMultiplier[n - 1] ?? 0);
      return m * dice;
    }
  }
}

// ── Lobby ──────────────────────────────────────────────────────────────────

function pickHost(players: MonoPlayer[], current: string | null): string | null {
  if (players.some((p) => p.id === current && !p.bot)) return current;
  return players.find((p) => !p.bot)?.id ?? null;
}

const newPlayer = (id: string, name: string, avatarUrl: string | null | undefined, bot?: BotLevel): MonoPlayer => ({
  id,
  name,
  avatarUrl: avatarUrl ?? null,
  bot,
  connected: true,
  cash: 0,
  pos: 0,
  jail: null,
  jailCards: [],
  bankrupt: false,
});

export function joinLobby(state: MonoState, who: { id: string; name: string; avatarUrl?: string | null }): Result {
  const existing = state.players.find((p) => p.id === who.id);
  if (existing) {
    // Reconexão (ou refresh): só atualiza nome/foto e marca como conectado.
    return {
      ok: true,
      state: {
        ...state,
        players: state.players.map((p) => (p.id === who.id ? { ...p, name: who.name, avatarUrl: who.avatarUrl ?? null, connected: true } : p)),
        hostId: pickHost(state.players, state.hostId),
      },
    };
  }
  if (state.phase !== "lobby") return fail("game_in_progress");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  const players = [...state.players, newPlayer(who.id, who.name, who.avatarUrl)];
  return { ok: true, state: { ...state, players, hostId: pickHost(players, state.hostId) } };
}

export function setPlayerConnected(state: MonoState, id: string, connected: boolean): MonoState {
  if (!state.players.some((p) => p.id === id)) return state;
  return { ...state, players: state.players.map((p) => (p.id === id && !p.bot ? { ...p, connected } : p)) };
}

/** Tira do lobby; numa partida rolando só marca como desconectado (um bot joga por ele). */
export function removePlayer(state: MonoState, id: string): MonoState {
  if (state.phase !== "lobby") return setPlayerConnected(state, id, false);
  const players = state.players.filter((p) => p.id !== id);
  return { ...state, players, hostId: pickHost(players, state.hostId) };
}

const BOT_NAMES = ["Robô Zeca", "Robô Bia", "Robô Tião", "Robô Dani", "Robô Juca", "Robô Lia"];

export function addBot(state: MonoState, level: BotLevel): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");
  let n = 1;
  while (state.players.some((p) => p.id === `${BOT_PREFIX}${n}`)) n++;
  return { ok: true, state: { ...state, players: [...state.players, newPlayer(`${BOT_PREFIX}${n}`, BOT_NAMES[(n - 1) % BOT_NAMES.length], null, level)] } };
}

export function setBotLevel(state: MonoState, botId: string, level: BotLevel): Result {
  if (!state.players.some((p) => p.id === botId && p.bot)) return fail("not_a_bot");
  return { ok: true, state: { ...state, players: state.players.map((p) => (p.id === botId ? { ...p, bot: level } : p)) } };
}

export function setSettings(state: MonoState, settings: { limit: number }): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (!(LIMIT_OPTIONS as readonly number[]).includes(settings.limit)) return fail("bad_limit");
  return { ok: true, state: { ...state, settings: { ...state.settings, limit: settings.limit } } };
}

export function canStart(state: MonoState): boolean {
  return state.phase === "lobby" && state.players.length >= MIN_PLAYERS;
}

export function startGame(state: MonoState, rng: Rng = Math.random): Result {
  if (state.phase !== "lobby") return fail("not_in_lobby");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");
  const ed = edition(state);
  const players = state.players.map((p) => ({ ...p, cash: ed.startCash, pos: 0, jail: null, jailCards: [], bankrupt: false }));
  const stats: Record<string, MonoStats> = {};
  for (const p of players) stats[p.id] = emptyStats();
  const first = Math.floor(rng() * players.length);
  return {
    ok: true,
    state: {
      ...state,
      phase: "playing",
      players,
      props: ed.squares.map((sq) => (isOwnable(sq) ? { owner: null, houses: 0, mortgaged: false } : null)),
      decks: {
        chance: shuffled(ed.decks.chance.map((_, i) => i), rng),
        chest: shuffled(ed.decks.chest.map((_, i) => i), rng),
      },
      turn: first,
      step: "roll",
      round: 1,
      dice: null,
      doubles: 0,
      auction: null,
      trade: null,
      debt: null,
      events: [{ t: "turn", p: players[first].id }],
      eventSeq: state.eventSeq + 1,
      winnerId: null,
      standings: null,
      eliminated: [],
      gameNumber: state.gameNumber + 1,
      stats,
    },
  };
}

/** Volta pro lobby depois da partida (revanche), mantendo bots e quem segue conectado. */
export function returnToLobby(state: MonoState): MonoState {
  const players = state.players.filter((p) => p.bot || p.connected).map((p) => ({ ...p, cash: 0, pos: 0, jail: null, jailCards: [], bankrupt: false }));
  return {
    ...state,
    phase: "lobby",
    players,
    hostId: pickHost(players, state.hostId),
    props: [],
    decks: { chance: [], chest: [] },
    turn: 0,
    step: "roll",
    round: 1,
    dice: null,
    doubles: 0,
    auction: null,
    trade: null,
    debt: null,
    events: [],
    winnerId: null,
    standings: null,
    eliminated: [],
  };
}

// ── Mecânica interna (trabalha numa cópia mutável do estado) ───────────────

/** Abre uma cópia pra mexer; as funções públicas devolvem `commit(s)`. */
function begin(state: MonoState): MonoState {
  const s = clone(state);
  s.events = [];
  return s;
}
function commit(s: MonoState): Result {
  s.eventSeq += 1;
  return { ok: true, state: s };
}

const cur = (s: MonoState) => s.players[s.turn];
const stat = (s: MonoState, id: string) => (s.stats[id] ??= emptyStats());

/** A jogada da pessoa acabou: dobrou (e está livre) joga de novo; senão fase livre. */
function finish(s: MonoState) {
  const p = cur(s);
  s.debt = null;
  s.step = s.doubles > 0 && p.jail === null && !p.bankrupt ? "roll" : "manage";
}

function giveSalary(s: MonoState, p: MonoPlayer) {
  const amount = edition(s).salary;
  p.cash += amount;
  s.events.push({ t: "go", p: p.id, amount });
}

/** Anda `steps` casas pra frente (passar pela partida paga o salário). */
function advanceBy(s: MonoState, p: MonoPlayer, steps: number) {
  const from = p.pos;
  const raw = from + steps;
  p.pos = raw % SQUARE_COUNT;
  s.events.push({ t: "move", p: p.id, from, to: p.pos });
  if (raw >= SQUARE_COUNT) giveSalary(s, p);
}

/** Vai direto pra casa `target` (recebe o salário se `collect` e cruzar a partida). */
function jumpTo(s: MonoState, p: MonoPlayer, target: number, collect: boolean) {
  const from = p.pos;
  p.pos = target;
  s.events.push({ t: "move", p: p.id, from, to: target });
  if (collect && target < from) giveSalary(s, p);
}

function sendToJail(s: MonoState, p: MonoPlayer, why: "square" | "card" | "doubles") {
  const from = p.pos;
  p.pos = edition(s).jailIndex;
  p.jail = 0;
  s.doubles = 0;
  stat(s, p.id).jailed += 1;
  if (from !== p.pos) s.events.push({ t: "move", p: p.id, from, to: p.pos });
  s.events.push({ t: "jail", p: p.id, why });
}

interface LandCtx {
  /** Soma dos dados (aluguel das companhias de serviço). */
  total: number;
  mult?: number;
  utilityTen?: boolean;
  /** Companhia de serviço pela carta: o dado é jogado de novo. */
  reroll?: boolean;
}

/** Aplica o que a casa onde `cur` está mandar. */
function landOn(s: MonoState, rng: Rng, ctx: LandCtx): void {
  const p = cur(s);
  const sq = squareAt(s, p.pos);
  switch (sq.kind) {
    case "street":
    case "railroad":
    case "utility":
    case "company": {
      const pr = s.props[p.pos]!;
      if (pr.owner === null) {
        s.step = "buy";
        return;
      }
      if (pr.owner === p.id || pr.mortgaged) return finish(s);
      let total = ctx.total;
      let dice: number | undefined;
      if (ctx.reroll && sq.kind === "utility") {
        total = rollOne(rng) + rollOne(rng);
        dice = total;
      }
      const rent = rentOf(s, p.pos, total, { mult: ctx.mult, utilityTen: ctx.utilityTen });
      return charge(s, rng, p, rent, pr.owner, "rent", { sq: p.pos, dice });
    }
    case "card":
      return drawCard(s, rng, sq.deck, ctx);
    case "tax":
      return charge(s, rng, p, sq.amount, "bank", "tax", { sq: p.pos });
    case "bonus":
      p.cash += sq.amount;
      s.events.push({ t: "bonus", p: p.id, sq: p.pos, amount: sq.amount });
      return finish(s);
    case "gotojail":
      sendToJail(s, p, "square");
      return finish(s);
    default:
      return finish(s);
  }
}

interface ChargeOpts {
  sq?: number;
  per?: number;
  dice?: number;
  next?: "finish" | "move";
}

/** Cobra `amount` de `payer`: paga na hora se tem; senão abre uma dívida (vende/hipoteca ou quebra). */
function charge(s: MonoState, rng: Rng, payer: MonoPlayer, amount: number, to: string, reason: DebtReason, opts: ChargeOpts = {}) {
  const next = opts.next ?? "finish";
  if (amount <= 0) return proceed(s, rng, next);
  if (payer.cash >= amount) {
    settle(s, payer, { amount, to, reason, sq: opts.sq, per: opts.per, next }, opts.dice);
    return proceed(s, rng, next);
  }
  s.debt = { amount, to, reason, sq: opts.sq, per: opts.per, next };
  s.step = "debt";
  s.events.push({ t: "debt", p: payer.id, amount, to });
}

/** Transfere o dinheiro de uma dívida (já conferido que há saldo). */
function settle(s: MonoState, payer: MonoPlayer, d: Debt, dice?: number) {
  payer.cash -= d.amount;
  if (d.to === "each") {
    const others = alivePlayers(s).filter((q) => q.id !== payer.id);
    for (const q of others) q.cash += d.per ?? 0;
    // Se alguém saiu do jogo enquanto a dívida esperava, o que não foi repartido volta pra quem pagava.
    const given = (d.per ?? 0) * others.length;
    payer.cash += d.amount - given;
    s.events.push({ t: "each", p: payer.id, per: -(d.per ?? 0), total: given });
  } else if (d.to !== "bank") {
    const owner = playerById(s, d.to);
    if (owner) owner.cash += d.amount;
    if (d.reason === "rent") {
      stat(s, payer.id).rentOut += d.amount;
      stat(s, d.to).rentIn += d.amount;
      s.events.push({ t: "rent", p: payer.id, to: d.to, sq: d.sq ?? payer.pos, amount: d.amount, dice });
    }
  } else if (d.reason === "tax") {
    s.events.push({ t: "tax", p: payer.id, sq: d.sq ?? payer.pos, amount: d.amount });
  } else if (d.reason === "repairs") {
    s.events.push({ t: "repairs", p: payer.id, amount: d.amount });
  } else if (d.reason === "card") {
    s.events.push({ t: "cash", p: payer.id, amount: -d.amount });
  }
  if (d.reason === "bail") {
    payer.jail = null;
    s.events.push({ t: "bail", p: payer.id, how: d.next === "move" ? "forced" : "paid" });
  }
}

/** O que vem depois de uma cobrança resolvida. */
function proceed(s: MonoState, rng: Rng, next: "finish" | "move") {
  s.debt = null;
  if (next === "move") {
    const p = cur(s);
    advanceBy(s, p, diceTotal(s));
    landOn(s, rng, { total: diceTotal(s) });
  } else finish(s);
}

/** Tira uma carta do baralho e aplica. */
function drawCard(s: MonoState, rng: Rng, deck: DeckId, ctx: LandCtx): void {
  const p = cur(s);
  const ed = edition(s);
  const order = s.decks[deck];
  const idx = order.shift()!;
  const card: Card = ed.decks[deck][idx];
  s.events.push({ t: "card", p: p.id, deck, card: idx });
  const fx: CardEffect = card.fx;
  if (fx.t === "jail_free") p.jailCards.push({ deck, idx });
  else order.push(idx);

  switch (fx.t) {
    case "jail_free":
      return finish(s);
    case "advance":
      jumpTo(s, p, fx.to, true);
      return landOn(s, rng, { total: ctx.total });
    case "nearest": {
      let i = p.pos;
      do {
        i = (i + 1) % SQUARE_COUNT;
      } while (ed.squares[i].kind !== fx.kind);
      jumpTo(s, p, i, true);
      if (fx.kind === "utility") return landOn(s, rng, { total: ctx.total, utilityTen: true, reroll: true });
      return landOn(s, rng, { total: ctx.total, mult: 2 });
    }
    case "gain":
      p.cash += fx.amount;
      s.events.push({ t: "cash", p: p.id, amount: fx.amount });
      return finish(s);
    case "pay":
      return charge(s, rng, p, fx.amount, "bank", "card");
    case "gain_each": {
      let total = 0;
      for (const q of alivePlayers(s)) {
        if (q.id === p.id) continue;
        const pay = Math.min(q.cash, fx.amount);
        q.cash -= pay;
        total += pay;
      }
      p.cash += total;
      s.events.push({ t: "each", p: p.id, per: fx.amount, total });
      return finish(s);
    }
    case "pay_each": {
      const others = alivePlayers(s).length - 1;
      return charge(s, rng, p, fx.amount * others, "each", "card", { per: fx.amount });
    }
    case "back": {
      const from = p.pos;
      p.pos = (p.pos - fx.n + SQUARE_COUNT) % SQUARE_COUNT;
      s.events.push({ t: "move", p: p.id, from, to: p.pos });
      return landOn(s, rng, { total: ctx.total });
    }
    case "jail":
      sendToJail(s, p, "card");
      return finish(s);
    case "repairs": {
      let houses = 0;
      let hotels = 0;
      for (const i of ownedBy(s, p.id)) {
        const h = s.props[i]!.houses;
        if (h === 5) hotels++;
        else houses += h;
      }
      return charge(s, rng, p, houses * fx.house + hotels * fx.hotel, "bank", "repairs");
    }
  }
}

// ── Leilão ─────────────────────────────────────────────────────────────────

const canBidMore = (s: MonoState, a: Auction, id: string) => {
  const p = playerById(s, id);
  return !!p && !p.bankrupt && !a.passed.includes(id) && p.cash > a.bid;
};

/** Passa a vez de dar lance pro próximo que ainda pode; ninguém mais pode = fecha o leilão. */
function advanceBidder(s: MonoState, afterId: string | null) {
  const a = s.auction!;
  const n = a.order.length;
  const start = afterId === null ? 0 : (a.order.indexOf(afterId) + 1) % n;
  for (let k = 0; k < n; k++) {
    const id = a.order[(start + k) % n];
    if (id !== a.leader && canBidMore(s, a, id)) {
      a.bidder = id;
      return;
    }
  }
  endAuction(s);
}

function endAuction(s: MonoState) {
  const a = s.auction!;
  const winner = a.leader ? playerById(s, a.leader) : undefined;
  if (winner) {
    winner.cash -= a.bid;
    s.props[a.sq]!.owner = winner.id;
    stat(s, winner.id).bought += 1;
  }
  s.events.push({ t: "sold", sq: a.sq, to: winner?.id ?? null, amount: winner ? a.bid : 0 });
  s.auction = null;
  finish(s);
}

function startAuction(s: MonoState) {
  const p = cur(s);
  const sq = p.pos;
  // Todos os vivos, começando por quem vem depois de quem recusou (que dá lance por último).
  const order: string[] = [];
  for (let k = 1; k <= s.players.length; k++) {
    const q = s.players[(s.turn + k) % s.players.length];
    if (!q.bankrupt) order.push(q.id);
  }
  s.auction = { sq, bid: 0, leader: null, order, passed: [], bidder: order[0] };
  s.step = "auction";
  s.events.push({ t: "auction", sq });
  advanceBidder(s, null);
}

// ── Vez, falência, fim ─────────────────────────────────────────────────────

function advanceTurn(s: MonoState) {
  const n = s.players.length;
  let i = s.turn;
  do {
    i = (i + 1) % n;
  } while (s.players[i].bankrupt);
  if (i <= s.turn) s.round += 1;
  s.turn = i;
  s.step = "roll";
  s.doubles = 0;
  s.debt = null;
  s.auction = null;
  s.trade = null;
  s.events.push({ t: "turn", p: s.players[i].id });
  if (s.settings.limit > 0 && s.round > s.settings.limit) finishGame(s, "limit");
}

function standingOf(s: MonoState, p: MonoPlayer): Standing {
  let props = 0;
  let buildings = 0;
  s.props.forEach((pr) => {
    if (pr?.owner === p.id) {
      props++;
      buildings += pr.houses;
    }
  });
  return { ...(s.stats[p.id] ?? emptyStats()), playerId: p.id, name: p.name, netWorth: netWorth(s, p.id), cash: p.bankrupt ? 0 : p.cash, props, buildings, bankrupt: p.bankrupt };
}

function finishGame(s: MonoState, mode: "last" | "limit" | "humans") {
  const alive = alivePlayers(s).sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id) || b.cash - a.cash);
  const out = [...s.eliminated].reverse().map((id) => playerById(s, id)!);
  const order = [...alive, ...out];
  s.standings = order.map((p) => standingOf(s, p));
  s.winnerId = order[0]?.id ?? null;
  s.phase = "game_over";
  s.step = "manage";
  s.auction = null;
  s.trade = null;
  s.debt = null;
  s.events.push({ t: "end", mode });
}

/** Tira a pessoa do jogo: tudo dela vai pro credor (ou pro banco). */
function eliminate(s: MonoState, id: string, creditorId: string) {
  const p = playerById(s, id)!;
  const ed = edition(s);
  const creditor = creditorId !== "bank" ? playerById(s, creditorId) : undefined;

  // Construções são vendidas de volta ao banco por metade do preço (o dinheiro entra no que vai pro credor).
  s.props.forEach((pr, i) => {
    if (pr?.owner !== id || pr.houses === 0) return;
    const sq = ed.squares[i];
    if (sq.kind === "street") p.cash += Math.floor((pr.houses * sq.houseCost) / 2);
    pr.houses = 0;
  });
  if (creditor) {
    creditor.cash += p.cash;
    s.props.forEach((pr) => {
      if (pr?.owner === id) pr.owner = creditor.id;
    });
    creditor.jailCards.push(...p.jailCards);
  } else {
    s.props.forEach((pr) => {
      if (pr?.owner === id) {
        pr.owner = null;
        pr.mortgaged = false;
      }
    });
    for (const c of p.jailCards) s.decks[c.deck].push(c.idx);
  }
  p.cash = 0;
  p.jailCards = [];
  p.bankrupt = true;
  s.eliminated.push(id);
  s.events.push({ t: "bankrupt", p: id, to: creditor ? creditor.id : "bank" });

  if (alivePlayers(s).length <= 1) {
    finishGame(s, "last");
    return;
  }
  // Era a vez dela: passa pra próxima pessoa (isso também encerra leilão, troca e dívida que estavam abertos).
  if (cur(s).id === id) {
    advanceTurn(s);
    return;
  }

  // Não era a vez dela: só tira do que estava rolando e que a envolvia.
  if (s.trade && (s.trade.from === id || s.trade.to === id)) s.trade = null;
  if (s.auction) {
    const a = s.auction;
    const wasBidder = a.bidder === id;
    a.order = a.order.filter((x) => x !== id);
    a.passed = a.passed.filter((x) => x !== id);
    if (a.leader === id) {
      a.leader = null;
      a.bid = 0;
    }
    if (a.order.length === 0) {
      s.auction = null;
      finish(s);
    } else if (wasBidder) {
      advanceBidder(s, null);
    }
  }
}

// ── Guardas ────────────────────────────────────────────────────────────────

function turnGuard(s: MonoState, actor: string, steps: Step[]): string | null {
  if (s.phase !== "playing") return "not_playing";
  if (cur(s).id !== actor) return "not_your_turn";
  if (s.trade) return "trade_pending";
  if (!steps.includes(s.step)) return "wrong_step";
  return null;
}

// ── Ações do jogador da vez ────────────────────────────────────────────────

export function roll(state: MonoState, actor: string, rng: Rng = Math.random): Result {
  const err = turnGuard(state, actor, ["roll"]);
  if (err) return fail(err);
  const s = begin(state);
  const p = cur(s);
  const d: [number, number] = [rollOne(rng), rollOne(rng)];
  const total = d[0] + d[1];
  const isDouble = d[0] === d[1];
  s.dice = d;
  s.events.push({ t: "roll", p: p.id, d });
  if (isDouble) stat(s, p.id).doubles += 1;

  if (p.jail !== null) {
    if (isDouble) {
      p.jail = null;
      s.doubles = 0;
      s.events.push({ t: "bail", p: p.id, how: "doubles" });
      advanceBy(s, p, total);
      landOn(s, rng, { total });
    } else {
      p.jail += 1;
      if (p.jail >= 3) {
        // Terceira tentativa sem dupla: paga a fiança e anda o que tirou.
        charge(s, rng, p, edition(s).bail, "bank", "bail", { next: "move" });
      } else {
        s.events.push({ t: "jail_fail", p: p.id, tries: p.jail });
        s.step = "manage";
      }
    }
    return commit(s);
  }

  s.doubles = isDouble ? s.doubles + 1 : 0;
  if (s.doubles >= 3) {
    sendToJail(s, p, "doubles");
    s.step = "manage";
    return commit(s);
  }
  advanceBy(s, p, total);
  landOn(s, rng, { total });
  return commit(s);
}

export function payBail(state: MonoState, actor: string): Result {
  const err = turnGuard(state, actor, ["roll"]);
  if (err) return fail(err);
  const p = cur(state);
  if (p.jail === null) return fail("not_in_jail");
  const bail = edition(state).bail;
  if (p.cash < bail) return fail("not_enough_cash");
  const s = begin(state);
  const q = cur(s);
  q.cash -= bail;
  q.jail = null;
  s.events.push({ t: "bail", p: q.id, how: "paid" });
  return commit(s);
}

export function spendJailCard(state: MonoState, actor: string): Result {
  const err = turnGuard(state, actor, ["roll"]);
  if (err) return fail(err);
  const p = cur(state);
  if (p.jail === null) return fail("not_in_jail");
  if (p.jailCards.length === 0) return fail("no_jail_card");
  const s = begin(state);
  const q = cur(s);
  const card = q.jailCards.shift()!;
  s.decks[card.deck].push(card.idx);
  q.jail = null;
  s.events.push({ t: "bail", p: q.id, how: "card" });
  return commit(s);
}

export function buyProperty(state: MonoState, actor: string): Result {
  const err = turnGuard(state, actor, ["buy"]);
  if (err) return fail(err);
  const p = cur(state);
  const sq = squareAt(state, p.pos);
  if (!isOwnable(sq)) return fail("not_for_sale");
  if (p.cash < sq.price) return fail("not_enough_cash");
  const s = begin(state);
  const q = cur(s);
  q.cash -= sq.price;
  s.props[q.pos]!.owner = q.id;
  stat(s, q.id).bought += 1;
  s.events.push({ t: "buy", p: q.id, sq: q.pos, price: sq.price });
  finish(s);
  return commit(s);
}

/** Recusou a compra: leilão (Monopoly) ou a propriedade só continua livre (Banco Imobiliário). */
export function declineProperty(state: MonoState, actor: string): Result {
  const err = turnGuard(state, actor, ["buy"]);
  if (err) return fail(err);
  const s = begin(state);
  if (edition(s).auction) startAuction(s);
  else finish(s);
  return commit(s);
}

export function endTurn(state: MonoState, actor: string): Result {
  const err = turnGuard(state, actor, ["manage"]);
  if (err) return fail(err);
  const s = begin(state);
  advanceTurn(s);
  return commit(s);
}

// ── Leilão: lances ─────────────────────────────────────────────────────────

function auctionGuard(s: MonoState, actor: string): string | null {
  if (s.phase !== "playing" || s.step !== "auction" || !s.auction) return "no_auction";
  if (s.auction.bidder !== actor) return "not_your_turn";
  return null;
}

export function placeBid(state: MonoState, actor: string, amount: number): Result {
  const err = auctionGuard(state, actor);
  if (err) return fail(err);
  const a = state.auction!;
  const p = playerById(state, actor)!;
  if (!Number.isInteger(amount) || amount <= a.bid) return fail("bid_too_low");
  if (amount > p.cash) return fail("not_enough_cash");
  const s = begin(state);
  s.auction!.bid = amount;
  s.auction!.leader = actor;
  s.events.push({ t: "bid", p: actor, amount });
  advanceBidder(s, actor);
  return commit(s);
}

export function passBid(state: MonoState, actor: string): Result {
  const err = auctionGuard(state, actor);
  if (err) return fail(err);
  const s = begin(state);
  s.auction!.passed.push(actor);
  s.events.push({ t: "auction_pass", p: actor });
  advanceBidder(s, actor);
  return commit(s);
}

// ── Construir, hipotecar ───────────────────────────────────────────────────

const groupHouses = (s: BoardState, group: string) => groupSquares(edition(s), group).map((i) => s.props[i]!.houses);

/** Por que `id` NÃO pode construir em `idx` agora (null = pode). */
export function buildError(s: BoardState, id: string, idx: number): string | null {
  const sq = squareAt(s, idx);
  const pr = s.props[idx];
  const me = playerById(s, id);
  if (!me || sq.kind !== "street" || !pr || pr.owner !== id) return "not_yours";
  if (!ownsGroup(s, id, sq.group)) return "need_group";
  if (groupSquares(edition(s), sq.group).some((i) => s.props[i]!.mortgaged)) return "mortgaged_in_group";
  if (pr.houses >= 5) return "max_built";
  if (pr.houses > Math.min(...groupHouses(s, sq.group))) return "build_evenly";
  if (me.cash < sq.houseCost) return "not_enough_cash";
  const sup = supply(s);
  if (pr.houses === 4 ? sup.hotels <= 0 : sup.houses <= 0) return "no_supply";
  return null;
}

export function sellError(s: BoardState, id: string, idx: number): string | null {
  const sq = squareAt(s, idx);
  const pr = s.props[idx];
  if (sq.kind !== "street" || !pr || pr.owner !== id) return "not_yours";
  if (pr.houses === 0) return "nothing_to_sell";
  if (pr.houses < Math.max(...groupHouses(s, sq.group))) return "sell_evenly";
  // Hotel volta a virar 4 casas: o banco precisa ter as casas.
  if (pr.houses === 5 && supply(s).houses < 4) return "no_supply";
  return null;
}

export function mortgageError(s: BoardState, id: string, idx: number): string | null {
  const sq = squareAt(s, idx);
  const pr = s.props[idx];
  if (!isOwnable(sq) || !pr || pr.owner !== id) return "not_yours";
  if (pr.mortgaged) return "already_mortgaged";
  if (sq.kind === "street" && groupHouses(s, sq.group).some((h) => h > 0)) return "sell_buildings_first";
  return null;
}

export function unmortgageError(s: BoardState, id: string, idx: number): string | null {
  const sq = squareAt(s, idx);
  const pr = s.props[idx];
  const me = playerById(s, id);
  if (!me || !isOwnable(sq) || !pr || pr.owner !== id) return "not_yours";
  if (!pr.mortgaged) return "not_mortgaged";
  if (me.cash < unmortgageCost(sq)) return "not_enough_cash";
  return null;
}

export function build(state: MonoState, actor: string, idx: number): Result {
  const err = turnGuard(state, actor, ["roll", "manage"]) ?? (validSquare(idx) ? buildError(state, actor, idx) : "bad_square");
  if (err) return fail(err);
  const s = begin(state);
  const sq = squareAt(s, idx) as Extract<Square, { kind: "street" }>;
  const pr = s.props[idx]!;
  playerById(s, actor)!.cash -= sq.houseCost;
  pr.houses += 1;
  stat(s, actor).built += 1;
  s.events.push({ t: "build", p: actor, sq: idx, level: pr.houses, cost: sq.houseCost });
  return commit(s);
}

export function sellBuilding(state: MonoState, actor: string, idx: number): Result {
  const err = turnGuard(state, actor, ["roll", "manage", "buy", "debt"]) ?? (validSquare(idx) ? sellError(state, actor, idx) : "bad_square");
  if (err) return fail(err);
  const s = begin(state);
  const sq = squareAt(s, idx) as Extract<Square, { kind: "street" }>;
  const pr = s.props[idx]!;
  const amount = Math.floor(sq.houseCost / 2);
  playerById(s, actor)!.cash += amount;
  pr.houses -= 1;
  s.events.push({ t: "sell", p: actor, sq: idx, level: pr.houses, amount });
  return commit(s);
}

export function mortgage(state: MonoState, actor: string, idx: number): Result {
  const err = turnGuard(state, actor, ["roll", "manage", "buy", "debt"]) ?? (validSquare(idx) ? mortgageError(state, actor, idx) : "bad_square");
  if (err) return fail(err);
  const s = begin(state);
  const sq = squareAt(s, idx) as OwnableSquare;
  const amount = mortgageValue(sq);
  playerById(s, actor)!.cash += amount;
  s.props[idx]!.mortgaged = true;
  s.events.push({ t: "mortgage", p: actor, sq: idx, amount });
  return commit(s);
}

export function unmortgage(state: MonoState, actor: string, idx: number): Result {
  const err = turnGuard(state, actor, ["roll", "manage"]) ?? (validSquare(idx) ? unmortgageError(state, actor, idx) : "bad_square");
  if (err) return fail(err);
  const s = begin(state);
  const sq = squareAt(s, idx) as OwnableSquare;
  const cost = unmortgageCost(sq);
  playerById(s, actor)!.cash -= cost;
  s.props[idx]!.mortgaged = false;
  s.events.push({ t: "unmortgage", p: actor, sq: idx, cost });
  return commit(s);
}

// ── Dívida e falência ──────────────────────────────────────────────────────

export function payDebt(state: MonoState, actor: string, rng: Rng = Math.random): Result {
  const err = turnGuard(state, actor, ["debt"]);
  if (err) return fail(err);
  const d = state.debt!;
  if (cur(state).cash < d.amount) return fail("not_enough_cash");
  const s = begin(state);
  const p = cur(s);
  settle(s, p, d);
  proceed(s, rng, d.next);
  return commit(s);
}

/** Sem como pagar: tudo vai pro credor (ou pro banco) e a pessoa sai do jogo. */
export function declareBankruptcy(state: MonoState, actor: string): Result {
  const err = turnGuard(state, actor, ["debt"]);
  if (err) return fail(err);
  const s = begin(state);
  const d = s.debt!;
  eliminate(s, actor, d.to === "each" ? "bank" : d.to);
  return commit(s);
}

/**
 * Todo humano que sentou já faliu (ou desistiu) e só sobraram bots: ninguém mais está jogando — a partida acaba na hora,
 * por patrimônio, em vez de os bots rodarem pra um espectador sem fim (eles não propõem trocas, então raramente fecham grupos).
 * null = nada a fazer.
 */
export function closeIfNoHumans(state: MonoState): MonoState | null {
  if (state.phase !== "playing") return null;
  const sat = state.players.some((p) => !p.bot);
  if (!sat || state.players.some((p) => !p.bot && !p.bankrupt)) return null;
  const s = begin(state);
  finishGame(s, "humans");
  s.eventSeq += 1;
  return s;
}

/** Desistir (a própria pessoa, a qualquer hora) ou ser removido pelo host: perde tudo pro banco. */
export function forfeit(state: MonoState, id: string): Result {
  if (state.phase !== "playing") return fail("not_playing");
  const p = playerById(state, id);
  if (!p || p.bankrupt) return fail("not_in_game");
  const s = begin(state);
  eliminate(s, id, "bank");
  return commit(s);
}

// ── Trocas ─────────────────────────────────────────────────────────────────

const emptyBundle = (): Bundle => ({ cash: 0, props: [], jailCards: 0 });
const bundleEmpty = (b: Bundle) => b.cash === 0 && b.props.length === 0 && b.jailCards === 0;

function bundleError(s: MonoState, owner: string, b: Bundle): string | null {
  const p = playerById(s, owner);
  if (!p || p.bankrupt) return "bad_trade";
  if (!Number.isInteger(b.cash) || b.cash < 0 || !Number.isInteger(b.jailCards) || b.jailCards < 0) return "bad_trade";
  if (b.cash > p.cash) return "not_enough_cash";
  if (b.jailCards > p.jailCards.length) return "bad_trade";
  if (new Set(b.props).size !== b.props.length) return "bad_trade";
  for (const i of b.props) {
    const sq = Number.isInteger(i) ? edition(s).squares[i] : undefined;
    const pr = Number.isInteger(i) ? s.props[i] : undefined;
    if (!sq || !isOwnable(sq) || !pr || pr.owner !== owner) return "bad_trade";
    // Construções têm que ser vendidas antes: nada de casa mudando de dono.
    if (sq.kind === "street" && groupHouses(s, sq.group).some((h) => h > 0)) return "sell_buildings_first";
  }
  return null;
}

export function tradeError(s: MonoState, t: Trade): string | null {
  if (t.from === t.to) return "bad_trade";
  if (bundleEmpty(t.give) && bundleEmpty(t.take)) return "empty_trade";
  return bundleError(s, t.from, t.give) ?? bundleError(s, t.to, t.take);
}

const cleanBundle = (b: Partial<Bundle> | undefined): Bundle => ({
  cash: Math.trunc(Number(b?.cash) || 0),
  props: Array.isArray(b?.props) ? b!.props!.map(Number) : [],
  jailCards: Math.trunc(Number(b?.jailCards) || 0),
});

export function proposeTrade(state: MonoState, actor: string, offer: { to: string; give?: Partial<Bundle>; take?: Partial<Bundle> }): Result {
  const err = turnGuard(state, actor, ["roll", "manage"]);
  if (err) return fail(err);
  const other = playerById(state, offer.to);
  if (!other || other.bankrupt || other.id === actor) return fail("bad_trade");
  const trade: Trade = { from: actor, to: offer.to, give: cleanBundle(offer.give), take: cleanBundle(offer.take) };
  const bad = tradeError(state, trade);
  if (bad) return fail(bad);
  const s = begin(state);
  s.trade = trade;
  s.events.push({ t: "trade_offer", from: actor, to: offer.to });
  return commit(s);
}

function moveBundle(s: MonoState, from: MonoPlayer, to: MonoPlayer, b: Bundle) {
  from.cash -= b.cash;
  to.cash += b.cash;
  for (const i of b.props) s.props[i]!.owner = to.id;
  to.jailCards.push(...from.jailCards.splice(0, b.jailCards));
}

export function acceptTrade(state: MonoState, actor: string): Result {
  if (state.phase !== "playing" || !state.trade) return fail("no_trade");
  if (state.trade.to !== actor) return fail("not_your_turn");
  const t = state.trade;
  const bad = tradeError(state, t);
  if (bad) {
    // A oferta não vale mais (dinheiro gasto, propriedade com casa...): cai.
    const s = begin(state);
    s.trade = null;
    s.events.push({ t: "trade_no", from: t.from, to: t.to, cancelled: true });
    return commit(s);
  }
  const s = begin(state);
  const a = playerById(s, t.from)!;
  const b = playerById(s, t.to)!;
  moveBundle(s, a, b, t.give);
  moveBundle(s, b, a, t.take);
  s.trade = null;
  stat(s, a.id).trades += 1;
  stat(s, b.id).trades += 1;
  s.events.push({ t: "trade_done", from: t.from, to: t.to });
  return commit(s);
}

export function declineTrade(state: MonoState, actor: string): Result {
  if (state.phase !== "playing" || !state.trade) return fail("no_trade");
  if (state.trade.to !== actor) return fail("not_your_turn");
  const s = begin(state);
  s.events.push({ t: "trade_no", from: s.trade!.from, to: s.trade!.to, cancelled: false });
  s.trade = null;
  return commit(s);
}

export function cancelTrade(state: MonoState, actor: string): Result {
  if (state.phase !== "playing" || !state.trade) return fail("no_trade");
  if (state.trade.from !== actor) return fail("not_your_turn");
  const s = begin(state);
  s.events.push({ t: "trade_no", from: s.trade!.from, to: s.trade!.to, cancelled: true });
  s.trade = null;
  return commit(s);
}

export { emptyBundle };

// ── O que cada pessoa pode fazer agora (a tela e os bots usam isto) ───────

export interface MeActions {
  roll: boolean;
  payBail: boolean;
  useJailCard: boolean;
  buy: boolean;
  decline: boolean;
  endTurn: boolean;
  payDebt: boolean;
  bankrupt: boolean;
  bid: boolean;
  /** Menor lance válido e quanto dá pra dar (o dinheiro que tenho). */
  minBid: number;
  maxBid: number;
  passBid: boolean;
  respondTrade: boolean;
  cancelTrade: boolean;
  propose: boolean;
  build: number[];
  sell: number[];
  mortgage: number[];
  unmortgage: number[];
  resign: boolean;
}

const NO_ACTIONS: MeActions = {
  roll: false,
  payBail: false,
  useJailCard: false,
  buy: false,
  decline: false,
  endTurn: false,
  payDebt: false,
  bankrupt: false,
  bid: false,
  minBid: 0,
  maxBid: 0,
  passBid: false,
  respondTrade: false,
  cancelTrade: false,
  propose: false,
  build: [],
  sell: [],
  mortgage: [],
  unmortgage: [],
  resign: false,
};

export function actionsFor(s: MonoState, id: string | null): MeActions {
  const me = id ? playerById(s, id) : undefined;
  if (!me || s.phase !== "playing" || me.bankrupt) return NO_ACTIONS;
  const a: MeActions = { ...NO_ACTIONS, build: [], sell: [], mortgage: [], unmortgage: [], resign: true };
  if (s.trade?.to === me.id) a.respondTrade = true;
  if (s.trade?.from === me.id) a.cancelTrade = true;
  if (s.step === "auction" && s.auction?.bidder === me.id) {
    a.bid = me.cash > s.auction.bid;
    a.minBid = s.auction.bid + 1;
    a.maxBid = me.cash;
    a.passBid = true;
  }
  if (cur(s).id !== me.id || s.trade) return a;

  const ed = edition(s);
  switch (s.step) {
    case "roll":
      a.roll = true;
      if (me.jail !== null) {
        a.payBail = me.cash >= ed.bail;
        a.useJailCard = me.jailCards.length > 0;
      }
      break;
    case "buy": {
      const sq = squareAt(s, me.pos);
      a.buy = isOwnable(sq) && me.cash >= sq.price;
      a.decline = true;
      break;
    }
    case "manage":
      a.endTurn = true;
      break;
    case "debt":
      a.payDebt = me.cash >= (s.debt?.amount ?? Infinity);
      a.bankrupt = true;
      break;
  }
  const mine = ownedBy(s, me.id);
  if (s.step === "roll" || s.step === "manage") {
    a.build = mine.filter((i) => buildError(s, me.id, i) === null);
    a.unmortgage = mine.filter((i) => unmortgageError(s, me.id, i) === null);
    a.propose = alivePlayers(s).length >= 2;
  }
  if (s.step === "roll" || s.step === "manage" || s.step === "buy" || s.step === "debt") {
    a.sell = mine.filter((i) => sellError(s, me.id, i) === null);
    a.mortgage = mine.filter((i) => mortgageError(s, me.id, i) === null);
  }
  return a;
}

// ── O que vai pros clientes ────────────────────────────────────────────────

export interface MonoView {
  edition: EditionId;
  phase: MonoPhase;
  settings: { limit: number };
  players: MonoPlayer[];
  hostId: string | null;
  props: (PropState | null)[];
  turn: number;
  step: Step;
  round: number;
  dice: [number, number] | null;
  doubles: number;
  auction: Auction | null;
  trade: Trade | null;
  debt: Debt | null;
  supply: { houses: number; hotels: number };
  events: MonoEvent[];
  eventSeq: number;
  winnerId: string | null;
  standings: Standing[] | null;
  gameNumber: number;
  /** O que EU posso fazer agora. */
  me: MeActions;
}

/** Tudo é público no jogo — só o baralho (a ordem das cartas) fica no servidor. */
export function toView(state: MonoState, viewerId: string | null): MonoView {
  return {
    edition: state.edition,
    phase: state.phase,
    settings: state.settings,
    players: state.players,
    hostId: state.hostId,
    props: state.props,
    turn: state.turn,
    step: state.step,
    round: state.round,
    dice: state.dice,
    doubles: state.doubles,
    auction: state.auction,
    trade: state.trade,
    debt: state.debt,
    supply: state.phase === "playing" ? supply(state) : { houses: HOUSES_TOTAL, hotels: HOTELS_TOTAL },
    events: state.events,
    eventSeq: state.eventSeq,
    winnerId: state.winnerId,
    standings: state.standings,
    gameNumber: state.gameNumber,
    me: actionsFor(state, viewerId),
  };
}
