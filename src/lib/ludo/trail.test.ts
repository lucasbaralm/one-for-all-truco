import { describe, expect, it } from "vitest";
import { COLORS, FINISHED, IN_BASE, pieceCenter } from "./board";
import { toSvgPoints, trailPoints } from "./trail";

describe("trailPoints", () => {
  it("saindo da base: do lugar da peça na base até a casa de saída", () => {
    for (const color of COLORS) {
      const pts = trailPoints(color, 2, IN_BASE, 0);
      expect(pts).toEqual([pieceCenter(color, IN_BASE, 2), pieceCenter(color, 0, 2)]);
    }
  });

  it("andando: um ponto por casa, do começo ao fim, sempre entre casas vizinhas", () => {
    for (const color of COLORS) {
      for (const [from, to] of [[0, 6], [10, 16], [45, 51], [49, 55], [50, FINISHED]] as const) {
        const pts = trailPoints(color, 0, from, to);
        expect(pts).toHaveLength(to - from + 1);
        expect(pts[0]).toEqual(pieceCenter(color, from, 0));
        expect(pts[pts.length - 1]).toEqual(pieceCenter(color, to, 0));
        // casas vizinhas (inclusive diagonal nas quinas); chegar em casa é um passo até perto do centro
        const steps = to === FINISHED ? pts.length - 2 : pts.length - 1;
        for (let i = 0; i < steps; i++) {
          expect(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y), `${color} ${from}→${to} passo ${i}`).toBeLessThan(1.5);
        }
      }
    }
  });

  it("uma casa só (from = to) vira um ponto", () => {
    expect(trailPoints("red", 0, 5, 5)).toHaveLength(1);
  });
});

describe("toSvgPoints", () => {
  it("formata e aplica a transformação (girar pra exibição)", () => {
    const pts = [{ x: 1, y: 2 }, { x: 3.12345, y: 4 }];
    expect(toSvgPoints(pts)).toBe("1.000,2.000 3.123,4.000");
    expect(toSvgPoints(pts, (p) => ({ x: p.y, y: p.x }))).toBe("2.000,1.000 4.000,3.123");
  });
});
