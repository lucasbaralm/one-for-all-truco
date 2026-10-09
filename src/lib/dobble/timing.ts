// Tempos (ms) do Dobble. O controlador (room server) e a UI compartilham estes
// números pra animação e servidor andarem juntos.

import type { BotLevel } from "./engine";

export const TIMING = {
  /** "3, 2, 1" antes da primeira rodada (as cartas ainda viradas pra baixo). */
  COUNTDOWN_MS: 3300,
  /** A rodada ganha fica parada na mesa (símbolo destacado) antes de avançar. */
  ROUND_END_MS: 1900,
} as const;

/** Quanto um bot demora pra "achar" o símbolo (min–max, sorteado a cada rodada). */
export const BOT_REACTION_MS: Record<BotLevel, [number, number]> = {
  easy: [4200, 7500],
  medium: [2600, 4800],
  hard: [1500, 3000],
};

/** Chance de o bot clicar num símbolo errado antes de acertar (e levar o castigo). */
export const BOT_MISS_RATE: Record<BotLevel, number> = {
  easy: 0.18,
  medium: 0.07,
  hard: 0,
};
