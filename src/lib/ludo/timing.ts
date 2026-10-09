// Tempos (ms) das animações do Ludo. Ficam aqui, num módulo só, porque o
// controlador (servidor/modo local) precisa esperar a animação do cliente
// terminar antes de agir de novo, e a UI usa os mesmos números pra animar.

import type { LastMove } from "./engine";

export const TIMING = {
  /** Dado girando até mostrar o resultado. */
  DICE_MS: 800,
  /** Cada casa andada (pulinho). */
  STEP_MS: 160,
  /** Peça saindo da base pra casa de saída. */
  EXIT_MS: 380,
  /** Peça capturada voltando pra base. */
  CAPTURE_MS: 750,
  /** Efeito de peça chegando em casa. */
  HOME_MS: 650,
  /** Tempo mostrando o dado quando não há jogada (ou 3 seis seguidos). */
  PASS_MS: 800,
  /** Pausa antes de um bot rolar/jogar (min–max, pra não parecer robótico). */
  BOT_THINK_MIN_MS: 300,
  BOT_THINK_MAX_MS: 650,
  /** Pausa antes de jogar sozinho quando só existe uma jogada possível. */
  AUTO_SINGLE_MS: 380,
  /** Jogador desconectado: o servidor joga por ele depois desse tempo. */
  DISCONNECTED_MS: 2500,
  /** Abertura da partida (tabuleiro entrando) antes de qualquer ação. */
  INTRO_MS: 1200,
} as const;

/** Quanto tempo a animação de uma jogada leva no cliente. */
export function moveAnimationMs(move: LastMove | null): number {
  if (!move) return 0;
  const walk = move.from === -1 ? TIMING.EXIT_MS : (move.to - move.from) * TIMING.STEP_MS;
  const capture = move.captures.length > 0 ? TIMING.CAPTURE_MS : 0;
  const home = move.finished ? TIMING.HOME_MS : 0;
  return walk + capture + home;
}
