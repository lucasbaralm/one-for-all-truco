import { AUTH_UNAVAILABLE_CLOSE_CODE, KICKED_CLOSE_CODE, UNAUTHORIZED_CLOSE_CODE } from "../party-codes";

// As decisões do cliente de sala que não dependem de React (e por isso podem
// ser testadas direto): o que significa cada código de fechamento da conexão e
// quando uma sala acabou de nascer pra eu montar a partida "contra bots".

/**
 * connecting = ainda não abriu; open = conectado; reconnecting = caiu e está
 * tentando de novo; kicked = o host expulsou; unauthorized = o servidor não
 * aceitou a sessão (login vencido); auth_unavailable = o servidor de jogo não
 * conseguiu falar com o Supabase pra validar o login (segue tentando).
 */
export type RoomStatus = "connecting" | "open" | "reconnecting" | "kicked" | "unauthorized" | "auth_unavailable";

/** Estado da conexão depois que ela FECHOU com `code`, e se vale continuar tentando reconectar. */
export function statusAfterClose(code: number): { status: RoomStatus; stopRetrying: boolean } {
  // Expulso ou recusado no login: tentar de novo em loop não adianta nada.
  if (code === KICKED_CLOSE_CODE) return { status: "kicked", stopRetrying: true };
  if (code === UNAUTHORIZED_CLOSE_CODE) return { status: "unauthorized", stopRetrying: true };
  // Problema do lado do servidor (Supabase fora): ele segue tentando sozinho.
  if (code === AUTH_UNAVAILABLE_CLOSE_CODE) return { status: "auth_unavailable", stopRetrying: false };
  return { status: "reconnecting", stopRetrying: false };
}

/**
 * Estado depois que a conexão ABRIU. Se o servidor acabou de dizer que não
 * alcança o Supabase, a conexão abre e fecha de novo: o aviso fica até chegar
 * um estado de verdade (`open` por mensagem "state").
 */
export function statusAfterOpen(previous: RoomStatus): RoomStatus {
  return previous === "auth_unavailable" ? previous : "open";
}

/**
 * Sala recém-criada por mim: no lobby, nenhuma partida jogada ainda e só eu
 * sentado nela. É a hora de o dono montar a partida "contra bots" — uma vez só.
 * Depois de uma revanche (gameNumber > 0), num reload (a partida já está
 * rolando) ou com mais gente na sala, não se repete.
 */
export function isFreshRoomOf(room: { phase: string; gameNumber: number; players: { id: string }[] }, me: string): boolean {
  return room.phase === "lobby" && room.gameNumber === 0 && room.players.length === 1 && room.players[0].id === me;
}
