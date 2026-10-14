import { describe, expect, it } from "vitest";
import type { Standing } from "./engine";
import { myChips, resultLabel, standingLine } from "./summary";

const s: Standing = { playerId: "a", name: "Ana", cards: 3, handPoints: 27, played: 12, drawn: 5, caught: 2, forgot: 1 };

describe("resultLabel", () => {
  it("quem ganhou zerou a mão; os outros mostram cartas e pontos que sobraram", () => {
    expect(resultLabel(s, 0)).toBe("zerou a mão");
    expect(resultLabel(s, 1)).toBe("3 cartas (27 pts)");
    expect(resultLabel({ ...s, cards: 1, handPoints: 5 }, 2)).toBe("1 carta (5 pts)");
  });
});

describe("standingLine", () => {
  it("só o que aconteceu", () => {
    expect(standingLine(s)).toBe("jogou 12 · comprou 5 · pegou 2 · esqueceu o UNO 1 vez");
    expect(standingLine({ ...s, caught: 0, forgot: 0 })).toBe("jogou 12 · comprou 5");
    expect(standingLine({ ...s, forgot: 2, caught: 0 })).toBe("jogou 12 · comprou 5 · esqueceu o UNO 2 vezes");
  });

  it("partida salva antes das estatísticas existirem não mostra 'undefined'", () => {
    const old = { playerId: "a", name: "Ana", cards: 0, handPoints: 0 } as unknown as Standing;
    expect(standingLine(old)).toBe("jogou 0 · comprou 0");
  });
});

describe("myChips", () => {
  it("resumo do próprio desempenho", () => {
    expect(myChips(s)).toEqual(["🃏 12 cartas jogadas", "📥 5 cartas compradas", "🚨 pegou 2 jogadores sem UNO", "😳 esqueceu o UNO 1 vez"]);
    expect(myChips({ ...s, played: 1, drawn: 1, caught: 0, forgot: 0 })).toEqual(["🃏 1 carta jogada", "📥 1 carta comprada"]);
  });

  it("quem só assistia não tem fichinhas", () => {
    expect(myChips(undefined)).toEqual([]);
  });
});
