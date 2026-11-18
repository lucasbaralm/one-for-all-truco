// Geometria do tabuleiro de 40 casas: um grid 11×11 em que os cantos são maiores (1,5 vez a casa
// comum). As casas andam no sentido horário a partir do canto de baixo à direita (a partida):
// embaixo da direita pra esquerda (1–9), coluna da esquerda de baixo pra cima (11–19), em cima da
// esquerda pra direita (21–29) e coluna da direita de cima pra baixo (31–39).

import { SQUARE_COUNT } from "./editions";

/** Tamanho de cada trilha do grid, em "unidades": canto, 9 casas, canto. */
export const TRACKS = [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5] as const;
export const BOARD_UNITS = TRACKS.reduce((a, b) => a + b, 0); // 12

/** Frações (0–100) do tabuleiro em que cada trilha começa; a última entrada é o fim (100). */
const START = TRACKS.reduce<number[]>((acc, t, i) => (i === 0 ? [0] : [...acc, acc[i - 1] + (TRACKS[i - 1] / BOARD_UNITS) * 100]), []);

export type Side = "bottom" | "left" | "top" | "right" | "corner";

export interface Cell {
  /** Coluna e linha do grid (1–11). */
  col: number;
  row: number;
}

export function isCorner(idx: number): boolean {
  return idx % 10 === 0;
}

/** Em que lado do tabuleiro a casa fica. */
export function sideOf(idx: number): Side {
  if (isCorner(idx)) return "corner";
  if (idx < 10) return "bottom";
  if (idx < 20) return "left";
  if (idx < 30) return "top";
  return "right";
}

/** Célula do grid da casa `idx` (0 = canto de baixo à direita). */
export function cellOf(idx: number): Cell {
  if (idx < 0 || idx >= SQUARE_COUNT || !Number.isInteger(idx)) throw new Error(`casa inválida: ${idx}`);
  if (idx <= 10) return { col: 11 - idx, row: 11 };
  if (idx <= 20) return { col: 1, row: 11 - (idx - 10) };
  if (idx <= 30) return { col: 1 + (idx - 20), row: 1 };
  return { col: 11, row: 1 + (idx - 30) };
}

/** Retângulo da casa, em % do tabuleiro (esquerda, topo, largura, altura). */
export function rectOf(idx: number): { x: number; y: number; w: number; h: number } {
  const { col, row } = cellOf(idx);
  const w = (TRACKS[col - 1] / BOARD_UNITS) * 100;
  const h = (TRACKS[row - 1] / BOARD_UNITS) * 100;
  return { x: START[col - 1], y: START[row - 1], w, h };
}

/** Centro da casa, em % do tabuleiro. */
export function centerOf(idx: number): { x: number; y: number } {
  const r = rectOf(idx);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Quantas casas se anda de `from` até `to` seguindo o sentido do jogo. */
export function forwardDistance(from: number, to: number): number {
  return (to - from + SQUARE_COUNT) % SQUARE_COUNT;
}

/** Casas a atravessar até `to` — a peça só "caminha" casa a casa nos deslocamentos curtos (dados). */
export const MAX_WALK = 12;

/**
 * O trajeto de uma peça: as casas por onde passa ao ir de `from` a `to`. Deslocamento curto pra frente
 * (os dados, ou uma carta "avance") caminha casa a casa; o resto (prisão, "volte 3 casas") é um pulo direto.
 */
export function walkPath(from: number, to: number): number[] {
  if (from === to) return [to];
  const d = forwardDistance(from, to);
  if (d > MAX_WALK) return [to];
  return Array.from({ length: d }, (_, i) => (from + i + 1) % SQUARE_COUNT);
}

/** Deslocamento (em % do tabuleiro) de cada peça quando várias dividem a mesma casa. */
export function slotOffset(slot: number, total: number): { dx: number; dy: number } {
  if (total <= 1) return { dx: 0, dy: 0 };
  // até 6 peças numa grade 3×2 centrada na casa
  const cols = total <= 2 ? total : 3;
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  const rows = Math.ceil(total / cols);
  const step = 2.1;
  return { dx: (col - (cols - 1) / 2) * step, dy: (row - (rows - 1) / 2) * step * 1.15 };
}

/** O lado da casa que olha o centro do tabuleiro (onde fica a faixa de cor). */
export function innerEdge(idx: number): "top" | "bottom" | "left" | "right" | null {
  switch (sideOf(idx)) {
    case "bottom":
      return "top";
    case "top":
      return "bottom";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return null;
  }
}
