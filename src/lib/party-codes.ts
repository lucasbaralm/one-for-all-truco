// Códigos de fechamento da conexão com os room servers (além dos padrões do
// WebSocket) — compartilhados por todos os jogos que usam o PartyServer.

/** O servidor validou o token e recusou: login vencido/inválido, ou nome que não bate. */
export const UNAUTHORIZED_CLOSE_CODE = 4001;
/** O servidor não conseguiu falar com o Supabase pra validar o login (fora do ar / lento). */
export const AUTH_UNAVAILABLE_CLOSE_CODE = 4002;
/** O host expulsou o jogador. */
export const KICKED_CLOSE_CODE = 4003;

/** Reações (emoji) que os jogadores podem mandar pra mesa. */
export const REACTION_EMOJIS = ["😂", "😡", "😎", "🙏", "🎉", "😱", "👏", "🔥"];
