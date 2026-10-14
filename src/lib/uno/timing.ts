// Tempos (ms) do Uno. O controlador (room server) e a UI usam os mesmos números
// pra animação e servidor andarem juntos.

import type { BotLevel } from "./engine";

export const TIMING = {
  /** Pausa antes de um bot jogar (min–max, pra não parecer robótico). */
  BOT_THINK_MIN_MS: 800,
  BOT_THINK_MAX_MS: 1500,
  /** Quem caiu da conexão: o servidor joga por essa pessoa depois desse tempo. */
  DISCONNECTED_MS: 2500,
  /** Tempo da animação de uma carta indo pra pilha (o jogo não segue antes). */
  PLAY_SETTLE_MS: 500,
  /** Tempo da animação de compra. */
  DRAW_SETTLE_MS: 350,
  /** Cartas distribuídas antes da primeira jogada. */
  INTRO_MS: 1600,
} as const;

/** Quanto um bot demora pra "pegar" quem esqueceu o UNO (min–max); fácil: nunca pega. */
export const BOT_CATCH_MS: Record<BotLevel, [number, number] | null> = {
  easy: null,
  medium: [2600, 4200],
  hard: [1500, 2600],
};

/** Chance de o bot esquecer de gritar UNO na jogada que o deixa com 1 carta. */
export const BOT_FORGET_UNO: Record<BotLevel, number> = { easy: 0.35, medium: 0.12, hard: 0 };
