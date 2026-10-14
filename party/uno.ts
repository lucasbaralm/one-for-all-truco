import { REACTION_EMOJIS } from "../src/lib/party-codes";
import { UnoController } from "../src/lib/uno/controller";
import { UnoState, createLobby, toView } from "../src/lib/uno/engine";
import type { UnoServerMessage } from "../src/lib/uno/protocol";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room server do Uno (binding "Uno" em wrangler.jsonc). O servidor sorteia o
// baralho, confere cada jogada, joga pelos bots e SEGURA as mãos: cada jogador
// recebe uma mensagem só sua (perViewer) com a própria mão; a dos outros — e o
// monte — nunca saem daqui. Autenticação, salas, reconexão e histórico vêm de
// GameRoom (party/game-room.ts).

export default class UnoRoom extends GameRoom<UnoState> {
  protected createController(hooks: ControllerHooks<UnoState>): RoomController<UnoState> {
    const env = this.room.env as unknown as { UNO_SPEED?: string };
    return new UnoController(createLobby(), {
      ...hooks,
      // Só o teste ponta a ponta define UNO_SPEED (wrangler dev --var UNO_SPEED:8).
      speed: Number(env.UNO_SPEED) || 1,
    });
  }

  protected perViewer() {
    return true;
  }

  protected emojis() {
    return REACTION_EMOJIS;
  }

  protected stateMessage(state: UnoState, viewer: string | null) {
    return JSON.stringify({ type: "state", state: toView(state, viewer) } satisfies UnoServerMessage);
  }

  protected isLobby(state: UnoState) {
    return state.phase === "lobby";
  }

  protected isGameOver(state: UnoState) {
    return state.phase === "game_over";
  }

  protected findPlayer(state: UnoState, id: string) {
    return state.players.find((p) => p.id === id);
  }

  protected markHumansDisconnected(state: UnoState): UnoState {
    return { ...state, players: state.players.map((p) => (p.bot ? p : { ...p, connected: false })) };
  }

  protected historyPrefix() {
    return "UNO:";
  }

  protected historyRow(state: UnoState) {
    if (!state.standings || !state.winnerId) return null;
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      winner_name: winner?.name ?? state.standings[0].name,
      // score = cartas que sobraram na mão (0 = quem ganhou)
      players_summary: state.standings.map((s) => ({ name: s.name, score: s.cards })),
    };
  }
}

