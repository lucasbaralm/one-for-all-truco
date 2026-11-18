import { describe, expect, it } from "vitest";
import type { Standing } from "./engine";
import { myChips, resultLabel, standingLine } from "./summary";

const s: Standing = {
  playerId: "a",
  name: "Ana",
  netWorth: 2350,
  cash: 800,
  props: 12,
  buildings: 3,
  bankrupt: false,
  rentIn: 1200,
  rentOut: 450,
  bought: 12,
  built: 3,
  jailed: 2,
  trades: 1,
  doubles: 4,
};

describe("resultLabel", () => {
  it("quem ganhou e quem sobrou mostram o patrimônio, na moeda da edição; quem faliu, 'faliu'", () => {
    expect(resultLabel(s, 0, "monopoly")).toBe("patrimônio $2.350");
    expect(resultLabel({ ...s, netWorth: 410 }, 2, "monopoly")).toBe("patrimônio $410");
    expect(resultLabel(s, 0, "banco")).toBe("patrimônio R$ 2.350");
    expect(resultLabel({ ...s, bankrupt: true, netWorth: 0 }, 3, "monopoly")).toBe("faliu");
  });
});

describe("standingLine", () => {
  it("propriedades, construções e aluguel recebido", () => {
    expect(standingLine(s, "monopoly")).toBe("12 propriedades · 3 construções · aluguel recebido $1.200");
    expect(standingLine(s, "banco")).toBe("12 propriedades · 3 construções · aluguel recebido R$ 1.200");
  });

  it("singular e só o que aconteceu", () => {
    expect(standingLine({ ...s, props: 1, buildings: 1, rentIn: 5 }, "monopoly")).toBe("1 propriedade · 1 construção · aluguel recebido $5");
    expect(standingLine({ ...s, buildings: 0, rentIn: 0 }, "monopoly")).toBe("12 propriedades");
    expect(standingLine({ ...s, props: 0, buildings: 0, rentIn: 0 }, "monopoly")).toBe("0 propriedades");
  });

  it("partida salva antes das estatísticas existirem não mostra 'undefined'", () => {
    const old = { playerId: "a", name: "Ana", netWorth: 0, cash: 0, props: 2, buildings: 0, bankrupt: false } as unknown as Standing;
    expect(standingLine(old, "monopoly")).toBe("2 propriedades");
    expect(myChips(old, "monopoly")).toEqual(["🏠 2 propriedades"]);
  });
});

describe("myChips", () => {
  it("resumo do próprio desempenho", () => {
    expect(myChips(s, "monopoly")).toEqual([
      "🏠 12 propriedades",
      "🏗️ 3 construções",
      "💰 aluguel recebido $1.200",
      "💸 aluguel pago $450",
      "🎲 4 duplas",
      "🚔 preso 2 vezes",
      "🤝 1 troca",
    ]);
    expect(myChips({ ...s, props: 1, buildings: 0, rentIn: 0, rentOut: 0, doubles: 1, jailed: 1, trades: 0 }, "banco")).toEqual(["🏠 1 propriedade", "🎲 1 dupla", "🚔 preso 1 vez"]);
  });

  it("quem só assistia não tem fichinhas", () => {
    expect(myChips(undefined, "monopoly")).toEqual([]);
  });
});
