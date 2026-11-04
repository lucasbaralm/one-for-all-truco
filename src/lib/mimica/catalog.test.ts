import { describe, expect, it } from "vitest";
import { IDS_BY_KIND, SONGS, isCorrectGuess, songOf } from "./catalog";
import { MAX_GUESS_CHARS } from "./engine";
import { BR_SONGS, WORLD_SONGS } from "./songs";
import { mainTitle, matchesTitle, titleKey, titlePattern } from "./titles";

// O catálogo é dado em arquivo: aqui ficam as regras que o jogo assume sobre ele.

describe("as listas", () => {
  it("são 300 do Brasil e 300 do mundo, com ids que são a posição", () => {
    expect(BR_SONGS).toHaveLength(300);
    expect(WORLD_SONGS).toHaveLength(300);
    expect(SONGS).toHaveLength(600);
    SONGS.forEach((s, i) => expect(s.id).toBe(i));
    expect(IDS_BY_KIND.br).toHaveLength(300);
    expect(IDS_BY_KIND.world).toHaveLength(300);
    expect(songOf(0)?.kind).toBe("br");
    expect(songOf(300)?.kind).toBe("world");
    expect(songOf(600)).toBeUndefined();
    expect(songOf(null)).toBeUndefined();
  });

  it("todo título e todo artista têm texto, e dá pra digitar o título inteiro", () => {
    for (const s of SONGS) {
      expect(s.title.trim(), `título vazio no id ${s.id}`).not.toBe("");
      expect(s.artist.trim(), `artista vazio em ${s.title}`).not.toBe("");
      expect(s.title, `espaço sobrando em "${s.title}"`).toBe(s.title.replace(/\s+/g, " ").trim());
      expect(s.title.length, `"${s.title}" não cabe no campo de chute`).toBeLessThanOrEqual(MAX_GUESS_CHARS);
      expect(titleKey(s.title), `"${s.title}" não tem letra nenhuma`).not.toBe("");
    }
  });

  it("nenhum título repete (nem entre as duas listas): a resposta nunca é ambígua", () => {
    const seen = new Map<string, string>();
    for (const s of SONGS) {
      const k = titleKey(mainTitle(s.title));
      expect(seen.has(k), `"${s.title}" repete "${seen.get(k)}"`).toBe(false);
      seen.set(k, s.title);
    }
  });

  it("ficaram de fora as versões e o que não é música", () => {
    // "Ao Vivo E A Cores" é título de verdade; o que não pode é "- Ao Vivo" / "(Ao Vivo)" sobrando no fim.
    const bad = /(-|\()\s*(ao vivo|live)|\b(live|ao vivo)\s*$|remix|remaster|feat\.|sped up|slowed|instrumental|karaoke|pot-pourri|medley|\bmtg\b/i;
    for (const s of SONGS) expect(s.title, s.title).not.toMatch(bad);
  });

  it("nenhum título tem palavrão", () => {
    const vulgar = /putaria|\bputa\b|fode|caralh|carai|porra|buceta|piroca|\braba\b|viado|fuck|shit|bitch|nigg|pussy/i;
    for (const s of SONGS) expect(s.title, s.title).not.toMatch(vulgar);
  });
});

describe("a tolerância a erro de digitação não confunde uma música com outra", () => {
  it("o título de uma música nunca vale como resposta de outra", () => {
    // "Love Yourself" está a 1 letra de "Lose Yourself": sem a trava do catálogo, chutar uma acertaria a outra.
    const clashes: string[] = [];
    for (const a of SONGS) {
      for (const b of SONGS) {
        if (a.id === b.id) continue;
        if (isCorrectGuess(b.title, a) || isCorrectGuess(mainTitle(b.title), a)) clashes.push(`chutar "${b.title}" acerta "${a.title}"`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("os pares que a tolerância confundiria existem de verdade (e a trava resolve)", () => {
    const love = SONGS.find((s) => s.title === "Love Yourself")!;
    const lose = SONGS.find((s) => s.title === "Lose Yourself")!;
    expect(matchesTitle("Lose Yourself", love.title)).toBe(true); // só a tolerância, sem o catálogo, confundiria
    expect(isCorrectGuess("Lose Yourself", love)).toBe(false);
    expect(isCorrectGuess("Love Yourself", lose)).toBe(false);
    expect(isCorrectGuess("Love Yourselt", love)).toBe(true); // errinho de verdade continua valendo
  });

  it("e a resposta certa vale (com o título inteiro e só com o principal)", () => {
    for (const s of SONGS) {
      expect(isCorrectGuess(s.title, s), s.title).toBe(true);
      expect(isCorrectGuess(mainTitle(s.title), s), s.title).toBe(true);
    }
  });
});

describe("as casinhas", () => {
  it("nunca entregam o título e têm uma casinha por letra", () => {
    for (const s of SONGS) {
      const hidden = titlePattern(s.title);
      expect(hidden.some((c) => c === null), s.title).toBe(true);
      expect(hidden.filter((c) => c !== null && /[\p{L}\p{N}]/u.test(c)), s.title).toEqual([]);
      expect(titlePattern(s.title, 0, true).join("")).toBe(mainTitle(s.title));
    }
  });
});
