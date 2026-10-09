import { describe, expect, it } from "vitest";
import {
  ALL_CARDS,
  DECK_SIZE,
  ORDER,
  SYMBOLS,
  SYMBOLS_PER_CARD,
  SYMBOL_COUNT,
  commonSymbol,
  newDeck,
  shuffle,
} from "./cards";

describe("baralho (plano projetivo de ordem 7)", () => {
  it("57 cartas de 8 símbolos distintos, ids dentro da faixa", () => {
    expect(ALL_CARDS).toHaveLength(57);
    for (const card of ALL_CARDS) {
      expect(card).toHaveLength(SYMBOLS_PER_CARD);
      expect(new Set(card).size).toBe(SYMBOLS_PER_CARD);
      for (const s of card) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(SYMBOL_COUNT);
      }
    }
  });

  it("QUALQUER par de cartas tem exatamente um símbolo em comum", () => {
    for (let a = 0; a < ALL_CARDS.length; a++) {
      for (let b = a + 1; b < ALL_CARDS.length; b++) {
        const setB = new Set(ALL_CARDS[b]);
        const common = ALL_CARDS[a].filter((s) => setB.has(s));
        expect(common.length, `cartas ${a} e ${b}`).toBe(1);
      }
    }
  });

  it("cada um dos 57 símbolos aparece em exatamente 8 cartas", () => {
    const count = new Array(SYMBOL_COUNT).fill(0);
    for (const card of ALL_CARDS) for (const s of card) count[s]++;
    expect(count.every((c) => c === ORDER + 1)).toBe(true);
  });

  it("há um emoji distinto pra cada símbolo", () => {
    expect(SYMBOLS).toHaveLength(SYMBOL_COUNT);
    expect(new Set(SYMBOLS).size).toBe(SYMBOL_COUNT);
  });

  it("commonSymbol devolve o símbolo que as duas cartas têm", () => {
    for (let a = 0; a < 20; a++) {
      for (let b = a + 1; b < 20; b++) {
        const s = commonSymbol(a, b);
        expect(ALL_CARDS[a]).toContain(s);
        expect(ALL_CARDS[b]).toContain(s);
      }
    }
  });
});

describe("baralho de jogo", () => {
  it("55 cartas únicas, embaralhadas", () => {
    const deck = newDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck).size).toBe(DECK_SIZE);
    expect(newDeck().join()).not.toBe(newDeck().join());
  });

  it("shuffle mantém os elementos e respeita o rng injetado", () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect([...shuffle(items, () => 0.3)].sort()).toEqual(items);
    expect(shuffle(items, () => 0.3)).toEqual(shuffle(items, () => 0.3));
  });
});
