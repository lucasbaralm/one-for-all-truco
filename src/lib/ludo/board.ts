// Geometria do tabuleiro de Ludo — tudo que é "onde fica cada casa" mora aqui,
// separado das regras (engine.ts) pra poder ser testado e reusado pela UI.
//
// O tabuleiro é uma grade 15x15 em forma de cruz. Coordenadas são (col, row),
// com row 0 no topo. Um anel de 52 casas dá a volta; cada cor entra no anel
// na sua casa de saída, percorre 51 casas e vira pra dentro da sua reta final
// (5 casas coloridas + a casa "casa" no centro).

export type LudoColor = "red" | "green" | "blue" | "yellow";

// Ordem de turno = sentido horário no tabuleiro.
export const COLORS: LudoColor[] = ["red", "green", "blue", "yellow"];

export const PIECES_PER_PLAYER = 4;

// Progresso de uma peça (relativo à cor dela):
//  -1        → na base (ainda não saiu)
//   0..50    → no anel principal (0 = casa de saída da cor)
//   51..55   → reta final colorida
//   56       → em casa (chegou)
export const IN_BASE = -1;
export const RING_LAST = 50;
export const HOME_COLUMN_START = 51;
export const FINISHED = 56;

export const RING_SIZE = 52;

export interface Cell {
  col: number;
  row: number;
}

// Anel de 52 casas, em sentido horário, começando na saída do vermelho.
export const RING: readonly Cell[] = buildRing();

function buildRing(): Cell[] {
  const cells: Cell[] = [];
  const push = (col: number, row: number) => cells.push({ col, row });

  for (let c = 1; c <= 5; c++) push(c, 6); // braço esquerdo, linha de cima → direita
  for (let r = 5; r >= 0; r--) push(6, r); // braço de cima, coluna esquerda → sobe
  push(7, 0);
  push(8, 0); // topo
  for (let r = 1; r <= 5; r++) push(8, r); // braço de cima, coluna direita → desce
  for (let c = 9; c <= 14; c++) push(c, 6); // braço direito, linha de cima → direita
  push(14, 7);
  push(14, 8); // ponta direita
  for (let c = 13; c >= 9; c--) push(c, 8); // braço direito, linha de baixo ← esquerda
  for (let r = 9; r <= 14; r++) push(8, r); // braço de baixo, coluna direita → desce
  push(7, 14);
  push(6, 14); // fundo
  for (let r = 13; r >= 9; r--) push(6, r); // braço de baixo, coluna esquerda → sobe
  for (let c = 5; c >= 0; c--) push(c, 8); // braço esquerdo, linha de baixo ← esquerda
  push(0, 7);
  push(0, 6); // ponta esquerda
  return cells;
}

// Índice no anel da casa de saída de cada cor (a cada 13 casas).
export const START_INDEX: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  blue: 26,
  yellow: 39,
};

// Reta final de cada cor: 5 casas, da entrada até o centro.
export const HOME_COLUMN: Record<LudoColor, readonly Cell[]> = {
  red: [1, 2, 3, 4, 5].map((c) => ({ col: c, row: 7 })),
  green: [1, 2, 3, 4, 5].map((r) => ({ col: 7, row: r })),
  blue: [13, 12, 11, 10, 9].map((c) => ({ col: c, row: 7 })),
  yellow: [13, 12, 11, 10, 9].map((r) => ({ col: 7, row: r })),
};

// Casa "em casa" (centro) — peças que chegaram se enfileiram no lado da cor.
export const CENTER: Cell = { col: 7, row: 7 };
const FINISH_DIRECTION: Record<LudoColor, { dx: number; dy: number }> = {
  red: { dx: -1, dy: 0 },
  green: { dx: 0, dy: -1 },
  blue: { dx: 1, dy: 0 },
  yellow: { dx: 0, dy: 1 },
};

// Canto (origem do quadrado 6x6) da base de cada cor.
export const BASE_ORIGIN: Record<LudoColor, Cell> = {
  red: { col: 0, row: 0 },
  green: { col: 9, row: 0 },
  blue: { col: 9, row: 9 },
  yellow: { col: 0, row: 9 },
};

// Os 4 encaixes da base, em unidades de casa (centro do encaixe).
const BASE_SLOT_OFFSETS = [
  { x: 2, y: 2 },
  { x: 4, y: 2 },
  { x: 2, y: 4 },
  { x: 4, y: 4 },
];

// Casas seguras: as 4 saídas + as 4 estrelas (8 casas depois de cada saída).
export const SAFE_RING_INDEXES: ReadonlySet<number> = new Set(
  COLORS.flatMap((c) => [START_INDEX[c], (START_INDEX[c] + 8) % RING_SIZE])
);

export function isSafeRingIndex(index: number): boolean {
  return SAFE_RING_INDEXES.has(index);
}

export function isStarRingIndex(index: number): boolean {
  return SAFE_RING_INDEXES.has(index) && !COLORS.some((c) => START_INDEX[c] === index);
}

/** Índice absoluto no anel pra uma peça no anel (progress 0..50) da cor. */
export function ringIndexOf(color: LudoColor, progress: number): number {
  return (START_INDEX[color] + progress) % RING_SIZE;
}

export function isOnRing(progress: number): boolean {
  return progress >= 0 && progress <= RING_LAST;
}

/**
 * Posição (em unidades de casa, com o centro da casa em +0.5) de uma peça.
 * `slot` é só usado pra base e pra chegada (várias peças dividem o mesmo lugar).
 */
export function pieceCenter(color: LudoColor, progress: number, slot = 0): { x: number; y: number } {
  if (progress === IN_BASE) {
    const o = BASE_ORIGIN[color];
    const s = BASE_SLOT_OFFSETS[slot % BASE_SLOT_OFFSETS.length];
    return { x: o.col + s.x, y: o.row + s.y };
  }
  if (progress === FINISHED) {
    const d = FINISH_DIRECTION[color];
    // Enfileira perpendicular à direção do triângulo da cor, bem perto do centro.
    const spread = (slot - (PIECES_PER_PLAYER - 1) / 2) * 0.32;
    return {
      x: CENTER.col + 0.5 + d.dx * 0.62 + (d.dy !== 0 ? spread : 0),
      y: CENTER.row + 0.5 + d.dy * 0.62 + (d.dx !== 0 ? spread : 0),
    };
  }
  const cell = progress >= HOME_COLUMN_START
    ? HOME_COLUMN[color][progress - HOME_COLUMN_START]
    : RING[ringIndexOf(color, progress)];
  return { x: cell.col + 0.5, y: cell.row + 0.5 };
}

/** Casa (inteira) onde a peça está, ou null se está na base/em casa. */
export function cellOf(color: LudoColor, progress: number): Cell | null {
  if (progress === IN_BASE || progress === FINISHED) return null;
  return progress >= HOME_COLUMN_START
    ? HOME_COLUMN[color][progress - HOME_COLUMN_START]
    : RING[ringIndexOf(color, progress)];
}

export const BOARD_SIZE = 15;

/**
 * Gira um ponto da grade 15x15 em `quarterTurns` giros de 90° no sentido
 * horário — usado pra colocar a cor do jogador sempre no canto de baixo à
 * esquerda, sem mudar nenhuma regra (só a exibição).
 */
export function rotatePoint(x: number, y: number, quarterTurns: number): { x: number; y: number } {
  let px = x;
  let py = y;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    const nx = BOARD_SIZE - py;
    const ny = px;
    px = nx;
    py = ny;
  }
  return { x: px, y: py };
}

export const COLOR_LABEL: Record<LudoColor, string> = {
  red: "Vermelho",
  green: "Verde",
  blue: "Azul",
  yellow: "Amarelo",
};
