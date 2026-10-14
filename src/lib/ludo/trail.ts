// Caminho que uma peça percorreu (ou vai percorrer): os centros das casas, uma a
// uma, em unidades do tabuleiro "canônico" (antes de girar pra exibição). A tela
// desenha isso como rastro da última jogada e como prévia ao passar o mouse.

import { IN_BASE, LudoColor, pieceCenter } from "./board";

export interface TrailPoint {
  x: number;
  y: number;
}

export function trailPoints(color: LudoColor, piece: number, from: number, to: number): TrailPoint[] {
  // Saindo da base: do lugar da peça na base até a casa de saída.
  if (from === IN_BASE) return [pieceCenter(color, IN_BASE, piece), pieceCenter(color, to, piece)];
  const points: TrailPoint[] = [];
  for (let p = from; p <= to; p++) points.push(pieceCenter(color, p, piece));
  return points;
}

/** Pontos no formato do atributo `points` do SVG. */
export const toSvgPoints = (points: TrailPoint[], map: (p: TrailPoint) => TrailPoint = (p) => p) =>
  points
    .map(map)
    .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
    .join(" ");
