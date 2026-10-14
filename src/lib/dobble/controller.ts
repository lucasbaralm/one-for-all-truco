// Controlador de uma sala de Dobble: guarda o DobbleState, aplica as ações dos
// jogadores (com permissões) e dirige o que acontece sozinho — a contagem
// regressiva, a rodada ganha parada na mesa antes de avançar, e os bots
// "achando" o símbolo depois de um tempo de reação. Roda no room server
// (party/dobble.ts), como o controlador do Ludo.
//
// Diferente do Ludo (uma ação automática por vez), aqui vários bots correm ao
// mesmo tempo: cada rodada agenda um timer por bot, e vence quem chegar primeiro.

import {
  DobbleState,
  LOCK_MS,
  Result,
  addBot,
  advanceRound,
  beginPlay,
  canStart,
  claim,
  createLobby,
  joinLobby,
  matchFor,
  removePlayer,
  returnToLobby,
  setBotLevel,
  setMode,
  setPlayerConnected,
  startGame,
} from "./engine";
import { ALL_CARDS } from "./cards";
import type { DobbleClientMessage } from "./protocol";
import { BOT_MISS_RATE, BOT_REACTION_MS, TIMING } from "./timing";

type Rng = () => number;

export interface DobbleControllerOptions {
  rng?: Rng;
  /** Relógio em ms (padrão: Date.now). Os testes injetam um relógio manual. */
  now?: () => number;
  onChange?: (state: DobbleState) => void;
  onKick?: (playerId: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Divide todas as esperas (e o castigo) — só pra teste ponta a ponta; em produção é 1. */
  speed?: number;
}

export class DobbleController {
  state: DobbleState;
  private readonly rng: Rng;
  private readonly nowFn: () => number;
  private readonly onChange?: (state: DobbleState) => void;
  private readonly onKick?: (playerId: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly speed: number;
  private timers: unknown[] = [];
  /** Identifica a situação pra qual os timers atuais foram agendados (fase + rodada + partida). */
  private signature = "";
  private paused = false;

  constructor(initial: DobbleState = createLobby(), opts: DobbleControllerOptions = {}) {
    this.state = initial;
    this.rng = opts.rng ?? Math.random;
    this.nowFn = opts.now ?? Date.now;
    this.onChange = opts.onChange;
    this.onKick = opts.onKick;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  }

  /** Relógio "do jogo": com speed > 1 o tempo anda mais rápido (castigos incluídos). */
  clock(): number {
    return this.nowFn() * this.speed;
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.signature = "";
    this.reschedule();
  }

  /** Retoma depois de carregar um estado salvo. */
  resume() {
    this.signature = "";
    this.reschedule();
  }

  dispose() {
    this.clearTimers();
  }

  setConnected(playerId: string, connected: boolean) {
    const next = setPlayerConnected(this.state, playerId, connected);
    if (next !== this.state) this.commit(next);
  }

  /** Remove da sala (lobby) ou marca desconectado (partida rolando). */
  leave(playerId: string) {
    this.commit(removePlayer(this.state, playerId));
  }

  dispatch(actorId: string, message: DobbleClientMessage): Result {
    const s = this.state;
    const isHost = s.hostId === actorId;
    const notHost: Result = { ok: false, error: "not_host" };
    let result: Result;

    switch (message.type) {
      case "join": {
        // Sala que já acabou e ficou vazia: quem chega depois recomeça no lobby.
        const stale =
          s.phase === "game_over" &&
          !s.players.some((p) => p.id === actorId) &&
          !s.players.some((p) => !p.bot && p.connected);
        result = joinLobby(stale ? returnToLobby(s) : s, {
          id: actorId,
          name: message.name,
          avatarUrl: message.avatarUrl,
        });
        break;
      }
      case "set_mode":
        result = isHost ? setMode(s, message.mode) : notHost;
        break;
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
        else result = startGame(s, this.rng);
        break;
      case "claim":
        result = claim(s, actorId, message.symbol, message.round, this.clock());
        break;
      case "rematch":
        if (s.phase !== "game_over" || !s.players.some((p) => p.id === actorId)) {
          result = { ok: false, error: "not_game_over" };
        } else {
          result = { ok: true, state: returnToLobby(s) };
        }
        break;
      case "emoji":
        // efêmero: quem repassa é o servidor, o jogo não muda
        return { ok: true, state: s };
      default:
        result = { ok: false, error: "unknown_message" };
    }

    if (result.ok) this.commit(result.state);
    return result;
  }

  private commit(next: DobbleState) {
    this.state = next;
    this.onChange?.(next);
    this.reschedule();
  }

  private clearTimers() {
    for (const t of this.timers) this.clearTimer(t);
    this.timers = [];
  }

  private after(ms: number, fn: () => void) {
    this.timers.push(this.setTimer(fn, ms / this.speed));
  }

  // Os timers só são refeitos quando a SITUAÇÃO muda (fase, rodada ou partida).
  // Um erro de símbolo durante a rodada muda o estado mas não a situação — se
  // reagendasse, os bots ganhariam um tempo de reação novo a cada erro de alguém.
  private reschedule() {
    if (this.paused) {
      this.clearTimers();
      this.signature = "";
      return;
    }
    const s = this.state;
    const signature = `${s.gameNumber}:${s.phase}:${s.round}`;
    if (signature === this.signature) return;
    this.clearTimers();
    this.signature = signature;

    if (s.phase === "countdown") {
      this.after(TIMING.COUNTDOWN_MS, () => this.step(beginPlay(this.state, this.clock())));
    } else if (s.phase === "round_end") {
      this.after(TIMING.ROUND_END_MS, () => this.step(advanceRound(this.state, this.clock())));
    } else if (s.phase === "playing") {
      this.scheduleBots();
    }
  }

  private step(result: Result) {
    if (result.ok) this.commit(result.state);
  }

  private scheduleBots() {
    const round = this.state.round;
    for (const p of this.state.players) {
      if (!p.bot) continue;
      const [lo, hi] = BOT_REACTION_MS[p.bot];
      let delay = lo + this.rng() * (hi - lo);

      // Às vezes o bot se apressa, clica num símbolo errado, leva o castigo e só então acerta.
      if (this.rng() < BOT_MISS_RATE[p.bot]) {
        const wrongAt = delay * 0.55;
        this.after(wrongAt, () => this.botClaim(p.id, round, false));
        delay = Math.max(delay, wrongAt + LOCK_MS + 400);
      }
      this.after(delay, () => this.botClaim(p.id, round, true));
    }
  }

  private botClaim(botId: string, round: number, correct: boolean) {
    const s = this.state;
    if (s.phase !== "playing" || s.round !== round) return;
    const right = matchFor(s, botId);
    const bot = s.players.find((p) => p.id === botId);
    if (right === null || !bot || bot.hand === null) return;
    const symbol = correct
      ? right
      : (ALL_CARDS[bot.hand].filter((x) => x !== right)[Math.floor(this.rng() * (ALL_CARDS[bot.hand].length - 1))] ?? right + 1);
    this.dispatch(botId, { type: "claim", symbol, round });
  }
}
