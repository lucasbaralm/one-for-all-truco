import { afterEach, describe, expect, it, vi } from "vitest";
import { Card, Value, generateDeck, getCardStrength, getManilhaValue, getWinningCardIndex, shuffleDeck } from "./rules";
import { mulberry32 } from "../random";

// Propriedades das regras da Fodinha que valem pra QUALQUER vira/mão (os testes
// de rules.test.ts cobrem exemplos escolhidos; estes varrem tudo).

const ORDER: Value[] = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
const key = (c: Card) => `${c.suit}-${c.value}`;

afterEach(() => vi.restoreAllMocks());

describe("manilha", () => {
  it("é sempre o valor seguinte ao do vira, e depois do 3 volta pro 4", () => {
    for (let i = 0; i < ORDER.length; i++) {
      const vira: Card = { suit: "hearts", value: ORDER[i] };
      expect(getManilhaValue(vira)).toBe(ORDER[(i + 1) % ORDER.length]);
    }
    expect(getManilhaValue({ suit: "clubs", value: "3" })).toBe("4");
  });

  it("não depende do naipe do vira", () => {
    for (const suit of ["hearts", "spades", "diamonds", "clubs"] as const) {
      expect(getManilhaValue({ suit, value: "7" })).toBe("Q");
    }
  });
});

describe("força das cartas", () => {
  const deck = generateDeck();

  it("o baralho tem 40 cartas únicas", () => {
    expect(new Set(deck.map(key)).size).toBe(40);
  });

  it("com QUALQUER vira, as 40 cartas têm forças todas diferentes — nunca existe empate", () => {
    for (const vira of deck) {
      const strengths = deck.map((c) => getCardStrength(c, vira));
      expect(new Set(strengths).size, `vira ${key(vira)}`).toBe(40);
    }
  });

  it("as 4 manilhas ganham de qualquer carta comum, e Paus > Copas > Espadas > Ouros entre elas", () => {
    for (const vira of deck) {
      const manilha = getManilhaValue(vira);
      const manilhas = deck.filter((c) => c.value === manilha);
      const normals = deck.filter((c) => c.value !== manilha);
      const weakestManilha = Math.min(...manilhas.map((c) => getCardStrength(c, vira)));
      const strongestNormal = Math.max(...normals.map((c) => getCardStrength(c, vira)));
      expect(weakestManilha).toBeGreaterThan(strongestNormal);

      const bySuit = Object.fromEntries(manilhas.map((c) => [c.suit, getCardStrength(c, vira)]));
      expect(bySuit.clubs).toBeGreaterThan(bySuit.hearts);
      expect(bySuit.hearts).toBeGreaterThan(bySuit.spades);
      expect(bySuit.spades).toBeGreaterThan(bySuit.diamonds);
    }
  });

  it("fora da manilha, vale o valor (4 < 5 < … < 3) e só então o naipe", () => {
    const vira: Card = { suit: "diamonds", value: "4" }; // manilha = 5
    const strength = (value: Value, suit: Card["suit"]) => getCardStrength({ suit, value }, vira);
    // o pior 3 (ouros) ainda ganha do melhor 2 (paus)
    expect(strength("3", "diamonds")).toBeGreaterThan(strength("2", "clubs"));
    // mesmo valor: o naipe desempata
    expect(strength("K", "clubs")).toBeGreaterThan(strength("K", "diamonds"));
  });
});

describe("quem ganha a vaza", () => {
  it("é sempre a carta mais forte, em qualquer ordem de jogada (varredura aleatória)", () => {
    const rng = mulberry32(2024);
    const deck = generateDeck();
    for (let i = 0; i < 400; i++) {
      const shuffled = [...deck].sort(() => rng() - 0.5);
      const vira = shuffled[0];
      const played = shuffled.slice(1, 2 + Math.floor(rng() * 8)); // 1 a 8 cartas
      const winner = getWinningCardIndex(played, vira);
      const best = Math.max(...played.map((c) => getCardStrength(c, vira)));
      expect(getCardStrength(played[winner], vira)).toBe(best);
    }
  });

  it("vaza vazia não tem vencedor; carta sozinha vence", () => {
    const vira: Card = { suit: "hearts", value: "A" };
    expect(getWinningCardIndex([], vira)).toBe(-1);
    expect(getWinningCardIndex([{ suit: "spades", value: "4" }], vira)).toBe(0);
  });
});

describe("shuffleDeck", () => {
  it("é uma permutação: mesmas cartas, sem repetir, sem alterar o baralho original", () => {
    const deck = generateDeck();
    const copy = deck.map(key);
    const shuffled = shuffleDeck(deck);
    expect(deck.map(key)).toEqual(copy);
    expect([...shuffled.map(key)].sort()).toEqual([...copy].sort());
  });

  it("com o mesmo sorteio dá a mesma ordem; com sorteios diferentes, ordens diferentes", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(5));
    const a = shuffleDeck(generateDeck()).map(key).join();
    vi.spyOn(Math, "random").mockImplementation(mulberry32(5));
    const b = shuffleDeck(generateDeck()).map(key).join();
    vi.spyOn(Math, "random").mockImplementation(mulberry32(6));
    const c = shuffleDeck(generateDeck()).map(key).join();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("é justo: a carta de cima é sorteada de forma bem espalhada entre as 40", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(99));
    const counts = new Map<string, number>();
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      const top = key(shuffleDeck(generateDeck())[0]);
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    expect(counts.size).toBe(40); // todas aparecem
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(55); // esperado ≈ 100 (±4,5σ)
      expect(n).toBeLessThan(145);
    }
  });
});
