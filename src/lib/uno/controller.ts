// Controlador de uma sala de Uno: guarda o UnoState, aplica as ações dos
// jogadores (com permissões) e dirige o que acontece sozinho — bots jogando,
// bots "pegando" quem esqueceu o UNO, e um bot jogando por quem caiu da
// conexão. Roda no room server (party/uno.ts).
//
// É por turnos como o Ludo (uma ação automática por vez), mais os "pegadores":
// quando alguém fica com 1 carta sem gritar UNO, cada bot agenda a própria
// reação — quem chegar primeiro pega.

import { UNO_COLORS } from "./cards";
import { BotAction, chooseBotAction } from "./bot";
import {
  BotLevel,
  Result,
  UnoEvent,
  UnoState,
  addBot,
  callUno,
  canStart,
  catchUno,
  createLobby,
  currentPlayer,
  drawCard,
  joinLobby,
  passTurn,
  playCard,
  removePlayer,
  returnToLobby,
  setBotLevel,
  setPlayerConnected,
  startGame,
} from "./engine";
import type { UnoClientMessage } from "./protocol";
import { BOT_CATCH_MS, TIMING } from "./timing";

type Rng = () => number;

interface AutoAction {
  delayMs: number;
  actorId: string;
  message: UnoClientMessage;
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

const toMessage = (a: BotAction): UnoClientMessage =>
  a.type === "play" ? { type: "play", card: a.card, color: a.color, uno: a.uno } : a.type === "draw" ? { type: "draw" } : { type: "pass" };

/** A jogada automática da vez (bot ou humano desconectado); null = espera um humano. */
export function nextAutoAction(state: UnoState, rng: Rng = Math.random): AutoAction | null {
  if (state.phase !== "playing") return null;
  const player = currentPlayer(state);
  if (!player) return null;
  if (player.bot) {
    return { delayMs: between(rng, TIMING.BOT_THINK_MIN_MS, TIMING.BOT_THINK_MAX_MS), actorId: player.id, message: toMessage(chooseBotAction(state, player.id, player.bot, rng)) };
  }
  if (!player.connected) {
    return { delayMs: TIMING.DISCONNECTED_MS, actorId: player.id, message: toMessage(chooseBotAction(state, player.id, "medium", rng)) };
  }
  return null;
}

/** Os bots que vão tentar pegar quem está com 1 carta e sem UNO, cada um no seu tempo de reação. */
export function catchActions(state: UnoState, rng: Rng = Math.random): AutoAction[] {
  if (state.phase !== "playing" || !state.exposed) return [];
  const out: AutoAction[] = [];
  for (const p of state.players) {
    if (!p.bot || p.id === state.exposed) continue;
    const range = BOT_CATCH_MS[p.bot as BotLevel];
    if (range) out.push({ delayMs: between(rng, range[0], range[1]), actorId: p.id, message: { type: "catch" } });
  }
  return out;
}

/** Quanto tempo a animação da última ação leva na tela (o jogo só segue depois). */
export function settleMs(events: UnoEvent[]): number {
  let ms = 0;
  for (const e of events) {
    if (e.t === "play") ms += TIMING.PLAY_SETTLE_MS;
    else if (e.t === "draw") ms += TIMING.DRAW_SETTLE_MS * (e.penalty ? 1.5 : 1);
  }
  return ms;
}

export interface UnoControllerOptions {
  rng?: Rng;
  /** Chamado depois de toda mudança de estado (ação de jogador ou automática). */
  onChange?: (state: UnoState) => void;
  /** Chamado quando o host expulsa alguém (o servidor fecha a conexão dele). */
  onKick?: (playerId: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Divide todas as esperas automáticas — só pra teste ponta a ponta; em produção é 1. */
  speed?: number;
}

export class UnoController {
  state: UnoState;
  private readonly rng: Rng;
  private readonly onChange?: (state: UnoState) => void;
  private readonly onKick?: (playerId: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly speed: number;
  private timers: unknown[] = [];
  private paused = false;

  constructor(initial: UnoState = createLobby(), opts: UnoControllerOptions = {}) {
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

  dispatch(actorId: string, message: UnoClientMessage): Result {
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
        result = isHost ? addBot(s, message.level) : notHost;
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
        result = isHost ? setBotLevel(s, message.botId, message.level) : notHost;
        break;
      case "kick": {
        const target = s.players.find((p) => p.id === message.playerId && !p.bot);
        if (!isHost) result = notHost;
        else if (!target || target.id === actorId) result = { ok: false, error: "not_in_room" };
        else {
          result = { ok: true, state: removePlayer(s, target.id) };
          this.onKick?.(target.id);
        }
        break;
      }
      case "leave":
        result = { ok: true, state: removePlayer(s, actorId) };
        break;
      case "start":
        if (!isHost) result = notHost;
        else if (!canStart(s)) result = { ok: false, error: "not_enough_players" };
        else {
          result = startGame(s, this.rng);
          intro = TIMING.INTRO_MS;
        }
        break;
      case "play": {
        if (!Number.isInteger(message.card)) result = { ok: false, error: "bad_card" };
        else if (message.color !== undefined && !UNO_COLORS.includes(message.color)) result = { ok: false, error: "bad_color" };
        else result = playCard(s, actorId, message.card, message.color, message.uno === true, this.rng);
        break;
      }
      case "draw":
        result = drawCard(s, actorId, this.rng);
        break;
      case "pass":
        result = passTurn(s, actorId);
        break;
      case "uno":
        result = callUno(s, actorId);
        break;
      case "catch":
        result = catchUno(s, actorId, this.rng);
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

  private commit(next: UnoState, settle: number) {
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

  // Toda mudança de estado cancela tudo que estava agendado e agenda de novo:
  // a próxima jogada automática e, se alguém está sem UNO, a reação de cada bot.
  // `settle` dá tempo da animação da ação que acabou de acontecer.
  private reschedule(settle: number) {
    this.clearTimers();
    if (this.paused) return;
    const auto = nextAutoAction(this.state, this.rng);
    if (auto) this.after(settle + auto.delayMs, () => this.run(auto));
    for (const c of catchActions(this.state, this.rng)) this.after(settle + c.delayMs, () => this.run(c));
  }

  private run(auto: AutoAction) {
    this.dispatch(auto.actorId, auto.message);
  }
}
