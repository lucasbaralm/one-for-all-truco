import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { UnoColor } from "./cards";
import { bestColor, chooseBotAction } from "./bot";
import { legalCards } from "./engine";
import { find, game } from "./testKit";

const R5 = find("red", "number", 5);
const R9 = find("red", "number", 9);
const R1 = find("red", "number", 1);
const R2 = find("red", "number", 2);
const R7 = find("red", "number", 7);
const B7 = find("blue", "number", 7);
const B3 = find("blue", "number", 3);
const G3 = find("green", "number", 3);
const Y4 = find("yellow", "number", 4);
const D2_R = find("red", "draw2");
const SKIP_R = find("red", "skip");
const WILD = find(null, "wild");
const W4 = find(null, "wild4");

describe("bestColor", () => {
  it("a cor em que a mão tem mais cartas (coringas não contam)", () => {
    expect(bestColor([R9, R2, B7, WILD], mulberry32(1))).toBe("red");
    expect(bestColor([B7, B3, R9, W4], mulberry32(1))).toBe("blue");
  });

  it("mão sem carta colorida: sorteia uma cor válida", () => {
    const colors = new Set<UnoColor>();
    for (let seed = 1; seed < 80; seed++) colors.add(bestColor([WILD], mulberry32(seed)));
    expect(colors.size).toBeGreaterThan(1);
    expect(bestColor([], mulberry32(5))).toMatch(/red|yellow|green|blue/);
  });
});

describe("chooseBotAction", () => {
  it("sem carta jogável compra; fora da vez não faz nada", () => {
    const s = game({ hands: { a: [B7, G3], b: [R1] }, top: R5 });
    for (const level of ["easy", "medium", "hard"] as const) expect(chooseBotAction(s, "a", level, mulberry32(1))).toEqual({ type: "draw" });
    expect(chooseBotAction(s, "b", "hard", mulberry32(1))).toEqual({ type: "pass" });
  });

  it("nenhum nível joga carta ilegal (em 300 situações)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = mulberry32(seed);
      const s = game({ hands: { a: [R9, B7, W4, G3, WILD, SKIP_R, Y4], b: [R1] }, top: R5 });
      for (const level of ["easy", "medium", "hard"] as const) {
        const a = chooseBotAction(s, "a", level, rng);
        expect(a.type).toBe("play");
        if (a.type === "play") {
          expect(legalCards(s, "a")).toContain(a.card);
          // Coringa sempre leva cor; carta comum, nunca
          expect(a.color !== undefined).toBe([W4, WILD].includes(a.card));
        }
      }
    }
  });

  it("não joga o Coringa +4 quando tem carta da cor atual (a regra vale pros bots também)", () => {
    const s = game({ hands: { a: [W4, R9], b: [R1] }, top: R5 });
    for (let seed = 1; seed <= 50; seed++) {
      const a = chooseBotAction(s, "a", "hard", mulberry32(seed));
      expect(a).toMatchObject({ type: "play", card: R9 });
    }
  });

  it("médio e difícil guardam o Coringa quando têm outra jogada", () => {
    const s = game({ hands: { a: [WILD, R9, R2, B7], b: [R1] }, top: R5 });
    for (let seed = 1; seed <= 40; seed++) {
      for (const level of ["medium", "hard"] as const) {
        const a = chooseBotAction(s, "a", level, mulberry32(seed));
        expect(a.type === "play" && a.card !== WILD).toBe(true);
      }
    }
  });

  it("com mais de uma opção joga uma das válidas (azul 7 pela cor ou verde 3 pelo número)", () => {
    const s = game({ hands: { a: [R9, R2, R7, B7, G3], b: [R1] }, top: B3, color: "blue" });
    const picked = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const a = chooseBotAction(s, "a", "medium", mulberry32(seed));
      expect(a).toMatchObject({ type: "play" });
      if (a.type === "play") picked.add(a.card);
    }
    expect([...picked].every((c) => [B7, G3].includes(c))).toBe(true);
  });

  it("no mesmo nível, esvaziar a cor em que tem MAIS cartas pesa mais: vermelho 9 antes do azul 7 solitário", () => {
    // topo vermelho 5: R9 (sobram 2 vermelhas) e R7 (idem) e B5 (mesmo número, sem cor repetida na mão)
    const s = game({ hands: { a: [R9, R2, R7, find("blue", "number", 5)], b: [R1] }, top: R5 });
    for (let seed = 1; seed <= 40; seed++) {
      const a = chooseBotAction(s, "a", "medium", mulberry32(seed));
      expect(a.type === "play" && a.card !== find("blue", "number", 5)).toBe(true);
    }
  });

  it("difícil ataca quando o próximo está quase ganhando (+2 em vez de uma carta comum)", () => {
    // a joga; b (o próximo) tem só 2 cartas
    const s = game({ hands: { a: [D2_R, R9, B7], b: [R1, G3], c: [Y4, B3, R2] }, top: R5 });
    for (let seed = 1; seed <= 30; seed++) {
      expect(chooseBotAction(s, "a", "hard", mulberry32(seed))).toMatchObject({ type: "play", card: D2_R });
    }
  });

  it("grita UNO junto com a jogada que deixa 1 carta: difícil sempre, fácil às vezes esquece", () => {
    const s = game({ hands: { a: [R9, B7], b: [R1] }, top: R5 });
    const rate = (level: "easy" | "medium" | "hard") => {
      let calls = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const a = chooseBotAction(s, "a", level, mulberry32(seed));
        if (a.type === "play" && a.uno) calls++;
      }
      return calls / 400;
    };
    expect(rate("hard")).toBe(1);
    expect(rate("medium")).toBeGreaterThan(0.75);
    expect(rate("medium")).toBeLessThan(1);
    expect(rate("easy")).toBeGreaterThan(0.4);
    expect(rate("easy")).toBeLessThan(0.85);
    // com mais de 2 cartas não há o que gritar
    const big = game({ hands: { a: [R9, B7, G3], b: [R1] }, top: R5 });
    expect(chooseBotAction(big, "a", "hard", mulberry32(1))).toMatchObject({ type: "play", uno: false });
  });

  it("comprou uma carta jogável: médio/difícil jogam; (fácil às vezes passa)", () => {
    const base = game({ hands: { a: [B7, G3, R9], b: [R1] }, top: R5 });
    const s = { ...base, pendingDrawn: R9 };
    expect(chooseBotAction(s, "a", "hard", mulberry32(1))).toMatchObject({ type: "play", card: R9 });
    expect(chooseBotAction(s, "a", "medium", mulberry32(1))).toMatchObject({ type: "play", card: R9 });
    const easy = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) easy.add(chooseBotAction(s, "a", "easy", mulberry32(seed)).type);
    expect([...easy].sort()).toEqual(["pass", "play"]);
  });
});
