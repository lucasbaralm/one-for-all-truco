// Controlador de uma sala de Forca: guarda o ForcaState, aplica as ações dos
// jogadores (com permissões) e dirige o que acontece sozinho — o chute automático quando
// o tempo da vez estoura, pular a vez (ou a escolha da palavra) de quem caiu da conexão
// e a passagem de uma palavra pra outra. Roda no room server (party/forca.ts), com o
// mesmo relógio "do jogo" do Dobble (clock()).

import {
  ForcaState,
  Result,
  advanceRound,
  canStart,
  chooseWord,
  createLobby,
  currentPlayer,
  guessLetter,
  guessWord,
  joinLobby,
  removePlayer,
  returnToLobby,
  setPlayerConnected,
  setRounds,
  skipChooser,
  skipTurn,
  startGame,
  timeoutTurn,
} from "./engine";
import type { ForcaClientMessage } from "./protocol";
import { TIMING } from "./timing";

type Rng = () => number;

/** O que o próprio jogo faz, sem ninguém clicar. */
type AutoMessage = { type: "timeout" } | { type: "advance" } | { type: "skip_chooser" } | { type: "skip_turn" };

interface AutoAction {
  delayMs: number;
  message: AutoMessage;
}

/** O que o jogo faz sozinho a seguir (null = espera um humano). `now` = relógio do jogo, em ms. */
export function nextAutoAction(state: ForcaState, now: number): AutoAction | null {
  if (state.phase === "round_end") return { delayMs: TIMING.ROUND_END_MS, message: { type: "advance" } };

  if (state.phase === "choosing") {
    const chooser = state.players.find((p) => p.id === state.chooserId);
    // Escolhedor fora da conexão: não dá pra esperar — pula a rodada depois de uma folga.
    if (!chooser || !chooser.connected) return { delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip_chooser" } };
    return { delayMs: Math.max(0, state.turnDeadline - now), message: { type: "skip_chooser" } };
  }

  if (state.phase !== "playing") return null;
  const player = currentPlayer(state);
  if (!player) return null;
  if (player.connected) return { delayMs: Math.max(0, state.turnDeadline - now), message: { type: "timeout" } };
  // Chutador fora da conexão: pula a vez dele — mas só se sobrou alguém conectado pra jogar
  // (senão ficaria passando a vez em círculos; a sala espera alguém voltar).
  const someoneToPlay = state.players.some((p) => p.connected && p.id !== state.chooserId && p.id !== player.id);
  return someoneToPlay ? { delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip_turn" } } : null;
}

export interface ForcaControllerOptions {
  rng?: Rng;
  /** Relógio em ms (padrão: Date.now). Os testes injetam um relógio manual. */
  now?: () => number;
  /** Chamado depois de toda mudança de estado (ação de jogador ou automática). */
  onChange?: (state: ForcaState) => void;
  /** Chamado quando o host expulsa alguém (o servidor fecha a conexão dele). */
  onKick?: (playerId: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Divide todas as esperas (e o tempo da vez) — só pra teste ponta a ponta; em produção é 1. */
  speed?: number;
}

export class ForcaController {
  state: ForcaState;
  private readonly rng: Rng;
  private readonly nowFn: () => number;
  private readonly onChange?: (state: ForcaState) => void;
  private readonly onKick?: (playerId: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly speed: number;
  private timer: unknown = null;
  private paused = false;

  constructor(initial: ForcaState = createLobby(), opts: ForcaControllerOptions = {}) {
    this.state = initial;
    this.rng = opts.rng ?? Math.random;
    this.nowFn = opts.now ?? Date.now;
    this.onChange = opts.onChange;
    this.onKick = opts.onKick;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  }

  /** Relógio "do jogo": com speed > 1 o tempo anda mais rápido (o tempo da vez incluído). */
  clock(): number {
    return this.nowFn() * this.speed;
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused && (this.state.phase === "choosing" || this.state.phase === "playing")) {
      // A sala ficou vazia e o relógio seguiu andando: quem volta não pode encontrar a vez já vencida.
      // Recomeça a contagem de quem estava na vez (e avisa todo mundo do prazo novo).
      const window = this.state.phase === "choosing" ? TIMING.CHOOSE_MS : TIMING.TURN_MS;
      this.commit({ ...this.state, turnDeadline: this.clock() + window }, 0);
      return;
    }
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

  dispatch(actorId: string, message: ForcaClientMessage): Result {
    const s = this.state;
    const isHost = s.hostId === actorId;
    const notHost: Result = { ok: false, error: "not_host" };
    let result: Result;
    let settle = 0;

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
        else result = startGame(s, this.clock());
        break;
      case "choose_word":
        result = typeof message.word === "string" ? chooseWord(s, actorId, message.word, this.clock()) : { ok: false, error: "bad_word" };
        break;
      case "guess":
        result = typeof message.letter === "string" ? guessLetter(s, actorId, message.letter, this.clock()) : { ok: false, error: "bad_letter" };
        settle = TIMING.LETTER_SETTLE_MS;
        break;
      case "guess_word":
        result = typeof message.word === "string" ? guessWord(s, actorId, message.word, this.clock()) : { ok: false, error: "bad_word" };
        settle = TIMING.LETTER_SETTLE_MS;
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

    if (result.ok) this.commit(result.state, settle);
    return result;
  }

  private commit(next: ForcaState, settle: number) {
    this.state = next;
    this.onChange?.(next);
    this.reschedule(settle);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  // Toda mudança de estado cancela o timer anterior e agenda a próxima ação
  // automática; `settle` dá tempo da animação da letra que acabou de entrar.
  private reschedule(settle: number) {
    this.cancelTimer();
    if (this.paused) return;
    const auto = nextAutoAction(this.state, this.clock());
    if (!auto) return;
    // O fim do prazo da vez é medido no relógio do jogo (não soma a animação).
    const waitsDeadline = auto.message.type === "timeout" || (auto.message.type === "skip_chooser" && this.state.players.find((p) => p.id === this.state.chooserId)?.connected);
    const wait = waitsDeadline ? auto.delayMs : settle + auto.delayMs;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.run(auto.message);
    }, wait / this.speed);
  }

  private run(message: AutoMessage) {
    const now = this.clock();
    let r: Result;
    if (message.type === "advance") r = advanceRound(this.state, now);
    else if (message.type === "timeout") r = timeoutTurn(this.state, this.rng, now);
    else if (message.type === "skip_chooser") r = skipChooser(this.state, now);
    else r = skipTurn(this.state, now);
    if (r.ok) this.commit(r.state, message.type === "advance" || message.type === "skip_chooser" ? 0 : TIMING.LETTER_SETTLE_MS);
  }
}
