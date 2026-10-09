import { describe, it, expect } from "vitest";
import {
  COLORS,
  FINISHED,
  HOME_COLUMN,
  IN_BASE,
  RING,
  RING_SIZE,
  START_INDEX,
  SAFE_RING_INDEXES,
  cellOf,
  pieceCenter,
  rotatePoint,
} from "./board";

describe("anel do tabuleiro", () => {
  it("tem 52 casas únicas, cada uma vizinha da seguinte", () => {
    expect(RING).toHaveLength(RING_SIZE);
    const keys = new Set(RING.map((c) => `${c.col},${c.row}`));
    expect(keys.size).toBe(RING_SIZE);
    let diagonals = 0;
    for (let i = 0; i < RING_SIZE; i++) {
      const a = RING[i];
      const b = RING[(i + 1) % RING_SIZE];
      // Nas quinas internas da cruz o caminho dobra na diagonal (a casa do
      // canto pertence ao bloco central) — passo de distância 1 em xadrez.
      expect(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))).toBe(1);
      if (a.col !== b.col && a.row !== b.row) diagonals++;
    }
    expect(diagonals).toBe(4);
  });

  it("começa a 13 casas de distância entre cores, nos cantos certos", () => {
    expect(RING[START_INDEX.red]).toEqual({ col: 1, row: 6 });
    expect(RING[START_INDEX.green]).toEqual({ col: 8, row: 1 });
    expect(RING[START_INDEX.blue]).toEqual({ col: 13, row: 8 });
    expect(RING[START_INDEX.yellow]).toEqual({ col: 6, row: 13 });
  });

  it("tem 8 casas seguras (4 saídas + 4 estrelas)", () => {
    expect(SAFE_RING_INDEXES.size).toBe(8);
  });
});

describe("reta final", () => {
  it("cada cor entra na reta final logo depois da casa 50 do seu percurso", () => {
    for (const color of COLORS) {
      const last = cellOf(color, 50)!;
      const firstHome = cellOf(color, 51)!;
      expect(Math.abs(last.col - firstHome.col) + Math.abs(last.row - firstHome.row)).toBe(1);
      expect(HOME_COLUMN[color]).toHaveLength(5);
    }
  });

  it("nenhuma reta final cruza o anel nem outra reta", () => {
    const seen = new Set(RING.map((c) => `${c.col},${c.row}`));
    for (const color of COLORS) {
      for (const c of HOME_COLUMN[color]) {
        const k = `${c.col},${c.row}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe("posição das peças", () => {
  it("base e chegada não têm casa inteira", () => {
    expect(cellOf("red", IN_BASE)).toBeNull();
    expect(cellOf("red", FINISHED)).toBeNull();
  });

  it("as 4 peças da base ocupam encaixes diferentes", () => {
    const keys = new Set([0, 1, 2, 3].map((s) => JSON.stringify(pieceCenter("green", IN_BASE, s))));
    expect(keys.size).toBe(4);
  });

  it("girar 4 vezes volta ao mesmo ponto; girar uma vez leva o canto de cima-esquerda pra cima-direita", () => {
    expect(rotatePoint(3, 5, 4)).toEqual({ x: 3, y: 5 });
    expect(rotatePoint(0, 0, 1)).toEqual({ x: 15, y: 0 });
    expect(rotatePoint(2.5, 2.5, 1)).toEqual({ x: 12.5, y: 2.5 });
  });
});
