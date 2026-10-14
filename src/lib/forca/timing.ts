// Tempos (ms) da Forca. O controlador (room server) e a UI usam os mesmos números.

import type { BotLevel } from "./engine";

export const TIMING = {
  /** Tempo pra cada jogada; estourou, o servidor chuta uma letra por quem não jogou. */
  TURN_MS: 25_000,
  /** Pausa antes de um bot chutar (min–max). */
  BOT_THINK_MIN_MS: 900,
  BOT_THINK_MAX_MS: 2100,
  /** Quem caiu da conexão: o servidor joga por essa pessoa depois desse tempo. */
  DISCONNECTED_MS: 2500,
  /** A palavra da rodada fica na tela (com quem acertou/errou) antes da próxima. */
  ROUND_END_MS: 4500,
  /** Primeira palavra: tempo de ver o tabuleiro antes de a vez começar a contar. */
  INTRO_MS: 1200,
  /** Animação de uma letra entrando (o jogo só segue sozinho depois). */
  LETTER_SETTLE_MS: 500,
} as const;

/** Chance de o bot ignorar a lista de palavras e chutar pela frequência das letras. */
export const BOT_SLOPPY: Record<BotLevel, number> = { easy: 0.5, medium: 0.12, hard: 0 };
