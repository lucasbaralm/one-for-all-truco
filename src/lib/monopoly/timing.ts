// Tempos (ms) do Monopoly / Banco Imobiliário. O controlador (room server) e a UI usam os mesmos
// números pra animação e servidor andarem juntos.

export const TIMING = {
  /** Pausa antes de um bot agir (min–max, pra não parecer robótico). */
  BOT_THINK_MIN_MS: 700,
  BOT_THINK_MAX_MS: 1400,
  /** Bot só olhando a própria vez de rolar (um pouco mais lento: dá tempo de ver o que aconteceu). */
  BOT_ROLL_MS: 900,
  /** Quem caiu da conexão: o servidor joga por essa pessoa depois desse tempo. */
  DISCONNECTED_MS: 2500,
  /** Animação dos dados rolando. */
  DICE_MS: 700,
  /** Tempo que a peça leva em cada casa andada. */
  STEP_MS: 140,
  /** Tempo pra ler uma carta (Sorte / Caixa Comunitária) antes de o jogo seguir. */
  CARD_MS: 1800,
  /** Início da partida. */
  INTRO_MS: 1200,
} as const;
