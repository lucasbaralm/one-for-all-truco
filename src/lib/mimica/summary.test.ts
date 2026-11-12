import { describe, expect, it } from "vitest";
import type { Standing } from "./engine";
import { myChips, resultLabel, standingLine } from "./summary";

const standing = (over: Partial<Standing> = {}): Standing => ({
  playerId: "a",
  name: "Ana",
  score: 0,
  guessed: 0,
  wrong: 0,
  mimed: 0,
  solvedMimes: 0,
  failedMimes: 0,
  ...over,
});

describe("resultLabel", () => {
  it("são os pontos", () => expect(resultLabel(standing({ score: 85 }))).toBe("85 pts"));
});

describe("standingLine", () => {
  it("conta acertos, erros e como foram as mímicas", () => {
    expect(standingLine(standing({ guessed: 3, wrong: 5, mimed: 2, solvedMimes: 1 }))).toBe("3 músicas acertadas · 5 chutes errados · 2 mímicas (a galera acertou 1)");
  });
  it("singular e zeros", () => {
    expect(standingLine(standing({ guessed: 1, wrong: 1, mimed: 1, solvedMimes: 0 }))).toBe("1 música acertada · 1 chute errado · 1 mímica (ninguém acertou)");
    expect(standingLine(standing())).toBe("0 músicas acertadas");
  });
});

describe("myChips", () => {
  it("sem classificação não tem fichinha", () => expect(myChips(undefined)).toEqual([]));
  it("mostra só o que aconteceu", () => {
    expect(myChips(standing({ score: 40, guessed: 2 }))).toEqual(["⭐ 40 pontos", "🎯 2 músicas acertadas"]);
    expect(myChips(standing({ score: 40, guessed: 1, wrong: 2, mimed: 3, solvedMimes: 2, failedMimes: 1 }))).toEqual([
      "⭐ 40 pontos",
      "🎯 1 música acertada",
      "🎭 3 mímicas",
      "👏 2 mímicas entendidas",
      "🤷 1 mímica que ninguém entendeu",
      "❌ 2 chutes errados",
    ]);
  });
});
