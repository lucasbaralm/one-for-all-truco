import { describe, expect, it } from "vitest";
import { manualClock, mulberry32 } from "./clock";

// Todos os testes dos controladores (Ludo, Dobble) dependem deste relógio e
// deste sorteio — então eles mesmos precisam estar certos.

describe("manualClock", () => {
  it("dispara os timers em ordem de vencimento, não de criação", () => {
    const clock = manualClock();
    const fired: string[] = [];
    clock.setTimer(() => fired.push("c"), 300);
    clock.setTimer(() => fired.push("a"), 100);
    clock.setTimer(() => fired.push("b"), 200);
    clock.advance(1000);
    expect(fired).toEqual(["a", "b", "c"]);
    expect(clock.now()).toBe(1000);
  });

  it("advance só dispara o que vence até ali; o resto fica pendente", () => {
    const clock = manualClock();
    const fired: number[] = [];
    clock.setTimer(() => fired.push(100), 100);
    clock.setTimer(() => fired.push(500), 500);
    clock.advance(499);
    expect(fired).toEqual([100]);
    expect(clock.pending()).toBe(1);
    clock.advance(1);
    expect(fired).toEqual([100, 500]);
    expect(clock.pending()).toBe(0);
  });

  it("clearTimer cancela; timers criados dentro de um timer rodam no mesmo avanço se vencerem", () => {
    const clock = manualClock();
    const fired: string[] = [];
    const cancelled = clock.setTimer(() => fired.push("cancelado"), 50);
    clock.clearTimer(cancelled);
    clock.setTimer(() => {
      fired.push("pai");
      clock.setTimer(() => fired.push("filho"), 100); // vence em 200, dentro dos 300
    }, 100);
    clock.advance(300);
    expect(fired).toEqual(["pai", "filho"]);
  });

  it("runAll roda tudo até esvaziar e avisa se estourou o limite (loop infinito)", () => {
    const clock = manualClock();
    let n = 0;
    clock.setTimer(function again() {
      n++;
      if (n < 5) clock.setTimer(again, 10);
    }, 10);
    expect(clock.runAll()).toBe(true);
    expect(n).toBe(5);
    expect(clock.now()).toBe(50);

    const forever = manualClock();
    forever.setTimer(function loop() {
      forever.setTimer(loop, 1);
    }, 1);
    expect(forever.runAll(100)).toBe(false);
  });
});

describe("mulberry32", () => {
  it("a mesma semente repete a sequência; sementes diferentes divergem; tudo em [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 50 }, () => a());
    expect(seqA).toEqual(Array.from({ length: 50 }, () => b()));
    expect(seqA).not.toEqual(Array.from({ length: 50 }, ((c) => () => c())(mulberry32(43))));
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("é bem distribuído (10 faixas, 10 mil sorteios)", () => {
    const rng = mulberry32(1);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) bins[Math.floor(rng() * 10)]++;
    for (const n of bins) {
      expect(n).toBeGreaterThan(850);
      expect(n).toBeLessThan(1150);
    }
  });
});
