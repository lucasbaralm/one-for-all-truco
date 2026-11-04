// Mensagens trocadas com o room server da Mímica (party/mimica.ts). Nenhuma carrega
// "quem sou eu": o servidor usa a identidade verificada da conexão. O estado que
// volta é por pessoa (MimicaView): a carta e a música só vão pra quem faz a mímica.

import type { CallSignal, RtcMessage } from "@/lib/call/signaling";
import type { MimicaView } from "./engine";

export type MimicaClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "set_rounds"; rounds: number }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "start" }
  /** Quem faz a mímica escolhe uma música da carta (o id). */
  | { type: "pick"; songId: number }
  /** Chuta o título (quem não faz a mímica). */
  | { type: "guess"; text: string }
  /** Quem faz a mímica aceita um chute que o servidor recusou (o número do chute). */
  | { type: "accept"; guess: number }
  /** Quem faz a mímica desiste: a música é revelada e ninguém pontua. */
  | { type: "give_up" }
  | { type: "rematch" }
  /** Sinalização da videochamada pra outra pessoa da mesa (o servidor só repassa). */
  | { type: "rtc"; to: string; signal: CallSignal }
  | { type: "emoji"; emoji: string };

export type MimicaServerMessage =
  /** `now` é o relógio do servidor: a UI calcula o tempo sem depender do relógio do aparelho. */
  | { type: "state"; state: MimicaView; now: number }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  /** Sinalização da videochamada vinda de outra pessoa da mesa. */
  | RtcMessage
  | { type: "error"; error: string };

export const MIMICA_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia (até 8 pessoas).",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_host: "Só o host pode fazer isso.",
  not_enough_players: "Precisa de pelo menos 2 pessoas.",
  not_picking: "Agora não dá pra escolher a música.",
  not_mimer: "Só quem está fazendo a mímica pode fazer isso.",
  bad_song: "Essa música não está na carta.",
  not_miming: "Agora não dá pra chutar.",
  mimer_cannot_guess: "Quem faz a mímica não chuta — é só mostrar!",
  bad_guess: "Digite o nome da música (até 60 caracteres).",
  too_fast: "Calma, um chute por vez.",
  already_guessed: "Você já chutou isso.",
  no_such_guess: "Esse chute não existe mais.",
  bad_rounds: "Escolha de 1 a 5 voltas.",
};
