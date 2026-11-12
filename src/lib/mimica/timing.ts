// Tempos (ms) da Mímica. O controlador (room server) e a UI usam os mesmos números.

export const TIMING = {
  /** Tempo pra quem faz a mímica escolher a música da carta; estourou, o servidor escolhe uma. */
  PICK_MS: 25_000,
  /** Tempo da mímica; estourou, ninguém ganha. */
  MIME_MS: 90_000,
  /** Passada essa fração da mímica, as casinhas mostram a primeira letra de cada palavra. */
  HINT_AT: 0.5,
  /** Quem caiu da conexão: o servidor pula a vez dessa pessoa depois desse tempo. */
  DISCONNECTED_MS: 2500,
  /** A música (e quem acertou) fica na tela antes da próxima mímica. */
  TURN_END_MS: 5500,
  /** Intervalo mínimo entre dois chutes da mesma pessoa (impede chutar a lista inteira de títulos). */
  GUESS_COOLDOWN_MS: 700,
} as const;
