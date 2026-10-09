// Efeitos sonoros do Dobble (primitivas em src/lib/audio.ts).

import { isSoundEnabled, noiseBurst, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** "3, 2, 1": cada número um tique. */
  tick() {
    tone(660, 0, 0.09, "square", 0.05);
  },
  go() {
    tone(880, 0, 0.1, "square", 0.06);
    tone(1320, 0.09, 0.25, "square", 0.06);
  },
  /** Carta nova chegando na mesa. */
  deal() {
    noiseBurst(0, 0.08, 0.05, 2500);
    tone(500, 0, 0.1, "triangle", 0.05, 800);
  },
  /** Alguém achou o símbolo. */
  found(mine: boolean) {
    if (mine) {
      [784, 988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.2, "triangle", 0.1));
    } else {
      tone(520, 0, 0.12, "sine", 0.07);
      tone(390, 0.1, 0.18, "sine", 0.06);
    }
  },
  /** Errei o símbolo. */
  wrong() {
    tone(200, 0, 0.28, "sawtooth", 0.09, 110);
  },
  /** Clique num símbolo (antes da resposta do servidor). */
  pop() {
    tone(620, 0, 0.05, "sine", 0.05);
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
