import { describe, expect, it } from "vitest";
import { getEdition } from "./editions";
import { BOT_LEVEL_LABEL, cardText, limitLabel, money, squareLabel } from "./labels";

describe("money", () => {
  it("milhar com ponto, moeda da edição e '−' pro negativo — sem depender de toLocaleString", () => {
    expect(money("monopoly", 1500)).toBe("$1.500");
    expect(money("banco", 2500)).toBe("R$ 2.500");
    expect(money("monopoly", 0)).toBe("$0");
    expect(money("monopoly", 5)).toBe("$5");
    expect(money("monopoly", 999)).toBe("$999");
    expect(money("monopoly", 1000)).toBe("$1.000");
    expect(money("banco", 1234567)).toBe("R$ 1.234.567");
    expect(money("monopoly", -50)).toBe("−$50");
    expect(money("banco", -12500)).toBe("−R$ 12.500");
    // valor quebrado vira inteiro (o jogo só tem inteiros; a tela não mostra centavos)
    expect(money("monopoly", 99.6)).toBe("$100");
  });
});

describe("squareLabel / cardText", () => {
  it("nome da casa; casa de carta usa o nome do baralho (cada edição, o seu)", () => {
    expect(squareLabel("monopoly", 0)).toBe("Saída");
    expect(squareLabel("banco", 0)).toBe("Ponto de Partida");
    expect(squareLabel("monopoly", 6)).toBe("Oriental Avenue");
    expect(squareLabel("monopoly", 2)).toBe("Caixa Comunitária");
    expect(squareLabel("monopoly", 7)).toBe("Sorte");
    expect(squareLabel("banco", 2)).toBe("Sorte ou Revés");
    expect(squareLabel("monopoly", 4)).toBe("Imposto de Renda");
    expect(squareLabel("monopoly", 99)).toBe("?");
  });

  it("toda casa do tabuleiro tem nome nas duas edições", () => {
    for (const id of ["monopoly", "banco"] as const) for (let i = 0; i < 40; i++) expect(squareLabel(id, i).length, `${id} ${i}`).toBeGreaterThan(2);
  });

  it("o texto de uma carta", () => {
    expect(cardText("monopoly", "chance", 0)).toBe(getEdition("monopoly").decks.chance[0].text);
    expect(cardText("banco", "chance", 0)).toMatch(/campeão/);
    expect(cardText("monopoly", "chest", 999)).toBe("");
  });
});

describe("limitLabel / BOT_LEVEL_LABEL", () => {
  it("duração da partida", () => {
    expect(limitLabel(0)).toBe("Até a falência");
    expect(limitLabel(20)).toBe("20 rodadas");
    expect(limitLabel(1)).toBe("1 rodada");
  });

  it("nomes dos níveis", () => {
    expect(BOT_LEVEL_LABEL).toEqual({ easy: "Fácil", medium: "Médio", hard: "Difícil" });
  });
});
