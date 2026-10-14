import { describe, expect, it } from "vitest";
import type { Standing } from "./engine";
import { myChips, standingLine } from "./summary";

const base: Standing = { playerId: "a", name: "Ana", color: "red", finished: 4, progress: 224, rolls: 30, sixes: 5, captures: 2, captured: 1 };

describe("standingLine", () => {
  it("só o que aconteceu, no singular/plural certo", () => {
    expect(standingLine(base)).toBe("💥 2 capturas · 😵 1 peça perdida");
    expect(standingLine({ ...base, captures: 1, captured: 3 })).toBe("💥 1 captura · 😵 3 peças perdidas");
    expect(standingLine({ ...base, captures: 0, captured: 0 })).toBe("");
  });

  it("partida salva antes das estatísticas existirem não mostra 'undefined'", () => {
    const old = { playerId: "a", name: "Ana", color: "red", finished: 4, progress: 224 } as unknown as Standing;
    expect(standingLine(old)).toBe("");
    expect(myChips(old)).toEqual([]);
  });
});

describe("myChips", () => {
  it("resumo do próprio desempenho", () => {
    expect(myChips(base)).toEqual(["🎲 30 rolagens", "6️⃣ 5 seis", "💥 2 capturas", "😵 1 peça perdida"]);
    expect(myChips({ ...base, rolls: 1, sixes: 1, captures: 0, captured: 0 })).toEqual(["🎲 1 rolagem", "6️⃣ 1 seis"]);
  });

  it("quem só assistia (sem standing) não tem fichinhas", () => {
    expect(myChips(undefined)).toEqual([]);
  });
});
