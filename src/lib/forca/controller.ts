// Controlador de uma sala de Forca: guarda o ForcaState, aplica as ações dos
// jogadores (com permissões) e dirige o que acontece sozinho — bots chutando,
// o chute automático quando o tempo da vez estoura, um bot jogando por quem
// caiu da conexão e a passagem de uma palavra pra outra. Roda no room server
// (party/forca.ts), com o mesmo relógio "do jogo" do Dobble (clock()).

import { BotAction, chooseBotAction } from "./bot";
import {
  ForcaState,
  Result,
  addBot,
  advanceRound,
  canStart,
  createLobby,
  currentPlayer,
  guessLetter,
  guessWord,
  joinLobby,
  removePlayer,
  returnToLobby,
  setBotLevel,
  setPlayerConnected,
  setRounds,
  startGame,
  timeoutTurn,
} from "./engine";
import type { ForcaClientMessage } from "./protocol";
import { TIMING } from "./timing";

type Rng = () => number;

type AutoMessage = ForcaClientMessage | { type: "timeout" } | { type: "advance" };

interface AutoAction {
  delayMs: number;
  actorId: string;
  message: AutoMessage;
}

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

const toMessage = (a: BotAction): ForcaClientMessage => (a.type === "letter" ? { type: "guess", letter: a.letter } : { type: "guess_word", word: a.word });

/** O que o jogo faz sozinho a seguir (null = espera um humano). `now` = relógio do jogo, em ms. */
export function nextAutoAction(state: ForcaState, rng: Rng, now: number): AutoAction | null {
  if (state.phase === "round_end") return { delayMs: TIMING.ROUND_END_MS, actorId: "server", message: { type: "advance" } };
  if (state.phase !== "playing") return null;
  const player = currentPlayer(state);
  if (!player) return null;

  if (player.bot || !player.connected) {
    const action = chooseBotAction(state, player.bot ?? "medium", rng);
    if (!action) return null;
    const delayMs = player.bot ? between(rng, TIMING.BOT_THINK_MIN_MS, TIMING.BOT_THINK_MAX_MS) : TIMING.DISCONNECTED_MS;
    return { delayMs, actorId: player.id, message: toMessage(action) };
  }
  // Humano conectado: espera ele — até estourar o tempo da vez.
  if (state.turnDeadline > 0) return { delayMs: Math.max(0, state.turnDeadline - now), actorId: player.id, message: { type: "timeout" } };
  return null;
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
      case "set_rounds":
        result = isHost ? setRounds(s, message.rounds) : notHost;
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
          // A vez só começa a contar depois da apresentação da primeira palavra.
          result = startGame(s, this.rng, this.clock() + TIMING.INTRO_MS);
          settle = TIMING.INTRO_MS;
        }
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
    const auto = nextAutoAction(this.state, this.rng, this.clock());
    if (!auto) return;
    // O estouro do tempo da vez é medido no relógio do jogo (não soma a animação).
    const wait = auto.message.type === "timeout" ? auto.delayMs : settle + auto.delayMs;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.run(auto);
    }, wait / this.speed);
  }

  private run(auto: AutoAction) {
    const { message } = auto;
    if (message.type === "advance") {
      const r = advanceRound(this.state, this.rng, this.clock());
      if (r.ok) this.commit(r.state, TIMING.LETTER_SETTLE_MS);
      return;
    }
    if (message.type === "timeout") {
      const r = timeoutTurn(this.state, this.rng, this.clock());
      if (r.ok) this.commit(r.state, TIMING.LETTER_SETTLE_MS);
      return;
    }
    this.dispatch(auto.actorId, message);
  }
}
