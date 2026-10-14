// Mensagens trocadas com o room server do Uno (party/uno.ts). Nenhuma carrega
// "quem sou eu": o servidor usa a identidade verificada da conexão. E o estado
// que volta é a visão de cada jogador (a própria mão; a dos outros nunca sai do servidor).

import type { UnoColor } from "./cards";
import type { BotLevel, UnoView } from "./engine";

export type UnoClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "add_bot"; level: BotLevel }
  | { type: "remove_bot"; botId: string }
  | { type: "set_bot_level"; botId: string; level: BotLevel }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  | { type: "start" }
  /** Joga uma carta da mão; Coringa leva a cor escolhida; \`uno\` grita UNO junto (vale quando sobra 1 carta). */
  | { type: "play"; card: number; color?: UnoColor; uno?: boolean }
  | { type: "draw" }
  /** Comprou uma carta jogável e prefere não jogar. */
  | { type: "pass" }
  | { type: "uno" }
  /** Pega quem ficou com 1 carta sem gritar UNO. */
  | { type: "catch" }
  | { type: "rematch" }
  | { type: "emoji"; emoji: string };

export type UnoServerMessage =
  | { type: "state"; state: UnoView }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  | { type: "error"; error: string };

export const UNO_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia.",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_host: "Só o host pode fazer isso.",
  not_enough_players: "Precisa de pelo menos 2 jogadores.",
  not_your_turn: "Calma, ainda não é a sua vez.",
  illegal_card: "Essa carta não combina com a do centro.",
  wild4_blocked: "O Coringa +4 só vale se você não tiver carta da cor atual.",
  must_play_drawn: "Você comprou uma carta: jogue ela ou passe a vez.",
  need_color: "Escolha uma cor pro Coringa.",
  already_drew: "Você já comprou nesta vez.",
  must_draw: "Compre uma carta antes de passar.",
  cannot_uno: "Ainda não dá pra gritar UNO.",
  nobody_to_catch: "Ninguém esqueceu o UNO agora.",
};
