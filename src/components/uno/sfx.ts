// Efeitos sonoros do Uno (primitivas em src/lib/audio.ts — o mesmo liga/desliga dos outros jogos).

import { isSoundEnabled, noiseBurst, setSoundEnabled, tone, unlockAudio } from "@/lib/audio";

export const sfx = {
  isEnabled: isSoundEnabled,
  setEnabled: setSoundEnabled,
  unlock: unlockAudio,
  /** Carta batendo na pilha. */
  play() {
    noiseBurst(0, 0.05, 0.06, 2400);
    tone(240, 0, 0.07, "triangle", 0.07, 160);
  },
  /** Carta saindo do monte. */
  draw() {
    noiseBurst(0, 0.07, 0.04, 1800);
    tone(420, 0, 0.06, "sine", 0.04, 520);
  },
  skip() {
    tone(300, 0, 0.12, "square", 0.05, 160);
  },
  reverse() {
    tone(500, 0, 0.1, "triangle", 0.06, 800);
    tone(800, 0.1, 0.1, "triangle", 0.06, 500);
  },
  wild() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.06, 0.12, "triangle", 0.07));
  },
  uno() {
    tone(660, 0, 0.1, "square", 0.07);
    tone(880, 0.1, 0.22, "square", 0.07);
  },
  /** Pegou alguém sem UNO. */
  catch() {
    tone(900, 0, 0.1, "sawtooth", 0.07, 400);
    tone(900, 0.14, 0.1, "sawtooth", 0.07, 400);
  },
  penalty() {
    tone(200, 0, 0.25, "sawtooth", 0.06, 110);
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
