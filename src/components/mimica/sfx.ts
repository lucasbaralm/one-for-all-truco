// Efeitos sonoros da Mímica (primitivas em src/lib/audio.ts — o mesmo liga/desliga dos outros jogos).

import { isSoundEnabled, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** Alguém escolheu a música e a mímica começa. */
  picked() {
    tone(520, 0, 0.09, "triangle", 0.06);
    tone(780, 0.08, 0.12, "triangle", 0.06);
  },
  /** A dica da metade do tempo. */
  hint() {
    tone(880, 0, 0.08, "sine", 0.06);
    tone(1175, 0.09, 0.12, "sine", 0.06);
  },
  /** Chute errado. */
  wrong() {
    tone(240, 0, 0.2, "sawtooth", 0.05, 150);
  },
  /** Alguém acertou a música. */
  solved() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, "triangle", 0.09));
  },
  /** Ninguém acertou. */
  timeout() {
    [330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.3, "sine", 0.08));
  },
  /** Últimos segundos. */
  tick() {
    tone(1000, 0, 0.04, "square", 0.035);
  },
  yourTurn() {
    tone(740, 0, 0.1, "sine", 0.07);
    tone(988, 0.08, 0.14, "sine", 0.07);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.28, "triangle", 0.1));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.3, "sine", 0.08));
  },
  emoji() {
    tone(900, 0, 0.06, "sine", 0.05);
  },
};
