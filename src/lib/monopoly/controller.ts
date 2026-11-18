// Controlador de uma sala de Monopoly / Banco Imobiliário: guarda o MonoState, aplica as ações dos
// jogadores (com permissões) e dirige o que acontece sozinho — bots jogando, bot respondendo
// leilão e troca, e um bot jogando por quem caiu da conexão. Roda no room server (party/monopoly.ts).
//
// É por turnos como o Uno (uma ação automática por vez), com duas particularidades: o leilão e a troca
// esperam resposta de gente que NÃO é a pessoa da vez — então o "próximo a agir" nem sempre é o
// jogador da vez.

import { chooseBotAction, decideTrade } from "./bot";
import { SQUARE_COUNT } from "./editions";
import {
  BotLevel,
  MonoEvent,
  MonoState,
  Result,
  acceptTrade,
  addBot,
  build,
  buyProperty,
  canStart,
  cancelTrade,
  closeIfNoHumans,
  createLobby,
  currentPlayer,
  declareBankruptcy,
  declineProperty,
  declineTrade,
  endTurn,
  forfeit,
  joinLobby,
  mortgage,
  passBid,
  payBail,
  payDebt,
  placeBid,
  proposeTrade,
  removePlayer,
  returnToLobby,
  roll,
  sellBuilding,
  setBotLevel,
  setPlayerConnected,
  setSettings,
  spendJailCard,
  startGame,
  unmortgage,
} from "./engine";
import type { MonoClientMessage } from "./protocol";
import { TIMING } from "./timing";

type Rng = () => number;

export interface AutoAction {
  delayMs: number;
  actorId: string;
  message: MonoClientMessage;
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
const think = (rng: Rng) => between(rng, TIMING.BOT_THINK_MIN_MS, TIMING.BOT_THINK_MAX_MS);
const isLevel = (x: unknown): x is BotLevel => x === "easy" || x === "medium" || x === "hard";

/** A jogada automática de quem espera resposta (leilão, troca) ou da vez (bot ou humano desconectado); null = espera um humano. */
export function nextAutoAction(state: MonoState, rng: Rng = Math.random): AutoAction | null {
  if (state.phase !== "playing") return null;

  // Leilão: o bot da vez de dar lance decide; quem caiu da conexão passa.
  if (state.step === "auction" && state.auction) {
    const bidder = state.players.find((p) => p.id === state.auction!.bidder);
    if (!bidder) return null;
    if (bidder.bot) return { delayMs: think(rng), actorId: bidder.id, message: chooseBotAction(state, bidder.id, bidder.bot, rng) };
    if (!bidder.connected) return { delayMs: TIMING.DISCONNECTED_MS, actorId: bidder.id, message: { type: "pass_bid" } };
    return null;
  }

  // Troca pendente trava a vez: o destinatário bot responde; humano caído recusa; se o proponente caiu, cancela.
  if (state.trade) {
    const from = state.players.find((p) => p.id === state.trade!.from);
    const to = state.players.find((p) => p.id === state.trade!.to);
    if (to?.bot) {
      return { delayMs: think(rng), actorId: to.id, message: decideTrade(state, to.id, to.bot) === "accept" ? { type: "accept_trade" } : { type: "decline_trade" } };
    }
    if (to && !to.connected) return { delayMs: TIMING.DISCONNECTED_MS, actorId: to.id, message: { type: "decline_trade" } };
    if (from && !from.bot && !from.connected) return { delayMs: TIMING.DISCONNECTED_MS, actorId: from.id, message: { type: "cancel_trade" } };
    return null;
  }

  const player = currentPlayer(state);
  if (!player) return null;
  if (player.bot) {
    const message = chooseBotAction(state, player.id, player.bot, rng);
    return { delayMs: message.type === "roll" ? TIMING.BOT_ROLL_MS : think(rng), actorId: player.id, message };
  }
  if (!player.connected) {
    return { delayMs: TIMING.DISCONNECTED_MS, actorId: player.id, message: chooseBotAction(state, player.id, "medium", rng) };
  }
  return null;
}

/** Quanto tempo a animação da última ação leva na tela (o jogo só segue depois): dados, peça andando, carta lida. */
export function settleMs(events: MonoEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.t === "roll") ms += TIMING.DICE_MS;
    else if (e.t === "card") ms += TIMING.CARD_MS;
    else if (e.t === "move") {
      // Andando pra frente até 12 casas a peça percorre cada uma; salto (carta, prisão) ou volta pesa só 3 passos.
      const steps = (e.to - e.from + SQUARE_COUNT) % SQUARE_COUNT;
      ms += TIMING.STEP_MS * (steps <= 12 ? steps : 3);
    }
  }
  return ms;
}

export interface MonoControllerOptions {
  rng?: Rng;
  /** Chamado depois de toda mudança de estado (ação de jogador ou automática). */
  onChange?: (state: MonoState) => void;
  /** Chamado quando o host expulsa alguém (o servidor fecha a conexão dele). */
  onKick?: (playerId: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Divide todas as esperas automáticas — só pra teste ponta a ponta; em produção é 1. */
  speed?: number;
}

export class MonoController {
  state: MonoState;
  private readonly rng: Rng;
  private readonly onChange?: (state: MonoState) => void;
  private readonly onKick?: (playerId: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly speed: number;
  private timers: unknown[] = [];
  private paused = false;

  constructor(initial: MonoState = createLobby("monopoly"), opts: MonoControllerOptions = {}) {
    this.state = initial;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange;
    this.onKick = opts.onKick;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.reschedule(0);
  }

  /** Retoma depois de carregar um estado salvo. */
  resume() {
    this.reschedule(0);
  }

  dispose() {
    this.clearTimers();
  }

  setConnected(playerId: string, connected: boolean) {
    const next = setPlayerConnected(this.state, playerId, connected);
    if (next !== this.state) this.commit(next, 0);
  }

  /** Remove da sala (lobby) ou marca desconectado (partida rolando). */
  leave(playerId: string) {
    this.commit(removePlayer(this.state, playerId), 0);
  }

  dispatch(actorId: string, message: MonoClientMessage): Result {
    const s = this.state;
    const isHost = s.hostId === actorId;
    const notHost: Result = { ok: false, error: "not_host" };
    let result: Result;
    let intro = 0;

    switch (message.type) {
      case "join": {
        // Sala que já acabou e ficou vazia: quem chega depois recomeça no lobby.
        const stale = s.phase === "game_over" && !s.players.some((p) => p.id === actorId) && !s.players.some((p) => !p.bot && p.connected);
        result = joinLobby(stale ? returnToLobby(s) : s, { id: actorId, name: message.name, avatarUrl: message.avatarUrl });
        break;
      }
      case "add_bot":
        if (!isHost) result = notHost;
        else if (!isLevel(message.level)) result = { ok: false, error: "bad_level" };
        else result = addBot(s, message.level);
        break;
      case "remove_bot": {
        const bot = s.players.find((p) => p.id === message.botId && p.bot);
        if (!isHost) result = notHost;
        else if (s.phase !== "lobby") result = { ok: false, error: "not_in_lobby" };
        else if (!bot) result = { ok: false, error: "not_a_bot" };
        else result = { ok: true, state: removePlayer(s, bot.id) };
        break;
      }
      case "set_bot_level":
        if (!isHost) result = notHost;
        else if (!isLevel(message.level)) result = { ok: false, error: "bad_level" };
        else result = setBotLevel(s, message.botId, message.level);
        break;
      case "kick": {
        const target = s.players.find((p) => p.id === message.playerId && !p.bot);
        if (!isHost) result = notHost;
        else if (!target || target.id === actorId) result = { ok: false, error: "not_in_room" };
        else {
          // No lobby a pessoa sai da sala; no meio da partida ela desiste (perde tudo pro banco).
          if (s.phase === "playing" && !target.bankrupt) result = forfeit(s, target.id);
          else result = { ok: true, state: removePlayer(s, target.id) };
          if (result.ok) this.onKick?.(target.id);
        }
        break;
      }
      case "leave":
        result = { ok: true, state: removePlayer(s, actorId) };
        break;
      case "set_limit":
        result = isHost ? setSettings(s, { limit: message.limit }) : notHost;
        break;
      case "start":
        if (!isHost) result = notHost;
        else if (!canStart(s)) result = { ok: false, error: s.phase === "lobby" ? "not_enough_players" : "not_in_lobby" };
        else {
          result = startGame(s, this.rng);
          intro = TIMING.INTRO_MS;
        }
        break;
      case "roll":
        result = roll(s, actorId, this.rng);
        break;
      case "pay_bail":
        result = payBail(s, actorId);
        break;
      case "use_card":
        result = spendJailCard(s, actorId);
        break;
      case "buy":
        result = buyProperty(s, actorId);
        break;
      case "decline":
        result = declineProperty(s, actorId);
        break;
      case "end_turn":
        result = endTurn(s, actorId);
        break;
      case "bid":
        result = placeBid(s, actorId, message.amount);
        break;
      case "pass_bid":
        result = passBid(s, actorId);
        break;
      case "build":
        result = build(s, actorId, message.sq);
        break;
      case "sell":
        result = sellBuilding(s, actorId, message.sq);
        break;
      case "mortgage":
        result = mortgage(s, actorId, message.sq);
        break;
      case "unmortgage":
        result = unmortgage(s, actorId, message.sq);
        break;
      case "propose_trade":
        result = proposeTrade(s, actorId, { to: message.to, give: message.give, take: message.take });
        break;
      case "accept_trade":
        result = acceptTrade(s, actorId);
        break;
      case "decline_trade":
        result = declineTrade(s, actorId);
        break;
      case "cancel_trade":
        result = cancelTrade(s, actorId);
        break;
      case "pay_debt":
        result = payDebt(s, actorId, this.rng);
        break;
      case "bankrupt":
        result = declareBankruptcy(s, actorId);
        break;
      case "resign":
        result = forfeit(s, actorId);
        break;
      case "rematch":
        if (s.phase !== "game_over" || !s.players.some((p) => p.id === actorId)) result = { ok: false, error: "not_game_over" };
        else result = { ok: true, state: returnToLobby(s) };
        break;
      case "emoji":
        // efêmero: quem repassa é o servidor, o jogo não muda
        return { ok: true, state: s };
      default:
        result = { ok: false, error: "unknown_message" };
    }

    if (result.ok) this.commit(result.state, intro || settleMs(result.state.events));
    return result;
  }

  private commit(next: MonoState, settle: number) {
    // sobraram só bots (os humanos faliram/desistiram): a partida acaba por patrimônio, sem rodar eternamente
    next = closeIfNoHumans(next) ?? next;
    this.state = next;
    this.onChange?.(next);
    this.reschedule(settle);
  }

  private clearTimers() {
    for (const t of this.timers) this.clearTimer(t);
    this.timers = [];
  }

  private after(ms: number, fn: () => void) {
    this.timers.push(this.setTimer(fn, ms / this.speed));
  }

  // Toda mudança de estado cancela o que estava agendado e agenda de novo: a próxima jogada automática.
  // `settle` dá tempo da animação (dados, peça andando, carta na tela) da ação que acabou de acontecer.
  private reschedule(settle: number) {
    this.clearTimers();
    if (this.paused) return;
    const auto = nextAutoAction(this.state, this.rng);
    if (auto) this.after(settle + auto.delayMs, () => this.dispatch(auto.actorId, auto.message));
  }
}
