import type * as Party from "partykit/server";
import { LudoController } from "../src/lib/ludo/controller";
import { LudoState, createLobby } from "../src/lib/ludo/engine";
import { LUDO_EMOJIS, LudoServerMessage } from "../src/lib/ludo/protocol";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room server do Ludo (party "ludo" em partykit.json). Mesma ideia da Fodinha:
// o servidor é a única autoridade — aplica cada ação com as regras de
// src/lib/ludo, rola o dado, joga pelos bots e transmite o resultado pra
// todo mundo. Autenticação, salas, reconexão e histórico vêm de GameRoom
// (party/game-room.ts); aqui fica só o que é do Ludo.

export default class LudoRoom extends GameRoom<LudoState> {
  protected createController(hooks: ControllerHooks<LudoState>): RoomController<LudoState> {
    const env = this.room.env as unknown as { LUDO_SPEED?: string };
    return new LudoController(createLobby(), {
      ...hooks,
      // Só o teste ponta a ponta define LUDO_SPEED (partykit dev --var LUDO_SPEED=8).
      speed: Number(env.LUDO_SPEED) || 1,
    });
  }

  protected emojis() {
    return LUDO_EMOJIS;
  }

  protected stateMessage(state: LudoState) {
    return JSON.stringify({ type: "state", state } satisfies LudoServerMessage);
  }

  protected isLobby(state: LudoState) {
    return state.phase === "lobby";
  }

  protected isGameOver(state: LudoState) {
    return state.phase === "game_over";
  }

  protected findPlayer(state: LudoState, id: string) {
    return state.players.find((p) => p.id === id);
  }

  protected markHumansDisconnected(state: LudoState): LudoState {
    return { ...state, players: state.players.map((p) => (p.bot ? p : { ...p, connected: false })) };
  }

  protected historyPrefix() {
    return "LUDO:";
  }

  protected historyRow(state: LudoState) {
    if (!state.standings || !state.winnerId) return null;
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      winner_name: winner?.name ?? state.standings[0].name,
      players_summary: state.standings.map((s) => ({ name: s.name, score: s.finished, color: s.color })),
    };
  }
}

LudoRoom satisfies Party.Worker;
