import { REACTION_EMOJIS } from "../src/lib/party-codes";
import { ForcaController } from "../src/lib/forca/controller";
import { FORCA_VERSION, ForcaState, createLobby, toView } from "../src/lib/forca/engine";
import type { ForcaServerMessage } from "../src/lib/forca/protocol";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room server da Forca (binding "Forca" em wrangler.jsonc). Quem escolhe a palavra da rodada
// digita ela aqui, e o servidor SEGURA o segredo: cada pessoa recebe uma mensagem só dela
// (perViewer) e a palavra só vai pro escolhedor — as outras veem o que já foi revelado, e todo
// mundo vê a palavra inteira quando a rodada acaba. A vez e o prazo usam o relógio do servidor
// (`now` vai junto com o estado, como no Dobble).
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

  protected perViewer() {
    return true;
  }

  protected emojis() {
    return REACTION_EMOJIS;
  }

  protected stateMessage(state: ForcaState, viewer: string | null) {
    const clock = (this.controller as ForcaController).clock();
    return JSON.stringify({ type: "state", state: toView(state, viewer), now: clock } satisfies ForcaServerMessage);
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
    // Sala salva por uma versão antiga da Forca (palavra sorteada, bots...): formato incompatível — volta pro lobby.
    if (state.version !== FORCA_VERSION) return createLobby();
    return { ...state, players: state.players.map((p) => ({ ...p, connected: false })) };
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
