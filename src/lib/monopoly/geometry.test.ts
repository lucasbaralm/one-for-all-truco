import { describe, expect, it } from "vitest";
import { BOARD_UNITS, MAX_WALK, TRACKS, cellOf, centerOf, forwardDistance, innerEdge, isCorner, rectOf, sideOf, slotOffset, walkPath } from "./geometry";

describe("grid do tabuleiro", () => {
  it("as trilhas somam 12 unidades (cantos de 1,5)", () => {
    expect(BOARD_UNITS).toBe(12);
    expect(TRACKS[0]).toBe(1.5);
    expect(TRACKS[10]).toBe(1.5);
  });

  it("cada casa tem uma célula única e os cantos ficam nos cantos", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { col, row } = cellOf(i);
      expect(col).toBeGreaterThanOrEqual(1);
      expect(col).toBeLessThanOrEqual(11);
      expect(row).toBeGreaterThanOrEqual(1);
      expect(row).toBeLessThanOrEqual(11);
      seen.add(`${col},${row}`);
    }
    expect(seen.size).toBe(40);
    expect(cellOf(0)).toEqual({ col: 11, row: 11 });
    expect(cellOf(10)).toEqual({ col: 1, row: 11 });
    expect(cellOf(20)).toEqual({ col: 1, row: 1 });
    expect(cellOf(30)).toEqual({ col: 11, row: 1 });
  });

  it("anda no sentido horário: embaixo p/ esquerda, esquerda p/ cima, em cima p/ direita, direita p/ baixo", () => {
    expect(cellOf(1)).toEqual({ col: 10, row: 11 });
    expect(cellOf(9)).toEqual({ col: 2, row: 11 });
    expect(cellOf(11)).toEqual({ col: 1, row: 10 });
    expect(cellOf(19)).toEqual({ col: 1, row: 2 });
    expect(cellOf(21)).toEqual({ col: 2, row: 1 });
    expect(cellOf(29)).toEqual({ col: 10, row: 1 });
    expect(cellOf(31)).toEqual({ col: 11, row: 2 });
    expect(cellOf(39)).toEqual({ col: 11, row: 10 });
  });

  it("casa inválida estoura", () => {
    expect(() => cellOf(-1)).toThrow();
    expect(() => cellOf(40)).toThrow();
    expect(() => cellOf(1.5)).toThrow();
  });

  it("lados e cantos", () => {
    expect([0, 10, 20, 30].every(isCorner)).toBe(true);
    expect(isCorner(5)).toBe(false);
    expect(sideOf(5)).toBe("bottom");
    expect(sideOf(15)).toBe("left");
    expect(sideOf(25)).toBe("top");
    expect(sideOf(35)).toBe("right");
    expect(sideOf(30)).toBe("corner");
    expect(innerEdge(5)).toBe("top");
    expect(innerEdge(15)).toBe("right");
    expect(innerEdge(25)).toBe("bottom");
    expect(innerEdge(35)).toBe("left");
    expect(innerEdge(0)).toBeNull();
  });

  it("os retângulos ladrilham o tabuleiro inteiro sem sobrepor", () => {
    let area = 0;
    for (let i = 0; i < 40; i++) {
      const r = rectOf(i);
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(100 + 1e-9);
      area += r.w * r.h;
    }
    // as 40 casas formam o anel: tudo menos o miolo 9×9 (81 de 144 unidades²)
    expect(area).toBeCloseTo(100 * 100 * (1 - 81 / 144), 5);
    // casas vizinhas se encostam (sem vão): o fim de uma é o começo da próxima
    const a = rectOf(3);
    const b = rectOf(4);
    expect(b.x + b.w).toBeCloseTo(a.x, 5);
  });

  it("centros ficam dentro das próprias casas; a partida é o canto de baixo à direita", () => {
    for (let i = 0; i < 40; i++) {
      const r = rectOf(i);
      const c = centerOf(i);
      expect(c.x).toBeGreaterThan(r.x);
      expect(c.x).toBeLessThan(r.x + r.w);
      expect(c.y).toBeGreaterThan(r.y);
      expect(c.y).toBeLessThan(r.y + r.h);
    }
    expect(centerOf(0).x).toBeGreaterThan(90);
    expect(centerOf(0).y).toBeGreaterThan(90);
    expect(centerOf(20).x).toBeLessThan(10);
  });
});

describe("caminhada da peça", () => {
  it("distância sempre pra frente", () => {
    expect(forwardDistance(5, 8)).toBe(3);
    expect(forwardDistance(38, 3)).toBe(5);
    expect(forwardDistance(7, 7)).toBe(0);
    expect(forwardDistance(7, 4)).toBe(37);
  });

  it("deslocamento curto passa por cada casa, inclusive dando a volta na partida", () => {
    expect(walkPath(2, 5)).toEqual([3, 4, 5]);
    expect(walkPath(38, 3)).toEqual([39, 0, 1, 2, 3]);
    expect(walkPath(0, MAX_WALK)).toHaveLength(MAX_WALK);
  });

  it("longo (prisão, voltar casas, carta 'avance') é um pulo direto; parado fica parado", () => {
    expect(walkPath(30, 10)).toEqual([10]);
    expect(walkPath(7, 4)).toEqual([4]);
    expect(walkPath(7, 39)).toEqual([39]);
    expect(walkPath(12, 12)).toEqual([12]);
  });
});

describe("peças na mesma casa", () => {
  it("uma só fica no centro; várias se espalham sem se sobrepor", () => {
    expect(slotOffset(0, 1)).toEqual({ dx: 0, dy: 0 });
    for (const total of [2, 3, 4, 5, 6]) {
      const spots = Array.from({ length: total }, (_, i) => slotOffset(i, total));
      const keys = new Set(spots.map((s) => `${s.dx.toFixed(3)},${s.dy.toFixed(3)}`));
      expect(keys.size).toBe(total);
    }
    // centradas: a média dos deslocamentos é ~0
    const six = Array.from({ length: 6 }, (_, i) => slotOffset(i, 6));
    expect(six.reduce((a, s) => a + s.dx, 0)).toBeCloseTo(0, 5);
    expect(six.reduce((a, s) => a + s.dy, 0)).toBeCloseTo(0, 5);
  });
});
