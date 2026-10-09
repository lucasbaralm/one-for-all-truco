// Mensagens trocadas com o room server do Dobble (party/dobble.ts). Nenhuma
// carrega "quem sou eu": o servidor usa a identidade verificada da conexão.

import type { BotLevel, DobbleMode, DobbleView } from "./engine";

export type DobbleClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "set_mode"; mode: DobbleMode }
  | { type: "add_bot"; level: BotLevel }
  | { type: "remove_bot"; botId: string }
  | { type: "set_bot_level"; botId: string; level: BotLevel }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "start" }
  /** `round` evita que um clique atrasado (da rodada anterior) valha na rodada nova. */
  | { type: "claim"; symbol: number; round: number }
  | { type: "rematch" }
  | { type: "emoji"; emoji: string };

export type DobbleServerMessage =
  /** `now` é o relógio do servidor: a UI calcula o castigo restante sem depender do relógio do aparelho. */
  | { type: "state"; state: DobbleView; now: number }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  | { type: "error"; error: string };

export const DOBBLE_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia.",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_host: "Só o host pode fazer isso.",
  not_enough_players: "Precisa de pelo menos 2 jogadores.",
  locked: "Calma! Você errou e está de castigo.",
};
