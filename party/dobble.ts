import { DobbleController } from "../src/lib/dobble/controller";
import { DobbleState, createLobby, toView } from "../src/lib/dobble/engine";
import type { DobbleServerMessage } from "../src/lib/dobble/protocol";
import { REACTION_EMOJIS } from "../src/lib/party-codes";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";

// Room server do Dobble (binding "Dobble" em wrangler.jsonc). O servidor sorteia o
// baralho, confere cada "grito" de símbolo (quem chegou primeiro vence), joga
// pelos bots e segura cada rodada ganha na mesa antes de avançar. As cartas
// que ainda estão viradas pra baixo nunca saem daqui: o que vai pros clientes
// é toView(state), que só tem o que está virado pra cima.

export default class DobbleRoom extends GameRoom<DobbleState> {
  protected createController(hooks: ControllerHooks<DobbleState>): RoomController<DobbleState> {
    const env = this.room.env as unknown as { DOBBLE_SPEED?: string };
    return new DobbleController(createLobby(), {
      ...hooks,
      // Só o teste ponta a ponta define DOBBLE_SPEED (wrangler dev --var DOBBLE_SPEED:8).
      speed: Number(env.DOBBLE_SPEED) || 1,
    });
  }

  protected emojis() {
    return REACTION_EMOJIS;
  }

  protected stateMessage(state: DobbleState) {
    const clock = (this.controller as DobbleController).clock();
    return JSON.stringify({ type: "state", state: toView(state), now: clock } satisfies DobbleServerMessage);
  }

  protected isLobby(state: DobbleState) {
    return state.phase === "lobby";
  }

  protected isGameOver(state: DobbleState) {
    return state.phase === "game_over";
  }

  protected findPlayer(state: DobbleState, id: string) {
    return state.players.find((p) => p.id === id);
  }

  protected markHumansDisconnected(state: DobbleState): DobbleState {
    return { ...state, players: state.players.map((p) => (p.bot ? p : { ...p, connected: false })) };
  }

  protected historyPrefix() {
    return "DOBBLE:";
  }

  protected historyRow(state: DobbleState) {
    if (!state.standings || !state.winnerId) return null;
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      winner_name: winner?.name ?? state.standings[0].name,
      // Torre: cartas na pilha (mais é melhor). Poço: cartas que faltavam jogar (menos é melhor).
      players_summary: state.standings.map((s) => ({ name: s.name, score: s.cards, mode: state.mode })),
    };
  }
}

