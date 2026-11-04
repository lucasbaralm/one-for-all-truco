// Controlador de uma sala de Mímica: guarda o MimicaState, aplica as ações dos
// jogadores (com permissões) e dirige o que acontece sozinho — escolher a música quando o
// tempo estoura, a dica da metade da mímica, o fim do tempo, pular o turno de quem caiu da
// conexão e a passagem de uma mímica pra outra. Roda no room server (party/mimica.ts), com o
// mesmo relógio "do jogo" da Forca (clock()).

import {
  MimicaState,
  Result,
  acceptGuess,
  advanceTurn,
  autoPick,
  canStart,
  createLobby,
  giveUp,
  joinLobby,
  pickSong,
  removePlayer,
  returnToLobby,
  setPlayerConnected,
  setRounds,
  showHint,
  skipTurn,
  startGame,
  submitGuess,
  timeoutMime,
} from "./engine";
import type { MimicaClientMessage } from "./protocol";
import { TIMING } from "./timing";

type Rng = () => number;

/** O que o próprio jogo faz, sem ninguém clicar. */
type AutoMessage = { type: "advance" } | { type: "autopick" } | { type: "hint" } | { type: "timeout" } | { type: "skip" };

interface AutoAction {
  delayMs: number;
  message: AutoMessage;
}

/** O que o jogo faz sozinho a seguir (null = espera um humano). `now` = relógio do jogo, em ms. */
export function nextAutoAction(state: MimicaState, now: number): AutoAction | null {
  if (state.phase === "turn_end") return { delayMs: TIMING.TURN_END_MS, message: { type: "advance" } };
  if (state.phase !== "picking" && state.phase !== "miming") return null;
  const turn = state.turn;
  if (!turn) return null;

  const mimer = state.players.find((p) => p.id === turn.mimerId);
  if (!mimer || !mimer.connected) {
    // Quem faz a mímica caiu: pula o turno — mas só se sobrou alguém conectado (senão a sala só espera alguém voltar).
    const someoneThere = state.players.some((p) => p.connected && p.id !== turn.mimerId);
    return someoneThere ? { delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip" } } : null;
  }
  if (state.phase === "picking") return { delayMs: Math.max(0, state.deadline - now), message: { type: "autopick" } };
  if (turn.hint === 0 && state.hintAt > 0 && state.hintAt < state.deadline) return { delayMs: Math.max(0, state.hintAt - now), message: { type: "hint" } };
  return { delayMs: Math.max(0, state.deadline - now), message: { type: "timeout" } };
}

export interface MimicaControllerOptions {
  rng?: Rng;
  /** Relógio em ms (padrão: Date.now). Os testes injetam um relógio manual. */
  now?: () => number;
  /** Chamado depois de toda mudança de estado (ação de jogador ou automática). */
  onChange?: (state: MimicaState) => void;
  /** Chamado quando o host expulsa alguém (o servidor fecha a conexão dele). */
  onKick?: (playerId: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Divide todas as esperas (e o tempo de cada fase) — só pra teste ponta a ponta; em produção é 1. */
  speed?: number;
}

export class MimicaController {
  state: MimicaState;
  private readonly rng: Rng;
  private readonly nowFn: () => number;
  private readonly onChange?: (state: MimicaState) => void;
  private readonly onKick?: (playerId: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly speed: number;
  private timer: unknown = null;
  private paused = false;

  constructor(initial: MimicaState = createLobby(), opts: MimicaControllerOptions = {}) {
    this.state = initial;
    this.rng = opts.rng ?? Math.random;
    this.nowFn = opts.now ?? Date.now;
    this.onChange = opts.onChange;
    this.onKick = opts.onKick;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  }

  /** Relógio "do jogo": com speed > 1 o tempo anda mais rápido (o tempo de cada fase incluído). */
  clock(): number {
    return this.nowFn() * this.speed;
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    const s = this.state;
    if (!paused && (s.phase === "picking" || s.phase === "miming")) {
      // A sala ficou vazia e o relógio seguiu andando: quem volta não pode encontrar o tempo já vencido.
      // Recomeça a contagem da fase (e avisa todo mundo do prazo novo).
      const now = this.clock();
      const next =
        s.phase === "picking"
          ? { ...s, deadline: now + TIMING.PICK_MS }
          : { ...s, deadline: now + TIMING.MIME_MS, hintAt: s.turn?.hint === 0 ? now + Math.round(TIMING.MIME_MS * TIMING.HINT_AT) : 0 };
      this.commit(next);
      return;
    }
    this.reschedule();
  }

  /** Retoma depois de carregar um estado salvo. */
  resume() {
    this.reschedule();
  }

  dispose() {
    this.cancelTimer();
  }

  setConnected(playerId: string, connected: boolean) {
    const next = setPlayerConnected(this.state, playerId, connected);
    if (next !== this.state) this.commit(next);
  }

  /** Remove da sala (lobby) ou marca desconectado (partida rolando). */
  leave(playerId: string) {
    this.commit(removePlayer(this.state, playerId));
  }

  dispatch(actorId: string, message: MimicaClientMessage): Result {
    const s = this.state;
    const isHost = s.hostId === actorId;
    const notHost: Result = { ok: false, error: "not_host" };
    let result: Result;

    switch (message.type) {
      case "join": {
        // Sala que já acabou e ficou vazia: quem chega depois recomeça no lobby.
        const stale = s.phase === "game_over" && !s.players.some((p) => p.id === actorId) && !s.players.some((p) => p.connected);
        result = joinLobby(stale ? returnToLobby(s) : s, { id: actorId, name: message.name, avatarUrl: message.avatarUrl });
        break;
      }
      case "set_rounds":
        result = isHost ? setRounds(s, message.rounds) : notHost;
        break;
      case "kick": {
        const target = s.players.find((p) => p.id === message.playerId);
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
        else result = startGame(s, this.rng, this.clock());
        break;
      case "pick":
        result = Number.isInteger(message.songId) ? pickSong(s, actorId, message.songId, this.clock()) : { ok: false, error: "bad_song" };
        break;
      case "guess":
        result = typeof message.text === "string" ? submitGuess(s, actorId, message.text, this.clock()) : { ok: false, error: "bad_guess" };
        break;
      case "accept":
        result = Number.isInteger(message.guess) ? acceptGuess(s, actorId, message.guess, this.clock()) : { ok: false, error: "no_such_guess" };
        break;
      case "give_up":
        result = giveUp(s, actorId);
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

    if (result.ok) this.commit(result.state);
    return result;
  }

  private commit(next: MimicaState) {
    this.state = next;
    this.onChange?.(next);
    this.reschedule();
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  // Toda mudança de estado cancela o timer anterior e agenda a próxima ação automática.
  private reschedule() {
    this.cancelTimer();
    if (this.paused) return;
    const auto = nextAutoAction(this.state, this.clock());
    if (!auto) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.run(auto.message);
    }, auto.delayMs / this.speed);
  }

  private run(message: AutoMessage) {
    const now = this.clock();
    let r: Result;
    if (message.type === "advance") r = advanceTurn(this.state, this.rng, now);
    else if (message.type === "autopick") r = autoPick(this.state, this.rng, now);
    else if (message.type === "hint") r = showHint(this.state);
    else if (message.type === "timeout") r = timeoutMime(this.state);
    else r = skipTurn(this.state);
    if (r.ok) this.commit(r.state);
  }
}
