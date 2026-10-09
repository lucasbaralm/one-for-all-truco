// Controlador de uma partida de Ludo: guarda o LudoState, aplica as ações
// dos jogadores (checando permissões) e dirige tudo que acontece "sozinho" —
// bots rolando/jogando, passar a vez quando não há jogada, jogar por quem
// caiu da conexão. Roda tanto no room server (party/ludo.ts) quanto no
// navegador (modo local contra bots), com os mesmos tempos e as mesmas regras.

import { chooseBotMove } from "./bot";
import {
  LudoState,
  Result,
  addBot,
  canStart,
  changeColor,
  createLobby,
  currentPlayer,
  distinctMoves,
  joinLobby,
  legalMoves,
  movePiece,
  passTurn,
  removePlayer,
  returnToLobby,
  rollDice,
  setBotLevel,
  setPlayerConnected,
  startGame,
} from "./engine";
import type { LudoClientMessage } from "./protocol";
import { TIMING, moveAnimationMs } from "./timing";

type Rng = () => number;

type AutoMessage = { type: "roll" } | { type: "move"; piece: number } | { type: "pass" };

interface AutoAction {
  delayMs: number;
  actorId: string;
  message: AutoMessage;
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

/** O que o jogo faz sozinho a seguir, dado o estado atual (null = espera um humano). */
export function nextAutoAction(state: LudoState, rng: Rng = Math.random): AutoAction | null {
  const player = currentPlayer(state);
  if (!player) return null;

  if (state.phase === "rolling") {
    if (player.bot) {
      return {
        delayMs: between(rng, TIMING.BOT_THINK_MIN_MS, TIMING.BOT_THINK_MAX_MS),
        actorId: player.id,
        message: { type: "roll" },
      };
    }
    if (!player.connected) {
      return { delayMs: TIMING.DISCONNECTED_MS, actorId: player.id, message: { type: "roll" } };
    }
    return null;
  }

  if (state.phase === "moving") {
    const moves = legalMoves(state);
    if (moves.length === 0) {
      return { delayMs: TIMING.PASS_MS, actorId: player.id, message: { type: "pass" } };
    }
    if (player.bot) {
      const piece = chooseBotMove(state, player.bot, rng);
      if (piece === null) return null;
      return {
        delayMs: between(rng, TIMING.BOT_THINK_MIN_MS, TIMING.BOT_THINK_MAX_MS),
        actorId: player.id,
        message: { type: "move", piece },
      };
    }
    if (!player.connected) {
      const piece = chooseBotMove(state, "medium", rng);
      if (piece === null) return null;
      return { delayMs: TIMING.DISCONNECTED_MS, actorId: player.id, message: { type: "move", piece } };
    }
    // Só uma jogada que faça diferença: não há o que decidir, joga direto.
    const distinct = distinctMoves(moves);
    if (distinct.length === 1) {
      return { delayMs: TIMING.AUTO_SINGLE_MS, actorId: player.id, message: { type: "move", piece: distinct[0].piece } };
    }
  }
  return null;
}

export interface LudoControllerOptions {
  rng?: Rng;
  /** Chamado depois de toda mudança de estado (ação de jogador ou automática). */
  onChange?: (state: LudoState) => void;
  /** Chamado quando o host expulsa alguém (o servidor fecha a conexão dele). */
  onKick?: (playerId: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /**
   * Divide todas as esperas automáticas (bots, passar a vez, animações). Só
   * pra teste ponta a ponta: uma partida inteira cai de ~15 min pra minutos.
   * Em produção fica em 1.
   */
  speed?: number;
}

export class LudoController {
  state: LudoState;
  private readonly rng: Rng;
  private readonly onChange?: (state: LudoState) => void;
  private readonly onKick?: (playerId: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly speed: number;
  private timer: unknown = null;
  private paused = false;

  constructor(initial: LudoState = createLobby(), opts: LudoControllerOptions = {}) {
    this.state = initial;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange;
    this.onKick = opts.onKick;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  }

  /** Pausa/retoma as jogadas automáticas (o servidor pausa sem ninguém conectado). */
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
    this.cancelTimer();
  }

  setConnected(playerId: string, connected: boolean) {
    const next = setPlayerConnected(this.state, playerId, connected);
    if (next !== this.state) this.commit(next, 0);
  }

  /** Remove da sala (lobby) ou marca desconectado (partida rolando). */
  leave(playerId: string) {
    this.commit(removePlayer(this.state, playerId), 0);
  }

  /** Aplica uma mensagem de um jogador já autenticado. */
  dispatch(actorId: string, message: LudoClientMessage): Result {
    const s = this.state;
    const isHost = s.hostId === actorId;
    const notHost: Result = { ok: false, error: "not_host" };

    let result: Result;
    let settleMs = 0;

    switch (message.type) {
      case "join": {
        // Sala que já acabou e ficou vazia (ninguém humano conectado): quem
        // chega depois recomeça no lobby em vez de só assistir a um fim de jogo velho.
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
      case "set_color":
        result = changeColor(s, actorId, message.color);
        break;
      case "add_bot":
        result = isHost ? addBot(s, message.level, message.color) : notHost;
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
          settleMs = TIMING.INTRO_MS;
        }
        break;
      case "roll": {
        const value = 1 + Math.floor(this.rng() * 6);
        result = rollDice(s, actorId, value);
        settleMs = TIMING.DICE_MS;
        break;
      }
      case "move":
        result = movePiece(s, actorId, message.piece);
        if (result.ok) settleMs = moveAnimationMs(result.state.lastMove);
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

    if (result.ok) this.commit(result.state, settleMs);
    return result;
  }

  private commit(next: LudoState, settleMs: number) {
    this.state = next;
    this.onChange?.(next);
    this.reschedule(settleMs);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  // Toda mudança de estado cancela o timer anterior e agenda a próxima ação
  // automática (se houver) — então nunca sobra uma jogada "velha" pendente.
  // `settleMs` dá tempo do cliente terminar a animação da ação que acabou
  // de acontecer antes de o jogo seguir sozinho.
  private reschedule(settleMs: number) {
    this.cancelTimer();
    if (this.paused) return;
    const auto = nextAutoAction(this.state, this.rng);
    if (!auto) return;

    this.timer = this.setTimer(() => {
      this.timer = null;
      this.runAuto(auto);
    }, (settleMs + auto.delayMs) / this.speed);
  }

  private runAuto(auto: AutoAction) {
    const { actorId, message } = auto;
    if (message.type === "pass") {
      const result = passTurn(this.state);
      if (result.ok) this.commit(result.state, 0);
      return;
    }
    this.dispatch(actorId, message);
  }
}
