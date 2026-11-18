// Efeitos sonoros do Monopoly / Banco Imobiliário (primitivas em src/lib/audio.ts — o mesmo liga/desliga dos outros jogos).

import { isSoundEnabled, noiseBurst, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** Dados chacoalhando e caindo. */
  roll() {
    for (let i = 0; i < 6; i++) noiseBurst(i * 0.09, 0.05, 0.05, 1500 + i * 120);
    tone(180, 0.5, 0.08, "triangle", 0.07, 110);
  },
  /** Um passo da peça. */
  step() {
    tone(520, 0, 0.04, "triangle", 0.035, 420);
  },
  /** Dinheiro entrando. */
  cashIn() {
    tone(1046, 0, 0.07, "sine", 0.07);
    tone(1568, 0.07, 0.14, "sine", 0.07);
  },
  /** Dinheiro saindo (aluguel, imposto). */
  cashOut() {
    tone(392, 0, 0.1, "triangle", 0.07, 300);
    tone(262, 0.1, 0.16, "triangle", 0.07, 200);
  },
  buy() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.06, 0.12, "triangle", 0.07));
  },
  card() {
    noiseBurst(0, 0.06, 0.05, 2600);
    tone(660, 0.05, 0.1, "sine", 0.06);
    tone(880, 0.13, 0.14, "sine", 0.06);
  },
  jail() {
    tone(160, 0, 0.18, "square", 0.07, 90);
    tone(160, 0.22, 0.2, "square", 0.07, 80);
  },
  build() {
    noiseBurst(0, 0.05, 0.07, 700);
    tone(300, 0.04, 0.08, "square", 0.05, 360);
    tone(420, 0.14, 0.1, "square", 0.05, 480);
  },
  /** Marteladas: leilão. */
  bid() {
    tone(700, 0, 0.07, "sine", 0.07);
  },
  sold() {
    noiseBurst(0, 0.05, 0.09, 600);
    tone(220, 0, 0.12, "square", 0.08, 140);
  },
  trade() {
    [440, 587, 740].forEach((f, i) => tone(f, i * 0.07, 0.12, "triangle", 0.06));
  },
  bankrupt() {
    [330, 262, 196, 147].forEach((f, i) => tone(f, i * 0.14, 0.24, "sawtooth", 0.06, f * 0.8));
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
