import { describe, expect, it } from "vitest";
import {
  BASE_ORIGIN,
  BOARD_SIZE,
  COLORS,
  FINISHED,
  HOME_COLUMN,
  HOME_COLUMN_START,
  IN_BASE,
  RING,
  cellOf,
  pieceCenter,
  rotatePoint,
} from "./board";

// Geometria do tabuleiro varrida por inteiro (board.test.ts cobre o anel e as
// saídas; aqui entram o caminho completo de cada cor, as bases e a rotação
// usada pra deixar a cor do jogador embaixo à esquerda).

const inBase = (col: number, row: number) =>
  COLORS.some((c) => {
    const o = BASE_ORIGIN[c];
    return col >= o.col && col < o.col + 6 && row >= o.row && row < o.row + 6;
  });

describe("caminho de cada cor", () => {
  it("passo a passo, da saída até a reta final, cada casa encosta na anterior (a quina é diagonal)", () => {
    for (const color of COLORS) {
      for (let p = 0; p < FINISHED - 1; p++) {
        const a = cellOf(color, p)!;
        const b = cellOf(color, p + 1)!;
        expect(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)), `${color} ${p}→${p + 1}`).toBe(1);
      }
    }
  });

  it("51 casas no anel + 5 na reta final = 56 casas diferentes por cor", () => {
    for (const color of COLORS) {
      // progresso 0..55 tem casa no tabuleiro; o 56 ("em casa") é o centro e não tem casa própria
      const cells = Array.from({ length: FINISHED }, (_, p) => cellOf(color, p)!).map((c) => `${c.col},${c.row}`);
      expect(cells).toHaveLength(56);
      expect(new Set(cells).size).toBe(56);
      expect(HOME_COLUMN[color]).toHaveLength(FINISHED - HOME_COLUMN_START);
    }
  });

  it("nenhuma casa do caminho cai dentro das bases dos cantos", () => {
    for (const cell of RING) expect(inBase(cell.col, cell.row)).toBe(false);
    for (const color of COLORS) for (const cell of HOME_COLUMN[color]) expect(inBase(cell.col, cell.row)).toBe(false);
  });

  it("a reta final de cada cor termina encostada no bloco central 3x3", () => {
    for (const color of COLORS) {
      const last = HOME_COLUMN[color].at(-1)!;
      // distância até o retângulo do centro (colunas/linhas 6..8): 1 = encostada
      const dx = Math.max(6 - last.col, 0, last.col - 8);
      const dy = Math.max(6 - last.row, 0, last.row - 8);
      expect(Math.max(dx, dy)).toBe(1);
    }
  });

  it("as 4 cores fazem o mesmo caminho, só girado (simetria do tabuleiro)", () => {
    // girar o caminho do vermelho 90° no sentido horário dá o caminho do verde, etc.
    COLORS.forEach((color, i) => {
      for (let p = 0; p < FINISHED - 1; p++) {
        const red = cellOf("red", p)!;
        const turned = rotatePoint(red.col + 0.5, red.row + 0.5, i);
        const mine = cellOf(color, p)!;
        expect(turned).toEqual({ x: mine.col + 0.5, y: mine.row + 0.5 });
      }
    });
  });
});

describe("posições de desenho (pieceCenter)", () => {
  it("toda peça, em qualquer progresso, fica dentro do tabuleiro", () => {
    for (const color of COLORS) {
      for (let p = IN_BASE; p <= FINISHED; p++) {
        for (let slot = 0; slot < 4; slot++) {
          const { x, y } = pieceCenter(color, p, slot);
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(BOARD_SIZE);
          expect(y).toBeGreaterThan(0);
          expect(y).toBeLessThan(BOARD_SIZE);
        }
      }
    }
  });

  it("os encaixes da base ficam dentro da base da própria cor, e os 4 de chegada são distintos", () => {
    for (const color of COLORS) {
      const o = BASE_ORIGIN[color];
      const slots = [0, 1, 2, 3].map((s) => pieceCenter(color, IN_BASE, s));
      for (const { x, y } of slots) {
        expect(x).toBeGreaterThan(o.col);
        expect(x).toBeLessThan(o.col + 6);
        expect(y).toBeGreaterThan(o.row);
        expect(y).toBeLessThan(o.row + 6);
      }
      const finish = new Set([0, 1, 2, 3].map((s) => JSON.stringify(pieceCenter(color, FINISHED, s))));
      expect(finish.size).toBe(4);
    }
  });

  it("peças de cores diferentes nunca compartilham encaixe de base nem lugar de chegada", () => {
    const seen = new Set<string>();
    for (const color of COLORS) {
      for (let s = 0; s < 4; s++) {
        for (const p of [IN_BASE, FINISHED]) {
          const key = JSON.stringify(pieceCenter(color, p, s));
          expect(seen.has(key), `${color} ${p} ${s}`).toBe(false);
          seen.add(key);
        }
      }
    }
  });
});

describe("rotação de exibição", () => {
  it("4 giros voltam ao ponto original, e cada giro mantém o ponto dentro do tabuleiro", () => {
    for (let x = 0.5; x < BOARD_SIZE; x += 1.7) {
      for (let y = 0.5; y < BOARD_SIZE; y += 1.3) {
        expect(rotatePoint(x, y, 4)).toEqual({ x, y });
        for (let k = 1; k <= 3; k++) {
          const r = rotatePoint(x, y, k);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x).toBeLessThanOrEqual(BOARD_SIZE);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeLessThanOrEqual(BOARD_SIZE);
        }
      }
    }
  });

  it("giros negativos e acima de 4 se comportam (a tela passa 0..3, mas não pode quebrar)", () => {
    expect(rotatePoint(3.5, 2.5, -1)).toEqual(rotatePoint(3.5, 2.5, 3));
    expect(rotatePoint(3.5, 2.5, 5)).toEqual(rotatePoint(3.5, 2.5, 1));
  });
});
