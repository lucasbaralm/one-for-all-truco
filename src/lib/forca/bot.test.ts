import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { candidatesFor, chooseBotAction } from "./bot";
import { BotLevel, guessLetter, guessWord } from "./engine";
import { game, must } from "./testKit";
import { WORDS, normalize } from "./words";

const entry = (word: string) => WORDS.find((w) => w.word === word)!;

describe("candidatos (o que o bot enxerga)", () => {
  it("só palavras do tamanho certo, com as letras reveladas no lugar certo e sem as letras já erradas", () => {
    const s = game({ word: "GATO", category: "Animal", guessed: ["Z"] });
    const c = candidatesFor(s);
    expect(c.length).toBeGreaterThan(0);
    for (const w of c) {
      expect(normalize(w)).toHaveLength(4);
      expect(normalize(w)).not.toContain("Z");
    }
  });

  it("revelar uma letra afunila: só sobram palavras com ela exatamente nas posições reveladas", () => {
    // BRASIL: B, A, S já saíram → o padrão é B _ A S _ _
    const s = game({ word: "BRASIL", category: "País", guessed: ["B", "A", "S"] });
    for (const w of candidatesFor(s)) {
      const n = normalize(w);
      expect(n[0]).toBe("B");
      expect(n[2]).toBe("A");
      expect(n[3]).toBe("S");
      expect(n.length).toBe(6);
    }
    expect(candidatesFor(s)).toContain("BRASIL");
  });

  it("usa a categoria como dica pública quando ainda há palavra dela", () => {
    const s = game({ word: "BANANA", category: "Fruta" });
    const c = candidatesFor(s);
    expect(c).toContain("BANANA");
    expect(c.every((w) => entry(w).category === "Fruta")).toBe(true);
  });

  it("não considera palavras que já foram jogadas nessa partida", () => {
    const s = { ...game({ word: "BANANA", category: "Fruta" }), usedWords: ["LARANJA", "BANANA"] };
    expect(candidatesFor(s)).not.toContain("LARANJA");
    expect(candidatesFor(s)).toContain("BANANA");
  });

  it("fora de rodada não há candidato", () => {
    expect(candidatesFor({ ...game({ word: "GATO" }), round: null })).toEqual([]);
  });
});

describe("decisões", () => {
  it("só uma palavra possível: médio e difícil arriscam a palavra inteira", () => {
    // MORANGO: 7 letras na categoria Fruta, com padrão fechado em uma só palavra
    const s = game({ word: "MORANGO", category: "Fruta", guessed: ["M", "O", "R", "A", "N", "G"] });
    expect(candidatesFor(s)).toEqual(["MORANGO"]);
    for (const level of ["medium", "hard"] as BotLevel[]) {
      expect(chooseBotAction(s, level, mulberry32(1))).toEqual({ type: "word", word: "MORANGO" });
    }
  });

  it("o difícil escolhe a letra que aparece em mais palavras possíveis, e nunca uma já chutada", () => {
    const s = game({ word: "COBRA", category: "Animal" });
    const a = chooseBotAction(s, "hard", mulberry32(1))!;
    expect(a.type).toBe("letter");
    if (a.type === "letter") {
      expect(a.letter).not.toBe("E");
      const c = candidatesFor(s);
      const score = (l: string) => c.filter((w) => normalize(w).includes(l)).length;
      const best = Math.max(...[..."ABCDFGHIJKLMNOPQRSTUVWXYZ"].map(score));
      expect(score(a.letter)).toBe(best);
    }
  });

  it("o fácil às vezes ignora o dicionário e vai pelas letras mais comuns", () => {
    const s = game({ word: "ELEFANTE", category: "Animal" });
    const letters = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const a = chooseBotAction(s, "easy", mulberry32(i));
      if (a?.type === "letter") letters.add(a.letter);
    }
    expect(letters.size).toBeGreaterThan(1);
  });

  it("não age fora de partida nem sem letras livres", () => {
    expect(chooseBotAction({ ...game({ word: "GATO" }), phase: "round_end" }, "hard")).toBeNull();
    const all = game({ word: "GATO", guessed: [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"] });
    expect(chooseBotAction(all, "hard")).toBeNull();
  });

  it("toda ação escolhida é jogável no estado (não repete letra, palavra válida)", () => {
    for (const level of ["easy", "medium", "hard"] as BotLevel[]) {
      for (let seed = 1; seed <= 30; seed++) {
        const rng = mulberry32(seed);
        let s = game({ word: WORDS[seed % WORDS.length].word, category: WORDS[seed % WORDS.length].category });
        let guard = 0;
        while (s.phase === "playing") {
          expect(guard++).toBeLessThan(60);
          const who = s.players[s.turn].id;
          const a = chooseBotAction(s, level, rng)!;
          expect(a).not.toBeNull();
          const r = a.type === "letter" ? guessLetter(s, who, a.letter, 0) : guessWord(s, who, a.word, 0);
          s = must(r).state;
        }
      }
    }
  });

  it("o difícil resolve a maior parte das palavras antes de a forca fechar", () => {
    let won = 0;
    const sample = WORDS.filter((_, i) => i % 3 === 0);
    sample.forEach((w, i) => {
      const rng = mulberry32(i + 1);
      let s = game({ word: w.word, category: w.category });
      while (s.phase === "playing") {
        const a = chooseBotAction(s, "hard", rng)!;
        const who = s.players[s.turn].id;
        s = must(a.type === "letter" ? guessLetter(s, who, a.letter, 0) : guessWord(s, who, a.word, 0)).state;
      }
      if (s.round!.status === "won") won++;
    });
    expect(won / sample.length).toBeGreaterThan(0.8);
  });
});
