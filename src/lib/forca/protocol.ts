// Mensagens trocadas com o room server da Forca (party/forca.ts). Nenhuma carrega
// "quem sou eu": o servidor usa a identidade verificada da conexão. O estado que
// volta nunca tem a palavra secreta (só o que já foi revelado).

import type { BotLevel, ForcaView } from "./engine";

export type ForcaClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "add_bot"; level: BotLevel }
  | { type: "remove_bot"; botId: string }
  | { type: "set_bot_level"; botId: string; level: BotLevel }
  | { type: "set_rounds"; rounds: number }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "start" }
  /** Chuta uma letra (na sua vez). */
  | { type: "guess"; letter: string }
  /** Chuta a palavra inteira (na sua vez): errar custa 2 vidas. */
  | { type: "guess_word"; word: string }
  | { type: "rematch" }
  | { type: "emoji"; emoji: string };

export type ForcaServerMessage =
  /** \`now\` é o relógio do servidor: a UI calcula o tempo da vez sem depender do relógio do aparelho. */
  | { type: "state"; state: ForcaView; now: number }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  | { type: "error"; error: string };

export const FORCA_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia.",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_host: "Só o host pode fazer isso.",
  not_enough_players: "Precisa de pelo menos 2 jogadores.",
  not_your_turn: "Calma, ainda não é a sua vez.",
  bad_letter: "Chute uma letra de A a Z.",
  already_guessed: "Essa letra já foi chutada.",
  bad_word: "Digite a palavra inteira (só letras).",
  bad_rounds: "Escolha 3, 5 ou 8 palavras.",
};
