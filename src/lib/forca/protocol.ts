// Mensagens trocadas com o room server da Forca (party/forca.ts). Nenhuma carrega
// "quem sou eu": o servidor usa a identidade verificada da conexão. O estado que
// volta é por pessoa (ForcaView): a palavra só vai pra quem escolheu, até a rodada acabar.

import type { ForcaView } from "./engine";

export type ForcaClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "set_rounds"; rounds: number }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "start" }
  /** O escolhedor da rodada digita a palavra (ou frase). */
  | { type: "choose_word"; word: string }
  /** Chuta uma letra (na sua vez). */
  | { type: "guess"; letter: string }
  /** Chuta a palavra inteira (na sua vez): errar custa 2 partes do boneco. */
  | { type: "guess_word"; word: string }
  | { type: "rematch" }
  | { type: "emoji"; emoji: string };

export type ForcaServerMessage =
  /** `now` é o relógio do servidor: a UI calcula o tempo da vez sem depender do relógio do aparelho. */
  | { type: "state"; state: ForcaView; now: number }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  | { type: "error"; error: string };

export const FORCA_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia (até 4 pessoas).",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_host: "Só o host pode fazer isso.",
  not_enough_players: "Precisa de pelo menos 2 pessoas.",
  not_your_turn: "Calma, ainda não é a sua vez.",
  not_choosing: "Agora não dá pra escolher a palavra.",
  not_chooser: "Quem escolhe a palavra nesta rodada é outra pessoa.",
  bad_letter: "Chute uma letra de A a Z.",
  already_guessed: "Essa letra já foi chutada.",
  bad_word: "Use só letras e espaços (de 2 a 30 caracteres).",
  bad_rounds: "Escolha de 1 a 5 palavras.",
};
