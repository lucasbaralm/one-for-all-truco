// Formato das mensagens trocadas com o room server do Ludo (party/ludo.ts).
// Compartilhado entre cliente e servidor. Repare que NENHUMA mensagem carrega
// "quem sou eu": o servidor usa a identidade verificada da conexão, então
// ninguém consegue jogar pelo outro.

import type { BotLevel, LudoState } from "./engine";
import type { LudoColor } from "./board";

export type LudoClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "set_color"; color: LudoColor }
  | { type: "add_bot"; level: BotLevel; color?: LudoColor }
  | { type: "remove_bot"; botId: string }
  | { type: "set_bot_level"; botId: string; level: BotLevel }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "start" }
  | { type: "roll" }
  | { type: "move"; piece: number }
  | { type: "rematch" }
  | { type: "emoji"; emoji: string };

export type LudoServerMessage =
  | { type: "state"; state: LudoState }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  | { type: "error"; error: string };

import { REACTION_EMOJIS } from "../party-codes";

export const LUDO_EMOJIS = REACTION_EMOJIS;

// Códigos de fechamento da conexão: definidos em party-codes.ts (valem pra todos os jogos).
export { AUTH_UNAVAILABLE_CLOSE_CODE, KICKED_CLOSE_CODE, UNAUTHORIZED_CLOSE_CODE } from "../party-codes";

export const LUDO_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia.",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_your_turn: "Não é a sua vez.",
  not_host: "Só o host pode fazer isso.",
  not_enough_players: "Precisa de pelo menos 2 jogadores.",
  color_taken: "Essa cor já está ocupada.",
  illegal_move: "Essa jogada não é possível.",
};
