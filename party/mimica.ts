import { REACTION_EMOJIS } from "../src/lib/party-codes";
import { MimicaController } from "../src/lib/mimica/controller";
import { MIMICA_VERSION, MimicaState, createLobby, toView } from "../src/lib/mimica/engine";
import type { MimicaServerMessage } from "../src/lib/mimica/protocol";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room server da Mímica (binding "Mimica" em wrangler.jsonc). A carta e a música escolhida ficam SÓ
// aqui: cada pessoa recebe uma mensagem só dela (perViewer) — a carta vai pra quem faz a mímica, a música
// escolhida também, e todo mundo vê o título quando o turno acaba. O prazo usa o relógio do servidor
// (`now` vai junto com o estado, como na Forca).
// A videochamada (WebRTC) passa por aqui só na sinalização: GameRoom repassa as mensagens "rtc" entre
// quem está na mesa; o vídeo e o áudio vão direto de uma pessoa pra outra.
// Autenticação, salas, reconexão e histórico vêm de GameRoom (party/game-room.ts).

export default class MimicaRoom extends GameRoom<MimicaState> {
  protected createController(hooks: ControllerHooks<MimicaState>): RoomController<MimicaState> {
    const env = this.room.env as unknown as { MIMICA_SPEED?: string };
    return new MimicaController(createLobby(), {
      ...hooks,
      // Só o teste ponta a ponta define MIMICA_SPEED (wrangler dev --var MIMICA_SPEED:8).
      speed: Number(env.MIMICA_SPEED) || 1,
    });
  }

  protected perViewer() {
    return true;
  }

  protected supportsCall() {
    return true;
  }

  protected emojis() {
    return REACTION_EMOJIS;
  }

  protected stateMessage(state: MimicaState, viewer: string | null) {
    const clock = (this.controller as MimicaController).clock();
    return JSON.stringify({ type: "state", state: toView(state, viewer), now: clock } satisfies MimicaServerMessage);
  }

  protected isLobby(state: MimicaState) {
    return state.phase === "lobby";
  }

  protected isGameOver(state: MimicaState) {
    return state.phase === "game_over";
  }

  protected findPlayer(state: MimicaState, id: string) {
    return state.players.find((p) => p.id === id);
  }

  protected markHumansDisconnected(state: MimicaState): MimicaState {
    // Sala salva por uma versão antiga da Mímica: formato incompatível — volta pro lobby.
    if (state.version !== MIMICA_VERSION) return createLobby();
    return { ...state, players: state.players.map((p) => ({ ...p, connected: false })) };
  }

  protected historyPrefix() {
    return "MIMICA:";
  }

  protected historyRow(state: MimicaState) {
    if (!state.standings || !state.winnerId) return null;
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      winner_name: winner?.name ?? state.standings[0].name,
      players_summary: state.standings.map((s) => ({ name: s.name, score: s.score })),
    };
  }
}
