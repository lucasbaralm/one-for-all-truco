import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { DECK, DECK_SIZE, UNO_COLORS, cardOf, cardPoints, compareCards, isWild, matches, shuffle } from "./cards";
import { cardName } from "./labels";

const find = (color: string | null, kind: string, value: number | null = null) =>
  DECK.find((c) => c.color === color && c.kind === kind && c.value === value)!;

describe("baralho", () => {
  it("108 cartas, cada uma com um id único igual à posição", () => {
    expect(DECK).toHaveLength(DECK_SIZE);
    expect(DECK.every((c, i) => c.id === i && cardOf(i) === c)).toBe(true);
  });

  it("por cor: um 0, dois de 1–9, dois Pular, dois Inverter, dois +2 (25 cartas)", () => {
    for (const color of UNO_COLORS) {
      const mine = DECK.filter((c) => c.color === color);
      expect(mine).toHaveLength(25);
      expect(mine.filter((c) => c.value === 0)).toHaveLength(1);
      for (let v = 1; v <= 9; v++) expect(mine.filter((c) => c.value === v), `${color} ${v}`).toHaveLength(2);
      for (const kind of ["skip", "reverse", "draw2"]) expect(mine.filter((c) => c.kind === kind)).toHaveLength(2);
    }
  });

  it("4 Coringas e 4 Coringas +4, sem cor", () => {
    expect(DECK.filter((c) => c.kind === "wild")).toHaveLength(4);
    expect(DECK.filter((c) => c.kind === "wild4")).toHaveLength(4);
    expect(DECK.filter(isWild).every((c) => c.color === null && c.value === null)).toBe(true);
  });
});

describe("matches", () => {
  const top = find("red", "number", 5);

  it("mesma cor, mesmo número ou coringa", () => {
    expect(matches(find("red", "number", 9), top, "red")).toBe(true); // cor
    expect(matches(find("blue", "number", 5), top, "red")).toBe(true); // número
    expect(matches(find(null, "wild"), top, "red")).toBe(true);
    expect(matches(find(null, "wild4"), top, "red")).toBe(true);
    expect(matches(find("blue", "number", 6), top, "red")).toBe(false);
  });

  it("símbolo igual combina em qualquer cor; símbolo em cima de número só pela cor", () => {
    const skipRed = find("red", "skip");
    expect(matches(find("green", "skip"), skipRed, "red")).toBe(true);
    expect(matches(find("green", "reverse"), skipRed, "red")).toBe(false);
    expect(matches(find("red", "reverse"), top, "red")).toBe(true); // cor
    expect(matches(find("green", "draw2"), top, "red")).toBe(false);
  });

  it("depois de um Coringa vale a COR ESCOLHIDA, não a do topo", () => {
    const wild = find(null, "wild");
    expect(matches(find("green", "number", 3), wild, "green")).toBe(true);
    expect(matches(find("red", "number", 3), wild, "green")).toBe(false);
    // número igual não vale em cima de coringa (o coringa não tem número)
    expect(matches(find("red", "number", 0), wild, "green")).toBe(false);
  });
});

describe("pontos e nomes", () => {
  it("número vale o número, símbolo 20, coringa 50", () => {
    expect(cardPoints(find("red", "number", 7))).toBe(7);
    expect(cardPoints(find("red", "number", 0))).toBe(0);
    for (const k of ["skip", "reverse", "draw2"]) expect(cardPoints(find("blue", k))).toBe(20);
    expect(cardPoints(find(null, "wild"))).toBe(50);
    expect(cardPoints(find(null, "wild4"))).toBe(50);
    expect(DECK.reduce((n, c) => n + cardPoints(c), 0)).toBe(4 * (2 * 45 + 6 * 20) + 8 * 50);
  });

  it("nome em português, com a cor escolhida no coringa", () => {
    expect(cardName(find("green", "number", 7))).toBe("verde 7");
    expect(cardName(find("blue", "skip"))).toBe("Pular azul");
    expect(cardName(find("red", "reverse"))).toBe("Inverter vermelho");
    expect(cardName(find("yellow", "draw2"))).toBe("+2 amarelo");
    expect(cardName(find(null, "wild"))).toBe("Coringa");
    expect(cardName(find(null, "wild4"), "blue")).toBe("Coringa +4 (azul)");
  });
});

describe("compareCards (ordem da mão)", () => {
  it("agrupa por cor, números antes dos símbolos, coringas no fim; é uma ordem total estável", () => {
    const hand = [
      find(null, "wild4"),
      find("blue", "draw2"),
      find("red", "number", 7),
      find("red", "skip"),
      find("red", "number", 2),
      find("green", "number", 0),
      find(null, "wild"),
    ].map((c) => c.id);
    const sorted = [...hand].sort(compareCards).map((id) => cardOf(id));
    expect(sorted.map((c) => c.color ?? "wild")).toEqual(["red", "red", "red", "green", "blue", "wild", "wild"]);
    const reds = sorted.filter((c) => c.color === "red");
    expect(reds.map((c) => (c.kind === "number" ? c.value : c.kind))).toEqual([2, 7, "skip"]);
    expect(sorted[sorted.length - 2].kind).toBe("wild");
    expect(sorted[sorted.length - 1].kind).toBe("wild4");
    // trocar a ordem de entrada não muda o resultado
    expect([...hand].reverse().sort(compareCards)).toEqual([...hand].sort(compareCards));
    // duas cópias da mesma carta não empatam
    const twins = DECK.filter((c) => c.color === "red" && c.value === 5).map((c) => c.id);
    expect(compareCards(twins[0], twins[1])).toBeLessThan(0);
  });
});

describe("shuffle", () => {
  it("é uma permutação, repetível com a mesma semente e não altera a entrada", () => {
    const ids = DECK.map((c) => c.id);
    const a = shuffle(ids, mulberry32(1));
    expect([...a].sort((x, y) => x - y)).toEqual(ids);
    expect(a).toEqual(shuffle(ids, mulberry32(1)));
    expect(a).not.toEqual(ids);
    expect(ids).toEqual(DECK.map((c) => c.id));
  });
});
