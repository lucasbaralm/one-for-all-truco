import { describe, expect, it } from "vitest";
import { BR_SONGS, WORLD_SONGS } from "./songs";
import { mainTitle } from "./titles";
import { fitRows, WORD_GAP } from "./wordFit";

describe("fitRows", () => {
  it("uma palavra só: uma linha, do tamanho dela", () => {
    expect(fitRows([7], 2)).toEqual({ units: 7, letters: 7, rows: 1 });
  });

  it("sem palavras não quebra", () => {
    expect(fitRows([], 2)).toEqual({ units: 1, letters: 1, rows: 0 });
  });

  it("junta palavras curtas numa linha só quando há linhas sobrando", () => {
    const fit = fitRows([2, 2, 3], 1);
    expect(fit.rows).toBe(1);
    expect(fit.units).toBeCloseTo(7 + 2 * WORD_GAP);
    expect(fit.letters).toBe(7);
  });

  it("nunca parte uma palavra: a linha é pelo menos a da maior palavra", () => {
    expect(fitRows([9, 1, 1], 3).units).toBeGreaterThanOrEqual(9);
  });

  it("'Smells Like Teen Spirit' cabe em duas linhas de 'Smells Like' / 'Teen Spirit'", () => {
    const fit = fitRows([6, 4, 4, 6], 2);
    expect(fit.rows).toBe(2);
    expect(fit.units).toBeCloseTo(10 + WORD_GAP);
  });

  it("mais linhas permitidas nunca deixam a linha mais larga", () => {
    const lengths = [5, 5, 8, 3, 6];
    const widths = [1, 2, 3, 4, 5].map((n) => fitRows(lengths, n).units);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1] + 1e-9);
  });

  it("o resultado respeita o limite de linhas pra todo título do catálogo (2 e 3 linhas)", () => {
    for (const [title] of [...BR_SONGS, ...WORLD_SONGS]) {
      const lengths = mainTitle(title)
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => [...w].length);
      for (const max of [2, 3]) {
        const fit = fitRows(lengths, max);
        expect(fit.rows, title).toBeLessThanOrEqual(Math.max(max, 1));
        expect(fit.units, title).toBeGreaterThanOrEqual(Math.max(...lengths));
      }
    }
  });
});
