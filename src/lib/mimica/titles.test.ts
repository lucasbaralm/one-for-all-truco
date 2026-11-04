import { describe, expect, it } from "vitest";
import { answerKeys, editDistance, mainTitle, matchesTitle, titleKey, titlePattern, titleShape, tolerance } from "./titles";

describe("titleKey", () => {
  it("tira acento, maiúscula, pontuação e espaço", () => {
    expect(titleKey("Coração Partido!")).toBe("coracaopartido");
    expect(titleKey("  Don't   Stop Me Now ")).toBe("dontstopmenow");
    expect(titleKey("7 rings")).toBe("7rings");
    expect(titleKey("¡¿?!")).toBe("");
  });
});

describe("mainTitle / answerKeys", () => {
  it("o complemento entre parênteses sai do título principal", () => {
    expect(mainTitle("Habits (Stay High)")).toBe("Habits");
    expect(mainTitle("Coração Partido (Corazón Partío)")).toBe("Coração Partido");
    expect(mainTitle("Sweet Dreams")).toBe("Sweet Dreams");
  });

  it("título só de parênteses não vira vazio", () => {
    expect(mainTitle("(Intro)")).toBe("(Intro)");
  });

  it("aceita com e sem o complemento", () => {
    expect(answerKeys("Habits (Stay High)").sort()).toEqual(["habits", "habitsstayhigh"]);
  });

  it("& pode ser dito e, and ou nem dito", () => {
    const keys = answerKeys("Young Dumb & Broke");
    expect(keys).toContain("youngdumbbroke");
    expect(keys).toContain("youngdumbandbroke");
    expect(keys).toContain("youngdumbebroke");
  });
});

describe("tolerância a erro de digitação", () => {
  it("curto = exato; médio = 1 erro; longo = 2", () => {
    expect(tolerance(5)).toBe(0);
    expect(tolerance(6)).toBe(1);
    expect(tolerance(13)).toBe(1);
    expect(tolerance(14)).toBe(2);
  });

  it("editDistance conta inserir, tirar e trocar, e desiste cedo", () => {
    expect(editDistance("kitten", "sitting", 5)).toBe(3);
    expect(editDistance("abc", "abc", 2)).toBe(0);
    expect(editDistance("abc", "abd", 2)).toBe(1);
    expect(editDistance("abc", "abcdef", 2)).toBe(3); // diferença de tamanho já passa do limite
    expect(editDistance("aaaaaa", "bbbbbb", 2)).toBeGreaterThan(2);
  });
});

describe("matchesTitle", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(matchesTitle("evidencias", "Evidências")).toBe(true);
    expect(matchesTitle("DONT START NOW", "Don't Start Now")).toBe(true);
    expect(matchesTitle("coração, partido", "Coração Partido (Corazón Partío)")).toBe(true);
  });

  it("vale com o complemento, sem ele e com ele inteiro", () => {
    expect(matchesTitle("habits", "Habits (Stay High)")).toBe(true);
    expect(matchesTitle("habits stay high", "Habits (Stay High)")).toBe(true);
    expect(matchesTitle("stay high", "Habits (Stay High)")).toBe(false);
  });

  it("perdoa um errinho nos títulos médios e dois nos longos", () => {
    expect(matchesTitle("blinding lights", "Blinding Lights")).toBe(true);
    expect(matchesTitle("blindin lights", "Blinding Lights")).toBe(true); // 1 letra a menos
    expect(matchesTitle("blindin lihts", "Blinding Lights")).toBe(true); // 2 erros num título de 14 letras
    expect(matchesTitle("blindin lihts!!", "Blinding Lights")).toBe(true);
    expect(matchesTitle("blind lights", "Blinding Lights")).toBe(false); // 3 de diferença
    expect(matchesTitle("billie jean", "Billie Jean")).toBe(true);
    expect(matchesTitle("bilie jean", "Billie Jean")).toBe(true);
  });

  it("título curto não perdoa nada (senão 'Lover' aceitaria 'Lovers')", () => {
    expect(matchesTitle("lovers", "Lover")).toBe(false);
    expect(matchesTitle("stay", "STAY")).toBe(true);
    expect(matchesTitle("stai", "STAY")).toBe(false);
    expect(matchesTitle("x1", "X1")).toBe(true);
  });

  it("não aceita vazio, só pontuação nem outra música", () => {
    expect(matchesTitle("", "Perfect")).toBe(false);
    expect(matchesTitle("?!", "Perfect")).toBe(false);
    expect(matchesTitle("shape of you", "Perfect")).toBe(false);
  });

  it("& em qualquer forma", () => {
    expect(matchesTitle("young dumb and broke", "Young Dumb & Broke")).toBe(true);
    expect(matchesTitle("young dumb broke", "Young Dumb & Broke")).toBe(true);
  });
});

describe("titlePattern", () => {
  const show = (p: (string | null)[]) => p.map((c) => c ?? "_").join("");

  it("esconde letras e dígitos e mostra espaço e pontuação", () => {
    expect(show(titlePattern("Don't Stop"))).toBe("___'_ ____");
    expect(show(titlePattern("7 rings"))).toBe("_ _____");
    expect(show(titlePattern("Why'd You Only Call Me When You're High?"))).toBe("___'_ ___ ____ ____ __ ____ ___'__ ____?");
  });

  it("não mostra o complemento entre parênteses", () => {
    expect(show(titlePattern("Habits (Stay High)"))).toBe("______");
  });

  it("a dica mostra a primeira letra de cada palavra (o que vem depois do apóstrofo não)", () => {
    expect(show(titlePattern("Don't Stop Me Now", 1))).toBe("D__'_ S___ M_ N__");
    expect(show(titlePattern("coração partido", 1))).toBe("c______ p______");
  });

  it("revealAll mostra tudo", () => {
    expect(show(titlePattern("Blinding Lights", 0, true))).toBe("Blinding Lights");
  });
});

describe("titleShape", () => {
  it("conta palavras e letras do título principal", () => {
    expect(titleShape("Blinding Lights")).toEqual({ words: 2, letters: 14 });
    expect(titleShape("Habits (Stay High)")).toEqual({ words: 1, letters: 6 });
    expect(titleShape("7 rings")).toEqual({ words: 2, letters: 6 });
    expect(titleShape("Don't")).toEqual({ words: 1, letters: 4 });
  });
});
