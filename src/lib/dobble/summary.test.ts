import { describe, expect, it } from "vitest";
import type { Standing } from "./engine";
import { fmtSeconds, myChips, standingLine } from "./summary";

const base: Standing = { playerId: "a", name: "Ana", cards: 20, won: 12, wrong: 2, fastestMs: 812 };

describe("fmtSeconds", () => {
  it("segundos com uma casa e vírgula", () => {
    expect(fmtSeconds(812)).toBe("0,8 s");
    expect(fmtSeconds(1234)).toBe("1,2 s");
    expect(fmtSeconds(10000)).toBe("10,0 s");
    expect(fmtSeconds(0)).toBe("0,0 s");
  });
});

describe("standingLine", () => {
  it("só o que aconteceu", () => {
    expect(standingLine(base)).toBe("12 rodadas · ⚡ 0,8 s · 2 erros");
    expect(standingLine({ ...base, won: 1, wrong: 1 })).toBe("1 rodada · ⚡ 0,8 s · 1 erro");
    expect(standingLine({ ...base, won: 0, fastestMs: null, wrong: 0 })).toBe("");
  });

  it("partida salva antes das estatísticas existirem não mostra 'undefined'", () => {
    const old = { playerId: "a", name: "Ana", cards: 3 } as unknown as Standing;
    expect(standingLine(old)).toBe("");
    expect(myChips(old)).toEqual(["🏅 0 rodadas ganhas"]);
  });
});

describe("myChips", () => {
  it("resumo do próprio desempenho", () => {
    expect(myChips(base)).toEqual(["⚡ melhor tempo 0,8 s", "🏅 12 rodadas ganhas", "❌ 2 erros"]);
    expect(myChips({ ...base, won: 1, wrong: 0, fastestMs: null })).toEqual(["🏅 1 rodada ganha"]);
  });

  it("quem só assistia não tem fichinhas", () => {
    expect(myChips(undefined)).toEqual([]);
  });
});
