// Tempos (ms) da Forca. O controlador (room server) e a UI usam os mesmos números.

export const TIMING = {
  /** Tempo pra cada chute; estourou, o servidor chuta uma letra comum por quem não jogou. */
  TURN_MS: 40_000,
  /** Tempo pro escolhedor digitar a palavra; estourou, a rodada é pulada. */
  CHOOSE_MS: 90_000,
  /** Quem caiu da conexão: o servidor pula a vez dessa pessoa (ou a escolha da rodada) depois desse tempo. */
  DISCONNECTED_MS: 2500,
  /** A palavra da rodada fica na tela (com quem acertou/errou) antes da próxima. */
  ROUND_END_MS: 4500,
  /** Animação de uma letra entrando (o jogo só segue sozinho depois). */
  LETTER_SETTLE_MS: 500,
} as const;
