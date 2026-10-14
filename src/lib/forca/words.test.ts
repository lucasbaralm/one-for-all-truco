import { describe, expect, it } from "vitest";
import { ALPHABET, LETTER_ORDER, WORDS, normalize } from "./words";

describe("normalize", () => {
  it("tira acento, põe em maiúsculas e descarta o que não é letra", () => {
    expect(normalize("avião")).toBe("AVIAO");
    expect(normalize("Ação!")).toBe("ACAO");
    expect(normalize("Maçã")).toBe("MACA");
    expect(normalize("  p ê s s e g o ")).toBe("PESSEGO");
    expect(normalize("1-2")).toBe("");
  });
});

describe("lista de palavras", () => {
  it("toda palavra vira só A–Z com 3+ letras, sem espaço e sem repetir", () => {
    const seen = new Set<string>();
    for (const { word, category } of WORDS) {
      expect(word, `palavra "${word}"`).toMatch(/^\S+$/);
      const norm = normalize(word);
      expect(norm.length, `"${word}" tem poucas letras`).toBeGreaterThanOrEqual(3);
      expect(norm.length, `"${word}" é comprida demais`).toBeLessThanOrEqual(14);
      expect(norm.length, `"${word}" perdeu letras ao normalizar`).toBe([...word].length);
      expect(category.length).toBeGreaterThan(0);
      expect(seen.has(word), `"${word}" repetida`).toBe(false);
      seen.add(word);
    }
  });

  it("tem categorias variadas e bastante palavra pra uma partida de 8 sem repetir", () => {
    expect(new Set(WORDS.map((w) => w.category)).size).toBeGreaterThanOrEqual(6);
    expect(WORDS.length).toBeGreaterThanOrEqual(100);
  });

  it("a ordem de frequência das letras cobre o alfabeto inteiro, uma vez cada", () => {
    expect([...LETTER_ORDER].sort().join("")).toBe(ALPHABET);
  });
});
