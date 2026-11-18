import { MonoController } from "../src/lib/monopoly/controller";
import type { EditionId } from "../src/lib/monopoly/editions";
import { MonoState, STATE_VERSION, createLobby, toView } from "../src/lib/monopoly/engine";
import type { MonoServerMessage } from "../src/lib/monopoly/protocol";
import { REACTION_EMOJIS } from "../src/lib/party-codes";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room servers do Monopoly e do Banco Imobiliário (bindings "Monopoly" e "Banco" em wrangler.jsonc).
// É o MESMO jogo: o motor lê o tabuleiro, as cartas e o dinheiro da edição (src/lib/monopoly/editions),
// então as duas salas só diferem na edição, no prefixo do histórico e na variável de velocidade do teste
// ponta a ponta. Tudo que está na mesa é público; só a ordem dos baralhos fica aqui — por isso cada
// jogador recebe a SUA visão (toView: as próprias ações possíveis, sem `decks`). Autenticação, salas,
// reconexão e histórico vêm de GameRoom (party/game-room.ts).

type SpeedEnv = { MONOPOLY_SPEED?: string; BANCO_SPEED?: string };

// Atenção: o construtor do GameRoom chama createController() ANTES de os campos da subclasse existirem,
// então o que muda por edição é método (mora no protótipo), não propriedade.
abstract class MonoRoom extends GameRoom<MonoState> {
  protected abstract editionId(): EditionId;
  /** Divisor das esperas dos bots, só pro teste ponta a ponta (wrangler dev --var MONOPOLY_SPEED:8). */
  protected abstract speed(env: SpeedEnv): number;

  protected createController(hooks: ControllerHooks<MonoState>): RoomController<MonoState> {
    return new MonoController(createLobby(this.editionId()), {
      ...hooks,
      speed: this.speed(this.room.env as unknown as SpeedEnv),
    });
  }

  protected perViewer() {
    return true;
  }

  protected emojis() {
    return REACTION_EMOJIS;
  }

  protected stateMessage(state: MonoState, viewer: string | null) {
    return JSON.stringify({ type: "state", state: toView(state, viewer) } satisfies MonoServerMessage);
  }

  protected isLobby(state: MonoState) {
    return state.phase === "lobby";
  }

  protected isGameOver(state: MonoState) {
    return state.phase === "game_over";
  }

  protected findPlayer(state: MonoState, id: string) {
    return state.players.find((p) => p.id === id);
  }

  protected markHumansDisconnected(state: MonoState): MonoState {
    // Estado salvo por uma versão antiga do jogo (ou de outra edição) não serve: começa um lobby limpo.
    if (state.version !== STATE_VERSION || state.edition !== this.editionId()) return createLobby(this.editionId());
    return { ...state, players: state.players.map((p) => (p.bot ? p : { ...p, connected: false })) };
  }

  protected historyRow(state: MonoState) {
    if (!state.standings || !state.winnerId) return null;
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      winner_name: winner?.name ?? state.standings[0].name,
      // score = patrimônio no fim (dinheiro + propriedades + construções)
      players_summary: state.standings.map((s) => ({ name: s.name, score: s.netWorth })),
    };
  }
}

export class MonopolyRoom extends MonoRoom {
  protected editionId(): EditionId {
    return "monopoly";
  }
  protected speed(env: SpeedEnv) {
    return Number(env.MONOPOLY_SPEED) || 1;
  }
  protected historyPrefix() {
    return "MONOPOLY:";
  }
}

export class BancoRoom extends MonoRoom {
  protected editionId(): EditionId {
    return "banco";
  }
  protected speed(env: SpeedEnv) {
    return Number(env.BANCO_SPEED) || Number(env.MONOPOLY_SPEED) || 1;
  }
  protected historyPrefix() {
    return "BANCO:";
  }
}
