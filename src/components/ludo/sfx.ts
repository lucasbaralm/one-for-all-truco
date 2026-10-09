// Efeitos sonoros do Ludo (primitivas em src/lib/audio.ts).

import { isSoundEnabled, noiseBurst, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** Dado sacudindo e caindo. */
  roll() {
    for (let i = 0; i < 7; i++) noiseBurst(i * 0.1, 0.05, 0.05 + (i % 2) * 0.02, 1500 + i * 150);
    tone(180, 0.7, 0.09, "triangle", 0.09, 120);
  },
  /** Resultado do dado — o 6 ganha um "ding" a mais. */
  rollResult(value: number) {
    if (value === 6) {
      tone(660, 0, 0.12, "triangle", 0.1);
      tone(880, 0.09, 0.2, "triangle", 0.1);
    }
  },
  /** Cada passo da peça sobe um pouquinho de tom. */
  step(index: number) {
    tone(300 + Math.min(index, 8) * 22, 0, 0.07, "triangle", 0.09, 240 + Math.min(index, 8) * 14);
  },
  exitBase() {
    tone(420, 0, 0.1, "square", 0.05);
    tone(620, 0.08, 0.16, "square", 0.05);
  },
  capture() {
    tone(520, 0, 0.32, "sawtooth", 0.1, 90);
    noiseBurst(0, 0.18, 0.07, 900);
  },
  home() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, "sine", 0.1));
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
