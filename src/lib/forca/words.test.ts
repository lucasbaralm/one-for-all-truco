import { describe, expect, it } from "vitest";
import { ALPHABET, LETTER_ORDER, MAX_WORD_CHARS, normalize, parseWord } from "./words";

describe("normalize", () => {
  it("tira acento, põe em maiúsculas e descarta o que não é letra", () => {
    expect(normalize("avião")).toBe("AVIAO");
    expect(normalize("Ação!")).toBe("ACAO");
    expect(normalize("Maçã")).toBe("MACA");
    expect(normalize("  p ê s s e g o ")).toBe("PESSEGO");
    expect(normalize("1-2")).toBe("");
  });
});

describe("parseWord (o que o escolhedor digitou)", () => {
  it("palavra simples: maiúsculas, com acento, e a versão sem acento alinhada", () => {
    expect(parseWord("avião")).toEqual({ word: "AVIÃO", norm: "AVIAO" });
    expect(parseWord("  Coração ")).toEqual({ word: "CORAÇÃO", norm: "CORACAO" });
  });

  it("frase: espaços simples entre as palavras (o excesso some) e a norm guarda os espaços", () => {
    const p = parseWord("casa   de papel")!;
    expect(p.word).toBe("CASA DE PAPEL");
    expect(p.norm).toBe("CASA DE PAPEL");
    expect(p.norm).toHaveLength(p.word.length);
    expect(parseWord("pão de queijo")).toEqual({ word: "PÃO DE QUEIJO", norm: "PAO DE QUEIJO" });
  });

  it("recusa o que não é letra nem espaço (número, hífen, símbolo) em vez de mudar o que a pessoa quis dizer", () => {
    for (const bad of ["guarda-chuva", "abc1", "olá!", "a_b", "x.y", "💥💥"]) expect(parseWord(bad), bad).toBeNull();
  });

  it("precisa de pelo menos 2 letras (espaços não contam) e cabe em 30 caracteres", () => {
    expect(parseWord("")).toBeNull();
    expect(parseWord("a")).toBeNull();
    expect(parseWord("  a  ")).toBeNull();
    expect(parseWord("a b")).not.toBeNull();
    expect(parseWord("ab")).not.toBeNull();
    expect(parseWord("a".repeat(MAX_WORD_CHARS))).not.toBeNull();
    expect(parseWord("a".repeat(MAX_WORD_CHARS + 1))).toBeNull();
  });

  it("não aceita lixo que não é texto", () => {
    expect(parseWord(undefined as unknown as string)).toBeNull();
    expect(parseWord(42 as unknown as string)).toBeNull();
  });
});

describe("letras", () => {
  it("a ordem de frequência das letras cobre o alfabeto inteiro, uma vez cada", () => {
    expect([...LETTER_ORDER].sort().join("")).toBe(ALPHABET);
  });
});
