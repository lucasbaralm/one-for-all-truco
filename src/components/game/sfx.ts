// Efeitos sonoros da Fodinha (primitivas em src/lib/audio.ts — o mesmo liga/desliga
// do Ludo e do Dobble, guardado uma vez só pro site inteiro).

import { isSoundEnabled, noiseBurst, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** Carta batendo na mesa. */
  card() {
    noiseBurst(0, 0.05, 0.06, 2500);
    tone(220, 0, 0.07, "triangle", 0.06, 150);
  },
  /** Cartas sendo distribuídas. */
  deal() {
    for (let i = 0; i < 5; i++) noiseBurst(i * 0.07, 0.04, 0.05, 2200 + i * 150);
  },
  bet() {
    tone(520, 0, 0.07, "sine", 0.07);
  },
  /** Vaza levada por outro jogador. */
  trick() {
    tone(330, 0, 0.1, "triangle", 0.06);
  },
  /** Vaza levada por mim. */
  trickMine() {
    tone(523, 0, 0.1, "triangle", 0.09);
    tone(784, 0.09, 0.16, "triangle", 0.09);
  },
  /** Acertei a aposta da rodada. */
  hit() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.18, "sine", 0.09));
  },
  /** Errei a aposta da rodada. */
  miss() {
    [330, 262].forEach((f, i) => tone(f, i * 0.12, 0.24, "sawtooth", 0.05));
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
