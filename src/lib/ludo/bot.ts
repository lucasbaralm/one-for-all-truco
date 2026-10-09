// IA dos bots do Ludo. Três níveis:
//  • easy   — joga qualquer peça possível, ao acaso.
//  • medium — prioriza o que é óbvio (capturar, chegar em casa, sair da base,
//             cair em casa segura) mas ignora o perigo.
//  • hard   — o mesmo, mais: foge de peças que estão ameaçadas, evita parar
//             onde pode ser capturada e valoriza capturar peças adiantadas.

import {
  FINISHED,
  HOME_COLUMN_START,
  IN_BASE,
  LudoColor,
  RING_SIZE,
  isOnRing,
  isSafeRingIndex,
  ringIndexOf,
} from "./board";
import { BotLevel, LudoMove, LudoPlayer, LudoState, currentPlayer, legalMoves } from "./engine";

type Rng = () => number;

/** Peças adversárias no anel, com o índice absoluto de cada uma. */
function opponentRingPieces(state: LudoState, me: LudoPlayer): { ring: number; progress: number }[] {
  const out: { ring: number; progress: number }[] = [];
  for (const p of state.players) {
    if (p.id === me.id) continue;
    for (const progress of p.pieces) {
      if (isOnRing(progress)) out.push({ ring: ringIndexOf(p.color, progress), progress });
    }
  }
  return out;
}

/** Quantas peças minhas ocupam a casa do anel (barreira = 2+). */
function myPiecesAtRing(me: LudoPlayer, ring: number, ignorePiece = -1): number {
  return me.pieces.filter(
    (pr, i) => i !== ignorePiece && isOnRing(pr) && ringIndexOf(me.color, pr) === ring
  ).length;
}

/**
 * Chance aproximada (0..1) de a casa `ring` ser atacada na próxima rolada
 * adversária: conta quantas distâncias distintas (1..6) separam um adversário
 * dela. Casa segura ou barreira não corre risco.
 */
function threatAt(state: LudoState, me: LudoPlayer, ring: number, ignorePiece: number): number {
  if (isSafeRingIndex(ring)) return 0;
  if (myPiecesAtRing(me, ring, ignorePiece) >= 1) return 0; // ficaria em barreira
  const distances = new Set<number>();
  for (const opp of opponentRingPieces(state, me)) {
    const d = (ring - opp.ring + RING_SIZE) % RING_SIZE;
    if (d >= 1 && d <= 6) distances.add(d);
  }
  return distances.size / 6;
}

function capturedValue(state: LudoState, me: LudoPlayer, move: LudoMove): number {
  if (!isOnRing(move.to)) return 0;
  const ring = ringIndexOf(me.color, move.to);
  if (isSafeRingIndex(ring)) return 0;
  let best = 0;
  for (const other of state.players) {
    if (other.id === me.id) continue;
    const here = other.pieces.filter((pr) => isOnRing(pr) && ringIndexOf(other.color, pr) === ring);
    if (here.length === 1) best = Math.max(best, here[0] + 1);
  }
  return best;
}

function scoreMove(state: LudoState, me: LudoPlayer, move: LudoMove, level: BotLevel): number {
  let score = 0;
  const color: LudoColor = me.color;

  if (move.to === FINISHED) score += 120;

  const victim = capturedValue(state, me, move);
  if (victim > 0) score += 90 + victim; // quanto mais adiantada a vítima, melhor

  if (move.from === IN_BASE) score += 55;

  if (move.to >= HOME_COLUMN_START && move.from < HOME_COLUMN_START) score += 30; // entrou na reta final
  if (isOnRing(move.to) && isSafeRingIndex(ringIndexOf(color, move.to))) score += 14;
  if (isOnRing(move.to) && myPiecesAtRing(me, ringIndexOf(color, move.to), move.piece) >= 1) score += 8;

  // Avançar a peça mais adiantada ajuda a fechar; avançar em geral sempre ajuda.
  score += move.to * 0.15 + (move.to - move.from) * 0.4;

  if (level === "hard") {
    if (isOnRing(move.from)) {
      const before = threatAt(state, me, ringIndexOf(color, move.from), move.piece);
      // Fugir de uma ameaça vale mais quanto mais caminho a peça já andou.
      score += before * (20 + move.from * 0.5);
    }
    if (isOnRing(move.to)) {
      const after = threatAt(state, me, ringIndexOf(color, move.to), move.piece);
      score -= after * (30 + move.to * 0.6);
    }
  }
  return score;
}

/** Escolhe qual peça mexer entre as jogadas legais do jogador da vez. */
export function chooseBotMove(state: LudoState, level: BotLevel, rng: Rng = Math.random): number | null {
  const me = currentPlayer(state);
  const moves = legalMoves(state);
  if (!me || moves.length === 0) return null;
  if (moves.length === 1) return moves[0].piece;

  if (level === "easy") return moves[Math.floor(rng() * moves.length)].piece;

  // Um pouco de ruído desempata jogadas parecidas (e deixa o nível médio menos previsível).
  const noise = level === "medium" ? 6 : 1.5;
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const s = scoreMove(state, me, move, level) + rng() * noise;
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  return best.piece;
}

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};
