import { describe, expect, it } from "vitest";
import type { Standing } from "./engine";
import { myChips, resultLabel, standingLine } from "./summary";

const st = (p: Partial<Standing> = {}): Standing => ({ playerId: "a", name: "A", score: 0, hits: 0, misses: 0, solved: 0, wordFails: 0, ...p });

describe("resultLabel", () => {
  it("mostra os pontos", () => {
    expect(resultLabel(st({ score: 120 }))).toBe("120 pts");
  });
});

describe("standingLine", () => {
  it("sempre diz as letras certas; o resto só quando tem", () => {
    expect(standingLine(st())).toBe("0 letras certas");
    expect(standingLine(st({ hits: 1 }))).toBe("1 letra certa");
    expect(standingLine(st({ hits: 14, solved: 2, misses: 3, wordFails: 1 }))).toBe("2 palavras completadas · 14 letras certas · 3 erros · 1 chute de palavra errado");
    expect(standingLine(st({ hits: 2, solved: 1, misses: 1, wordFails: 2 }))).toBe("1 palavra completada · 2 letras certas · 1 erro · 2 chutes de palavra errados");
  });

  it("aguenta estatística faltando (partida salva por uma versão antiga)", () => {
    const old = { playerId: "a", name: "A", score: 10 } as Standing;
    expect(standingLine(old)).toBe("0 letras certas");
  });
});

describe("myChips", () => {
  it("fichinhas do meu desempenho, só com o que aconteceu", () => {
    expect(myChips(undefined)).toEqual([]);
    expect(myChips(st({ score: 50, hits: 5 }))).toEqual(["⭐ 50 pontos", "✅ 5 letras certas"]);
    expect(myChips(st({ score: 90, hits: 7, solved: 2, misses: 4 }))).toEqual(["⭐ 90 pontos", "🏅 2 palavras completadas", "✅ 7 letras certas", "❌ 4 erros"]);
  });
});
