// Mensagens trocadas com o room server do Monopoly / Banco Imobiliário (party/monopoly.ts). Nenhuma
// carrega "quem sou eu": o servidor usa a identidade verificada da conexão. O estado que volta é a
// visão de cada jogador (toView: as MINHAS ações possíveis), sem a ordem das cartas.

import type { BotLevel, Bundle, MonoView } from "./engine";

export type MonoClientMessage =
  | { type: "join"; name: string; avatarUrl?: string | null }
  | { type: "add_bot"; level: BotLevel }
  | { type: "remove_bot"; botId: string }
  | { type: "set_bot_level"; botId: string; level: BotLevel }
  | { type: "kick"; playerId: string }
  | { type: "leave" }
  /** Duração da partida em rodadas (0 = até a falência). Só o host, só no lobby. */
  | { type: "set_limit"; limit: number }
  | { type: "start" }
  | { type: "roll" }
  | { type: "pay_bail" }
  | { type: "use_card" }
  | { type: "buy" }
  | { type: "decline" }
  | { type: "end_turn" }
  | { type: "bid"; amount: number }
  | { type: "pass_bid" }
  | { type: "build"; sq: number }
  | { type: "sell"; sq: number }
  | { type: "mortgage"; sq: number }
  | { type: "unmortgage"; sq: number }
  | { type: "propose_trade"; to: string; give?: Partial<Bundle>; take?: Partial<Bundle> }
  | { type: "accept_trade" }
  | { type: "decline_trade" }
  | { type: "cancel_trade" }
  | { type: "pay_debt" }
  | { type: "bankrupt" }
  /** Desistir da partida (perde tudo pro banco). */
  | { type: "resign" }
  | { type: "rematch" }
  | { type: "emoji"; emoji: string };

export type MonoServerMessage =
  | { type: "state"; state: MonoView }
  | { type: "emoji"; emoji: string; fromPlayerId: string }
  | { type: "error"; error: string };

export const MONO_ERROR_LABEL: Record<string, string> = {
  room_full: "A sala está cheia.",
  game_in_progress: "A partida já começou — você está assistindo.",
  not_host: "Só o host pode fazer isso.",
  not_in_lobby: "Isso só vale antes de a partida começar.",
  not_enough_players: "Precisa de pelo menos 2 jogadores.",
  not_a_bot: "Essa pessoa não é um bot.",
  not_in_room: "Essa pessoa não está na sala.",
  bad_limit: "Duração inválida.",
  bad_level: "Nível de bot inválido.",
  not_playing: "A partida não está rolando.",
  not_your_turn: "Calma, ainda não é a sua vez.",
  wrong_step: "Você não pode fazer isso agora.",
  trade_pending: "Tem uma proposta de troca esperando resposta.",
  not_in_jail: "Você não está na prisão.",
  no_jail_card: "Você não tem carta de saída da prisão.",
  not_enough_cash: "Dinheiro insuficiente.",
  not_for_sale: "Essa casa não está à venda.",
  no_auction: "Não tem leilão rolando.",
  bid_too_low: "O lance precisa ser maior que o atual.",
  bad_square: "Casa inválida.",
  not_yours: "Essa propriedade não é sua.",
  need_group: "Você precisa ter todas as ruas da cor pra construir.",
  mortgaged_in_group: "Tem rua hipotecada nesse grupo de cor.",
  max_built: "Essa rua já tem hotel.",
  build_evenly: "Construa parelho: primeiro nas outras ruas da cor.",
  sell_evenly: "Venda parelho: comece pela rua mais construída.",
  no_supply: "O banco não tem mais casas (ou hotéis) pra isso.",
  nothing_to_sell: "Essa rua não tem construções.",
  already_mortgaged: "Já está hipotecada.",
  not_mortgaged: "Essa propriedade não está hipotecada.",
  sell_buildings_first: "Venda as construções do grupo antes.",
  bad_trade: "Proposta de troca inválida.",
  empty_trade: "A proposta está vazia.",
  no_trade: "Não tem proposta de troca.",
  not_in_game: "Essa pessoa não está na partida.",
  not_game_over: "A partida ainda não acabou.",
};
