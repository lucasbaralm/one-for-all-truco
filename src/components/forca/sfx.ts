// Efeitos sonoros da Forca (primitivas em src/lib/audio.ts — o mesmo liga/desliga dos outros jogos).

import { isSoundEnabled, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** Letra que existe na palavra. */
  hit() {
    tone(660, 0, 0.1, "triangle", 0.07);
    tone(880, 0.07, 0.14, "triangle", 0.07);
  },
  /** Letra que não existe: a mesa perde uma vida. */
  miss() {
    tone(240, 0, 0.24, "sawtooth", 0.06, 140);
  },
  /** Chute da palavra inteira, errado. */
  wordFail() {
    tone(260, 0, 0.14, "sawtooth", 0.06, 180);
    tone(180, 0.16, 0.26, "sawtooth", 0.06, 100);
  },
  /** Palavra completada. */
  solved() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2, "triangle", 0.09));
  },
  /** A forca fechou. */
  lost() {
    [330, 262, 196, 131].forEach((f, i) => tone(f, i * 0.14, 0.3, "sine", 0.08));
  },
  /** Últimos segundos da minha vez. */
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
