import { REACTION_EMOJIS } from "../src/lib/party-codes";
import { ForcaController } from "../src/lib/forca/controller";
import { ForcaState, createLobby, toView } from "../src/lib/forca/engine";
import type { ForcaServerMessage } from "../src/lib/forca/protocol";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room server da Forca (binding "Forca" em wrangler.jsonc). O servidor sorteia a
// palavra, confere cada chute, joga pelos bots e SEGURA o segredo: toView só manda
// o que já foi revelado (a palavra inteira só depois que a rodada acaba). O
// relógio da vez é o do servidor — `now` vai junto com o estado, como no Dobble.
// Autenticação, salas, reconexão e histórico vêm de GameRoom (party/game-room.ts).

export default class ForcaRoom extends GameRoom<ForcaState> {
  protected createController(hooks: ControllerHooks<ForcaState>): RoomController<ForcaState> {
    const env = this.room.env as unknown as { FORCA_SPEED?: string };
    return new ForcaController(createLobby(), {
      ...hooks,
      // Só o teste ponta a ponta define FORCA_SPEED (wrangler dev --var FORCA_SPEED:8).
      speed: Number(env.FORCA_SPEED) || 1,
    });
  }

  protected emojis() {
    return REACTION_EMOJIS;
  }

  protected stateMessage(state: ForcaState) {
    const clock = (this.controller as ForcaController).clock();
    return JSON.stringify({ type: "state", state: toView(state), now: clock } satisfies ForcaServerMessage);
  }

  protected isLobby(state: ForcaState) {
    return state.phase === "lobby";
  }

  protected isGameOver(state: ForcaState) {
    return state.phase === "game_over";
  }

  protected findPlayer(state: ForcaState, id: string) {
    return state.players.find((p) => p.id === id);
  }

  protected markHumansDisconnected(state: ForcaState): ForcaState {
    return { ...state, players: state.players.map((p) => (p.bot ? p : { ...p, connected: false })) };
  }

  protected historyPrefix() {
    return "FORCA:";
  }

  protected historyRow(state: ForcaState) {
    if (!state.standings || !state.winnerId) return null;
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      winner_name: winner?.name ?? state.standings[0].name,
      players_summary: state.standings.map((s) => ({ name: s.name, score: s.score })),
    };
  }
}

