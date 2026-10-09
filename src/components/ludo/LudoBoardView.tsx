"use client";

import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BASE_ORIGIN,
  BOARD_SIZE,
  COLORS,
  FINISHED,
  HOME_COLUMN,
  IN_BASE,
  LudoColor,
  RING,
  RING_SIZE,
  START_INDEX,
  cellOf,
  isStarRingIndex,
  pieceCenter,
  rotatePoint,
} from "@/lib/ludo/board";
import type { LudoMove, LudoPlayer } from "@/lib/ludo/engine";
import { TIMING } from "@/lib/ludo/timing";
import { LUDO_COLORS } from "./colors";
import { AnimatedView, BoardEffect, MotionKind, pieceKey } from "./useLudoAnimator";

const CELL_PCT = 100 / BOARD_SIZE;

// ── Arte estática do tabuleiro (SVG) ────────────────────────────────────────

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`);
  }
  return pts.join(" ");
}

const BoardArt = memo(function BoardArt({ rotation, activeColor }: { rotation: number; activeColor: LudoColor | null }) {
  const startCells = new Set(COLORS.map((c) => RING[START_INDEX[c]]));
  return (
    <svg viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <filter id="ludo-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.06" stdDeviation="0.05" floodOpacity="0.35" />
        </filter>
      </defs>
      <g transform={`rotate(${rotation * 90} ${BOARD_SIZE / 2} ${BOARD_SIZE / 2})`}>
        <rect width={BOARD_SIZE} height={BOARD_SIZE} rx="0.7" fill="#fbf4e4" />

        {/* bases */}
        {COLORS.map((color) => {
          const t = LUDO_COLORS[color];
          const o = BASE_ORIGIN[color];
          return (
            <g key={color}>
              <rect x={o.col} y={o.row} width="6" height="6" fill={t.main} />
              <rect x={o.col + 0.9} y={o.row + 0.9} width="4.2" height="4.2" rx="0.6" fill="#fffdf6" filter="url(#ludo-soft)" />
              {[[2, 2], [4, 2], [2, 4], [4, 4]].map(([sx, sy], i) => (
                <circle key={i} cx={o.col + sx} cy={o.row + sy} r="0.62" fill={t.soft} stroke={t.main} strokeWidth="0.1" />
              ))}
              {activeColor === color && (
                <rect
                  className="ludo-base-pulse"
                  x={o.col + 0.15}
                  y={o.row + 0.15}
                  width="5.7"
                  height="5.7"
                  rx="0.4"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="0.16"
                />
              )}
            </g>
          );
        })}

        {/* casas do anel */}
        {RING.map((cell, i) => {
          const start = COLORS.find((c) => START_INDEX[c] === i);
          return (
            <rect
              key={i}
              x={cell.col + 0.04}
              y={cell.row + 0.04}
              width="0.92"
              height="0.92"
              rx="0.12"
              fill={start ? LUDO_COLORS[start].main : "#fffdf6"}
              stroke="#cfc6b2"
              strokeWidth="0.05"
            />
          );
        })}

        {/* retas finais */}
        {COLORS.map((color) =>
          HOME_COLUMN[color].map((cell, i) => (
            <rect
              key={`${color}${i}`}
              x={cell.col + 0.04}
              y={cell.row + 0.04}
              width="0.92"
              height="0.92"
              rx="0.12"
              fill={LUDO_COLORS[color].main}
              fillOpacity={0.55 + i * 0.09}
              stroke={LUDO_COLORS[color].dark}
              strokeOpacity="0.4"
              strokeWidth="0.05"
            />
          ))
        )}

        {/* estrelas nas casas seguras */}
        {RING.map((cell, i) =>
          isStarRingIndex(i) ? (
            <polygon key={`s${i}`} points={starPoints(cell.col + 0.5, cell.row + 0.52, 0.34, 0.15)} fill="#c9b27a" />
          ) : null
        )}
        {/* marca nas saídas */}
        {[...startCells].map((cell, i) => (
          <circle key={`m${i}`} cx={cell.col + 0.5} cy={cell.row + 0.5} r="0.22" fill="#fff" fillOpacity="0.85" />
        ))}

        {/* setas de entrada na reta final */}
        {COLORS.map((color) => {
          const entry = RING[(START_INDEX[color] + 50) % RING_SIZE];
          const first = HOME_COLUMN[color][0];
          const angle = (Math.atan2(first.row - entry.row, first.col - entry.col) * 180) / Math.PI;
          return (
            <g key={`a${color}`} transform={`translate(${entry.col + 0.5} ${entry.row + 0.5}) rotate(${angle})`}>
              <polygon points="-0.2,-0.22 0.26,0 -0.2,0.22" fill={LUDO_COLORS[color].main} />
            </g>
          );
        })}

        {/* centro: 4 triângulos */}
        <polygon points="6,6 7.5,7.5 6,9" fill={LUDO_COLORS.red.main} stroke={LUDO_COLORS.red.dark} strokeWidth="0.05" />
        <polygon points="6,6 9,6 7.5,7.5" fill={LUDO_COLORS.green.main} stroke={LUDO_COLORS.green.dark} strokeWidth="0.05" />
        <polygon points="9,6 9,9 7.5,7.5" fill={LUDO_COLORS.blue.main} stroke={LUDO_COLORS.blue.dark} strokeWidth="0.05" />
        <polygon points="6,9 9,9 7.5,7.5" fill={LUDO_COLORS.yellow.main} stroke={LUDO_COLORS.yellow.dark} strokeWidth="0.05" />
        <circle cx="7.5" cy="7.5" r="0.2" fill="#fff" fillOpacity="0.9" />
      </g>
    </svg>
  );
});

// ── Peão ────────────────────────────────────────────────────────────────────

function Pawn({ color, selectable }: { color: LudoColor; selectable: boolean }) {
  const t = LUDO_COLORS[color];
  const gid = `pawn-${color}`;
  return (
    <svg viewBox="0 0 40 52" className="h-full w-full overflow-visible">
      <defs>
        <radialGradient id={gid} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={t.light} />
          <stop offset="55%" stopColor={t.main} />
          <stop offset="100%" stopColor={t.dark} />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="47" rx="14" ry="4.2" fill="#000" opacity="0.28" />
      <path
        d="M15 19c-.5 8-6.5 14-8 23-.4 2.6 1.2 4.6 3.8 4.6h18.4c2.6 0 4.2-2 3.8-4.6-1.5-9-7.5-15-8-23z"
        fill={`url(#${gid})`}
        stroke={t.dark}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="13" r="8" fill={`url(#${gid})`} stroke={t.dark} strokeWidth="1.5" />
      <ellipse cx="16.5" cy="10.5" rx="3" ry="2.2" fill="#fff" opacity="0.6" />
      {selectable && <circle cx="20" cy="13" r="2.3" fill="#fff" opacity="0.9" />}
    </svg>
  );
}

// ── Efeitos ─────────────────────────────────────────────────────────────────

function EffectView({ effect, rotation }: { effect: BoardEffect; rotation: number }) {
  const p = rotatePoint(effect.x, effect.y, rotation);
  const color = LUDO_COLORS[effect.color].main;
  const isCapture = effect.kind === "capture";
  const particles = isCapture ? 12 : 16;
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: `${(p.x / BOARD_SIZE) * 100}%`, top: `${(p.y / BOARD_SIZE) * 100}%`, width: 0, height: 0, zIndex: 60 }}
    >
      <motion.div
        className="absolute rounded-full"
        style={{ left: "-1.5rem", top: "-1.5rem", width: "3rem", height: "3rem", border: `3px solid ${color}` }}
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: isCapture ? 3 : 4, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      {Array.from({ length: particles }).map((_, i) => {
        const angle = (i / particles) * Math.PI * 2;
        const dist = (isCapture ? 2.4 : 3) * (0.8 + (i % 3) * 0.25) * 16;
        return (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: -4,
              top: -4,
              width: 8,
              height: 8,
              background: i % 2 ? color : isCapture ? "#fff" : "#fde047",
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: 0, opacity: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
          />
        );
      })}
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 text-2xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] whitespace-nowrap"
        initial={{ y: 0, scale: 0.4, opacity: 0 }}
        animate={{ y: -34, scale: 1.2, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        {isCapture ? "💥" : "⭐"}
      </motion.div>
    </div>
  );
}

// ── Tabuleiro ───────────────────────────────────────────────────────────────

// Quando várias peças dividem a casa, elas se espalham e encolhem um pouco.
const STACK_LAYOUT: { dx: number; dy: number; scale: number }[][] = [
  [],
  [{ dx: 0, dy: 0, scale: 1 }],
  [{ dx: -0.2, dy: 0, scale: 0.78 }, { dx: 0.2, dy: 0, scale: 0.78 }],
  [{ dx: -0.22, dy: 0.14, scale: 0.7 }, { dx: 0.22, dy: 0.14, scale: 0.7 }, { dx: 0, dy: -0.2, scale: 0.7 }],
  [{ dx: -0.22, dy: -0.2, scale: 0.62 }, { dx: 0.22, dy: -0.2, scale: 0.62 }, { dx: -0.22, dy: 0.22, scale: 0.62 }, { dx: 0.22, dy: 0.22, scale: 0.62 }],
];

interface RenderPiece {
  key: string;
  playerId: string;
  color: LudoColor;
  piece: number;
  progress: number;
  x: number;
  y: number;
  scale: number;
}

function transitionFor(kind: MotionKind) {
  switch (kind) {
    case "step":
      return { duration: (TIMING.STEP_MS / 1000) * 0.92, ease: "easeInOut" as const };
    case "exit":
      return { type: "spring" as const, stiffness: 240, damping: 20 };
    case "return":
      return { duration: (TIMING.CAPTURE_MS / 1000) * 0.9, ease: [0.3, 0, 0.2, 1] as [number, number, number, number] };
    default:
      return { duration: 0 };
  }
}

interface LudoBoardViewProps {
  view: AnimatedView;
  players: LudoPlayer[];
  /** Giros de 90° aplicados na exibição (deixa a cor do jogador embaixo à esquerda). */
  rotation: number;
  activeColor: LudoColor | null;
  /** Jogadas que o usuário pode escolher agora (vazio = nada clicável). */
  moves: LudoMove[];
  myColor: LudoColor | null;
  onMove: (piece: number) => void;
}

export function LudoBoardView({ view, players, rotation, activeColor, moves, myColor, onMove }: LudoBoardViewProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const canPick = moves.length > 0 && !view.busy && myColor !== null;
  const movable = useMemo(() => new Set(canPick ? moves.map((m) => m.piece) : []), [canPick, moves]);

  const pieces = useMemo<RenderPiece[]>(() => {
    // Primeiro agrupa por casa pra saber quantas dividem cada uma.
    const byCell = new Map<string, { playerId: string; color: LudoColor; piece: number; progress: number }[]>();
    const all: { playerId: string; color: LudoColor; piece: number; progress: number; cellKey: string | null }[] = [];
    for (const p of players) {
      const progresses = view.pieces[p.id] ?? p.pieces;
      progresses.forEach((progress, piece) => {
        const cell = cellOf(p.color, progress);
        const cellKey = cell ? `${cell.col},${cell.row}` : null;
        const entry = { playerId: p.id, color: p.color, piece, progress, cellKey };
        all.push(entry);
        if (cellKey) byCell.set(cellKey, [...(byCell.get(cellKey) ?? []), entry]);
      });
    }
    return all.map((e) => {
      const base = pieceCenter(e.color, e.progress, e.piece);
      const rotated = rotatePoint(base.x, base.y, rotation);
      let dx = 0;
      let dy = 0;
      let scale = e.progress === FINISHED ? 0.62 : e.progress === IN_BASE ? 1.05 : 1;
      if (e.cellKey) {
        const group = byCell.get(e.cellKey)!.sort((a, b) => (a.playerId + a.piece).localeCompare(b.playerId + b.piece));
        const layout = STACK_LAYOUT[Math.min(group.length, 4)];
        const slot = layout[group.findIndex((g) => g.playerId === e.playerId && g.piece === e.piece)];
        if (slot) {
          dx = slot.dx;
          dy = slot.dy;
          scale = slot.scale;
        }
      }
      return {
        key: pieceKey(e.playerId, e.piece),
        playerId: e.playerId,
        color: e.color,
        piece: e.piece,
        progress: e.progress,
        x: rotated.x + dx,
        y: rotated.y + dy,
        scale,
      };
    });
  }, [view.pieces, players, rotation]);

  const markers = useMemo(() => {
    if (!canPick || !myColor) return [];
    return moves.map((m) => {
      const c = pieceCenter(myColor, m.to, m.piece);
      const r = rotatePoint(c.x, c.y, rotation);
      return { piece: m.piece, x: r.x, y: r.y };
    });
  }, [canPick, moves, myColor, rotation]);

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-[3.2%] shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-4 ring-white/15">
      <BoardArt rotation={rotation} activeColor={activeColor} />

      {/* destinos possíveis */}
      {markers.map((m) => (
        <div
          key={`m${m.piece}`}
          className="pointer-events-none absolute"
          style={{ left: `${(m.x - 0.5) * CELL_PCT}%`, top: `${(m.y - 0.5) * CELL_PCT}%`, width: `${CELL_PCT}%`, height: `${CELL_PCT}%`, zIndex: 5 }}
        >
          <div
            className="absolute inset-[12%] rounded-full ludo-marker"
            style={{
              background: `${LUDO_COLORS[myColor!].main}${hovered === m.piece ? "cc" : "55"}`,
              border: `2px dashed ${LUDO_COLORS[myColor!].dark}`,
              transform: hovered === m.piece ? "scale(1.15)" : undefined,
            }}
          />
        </div>
      ))}

      {/* peças */}
      {pieces.map((p) => {
          const kind = view.motion[p.key] ?? "snap";
          const isHop = view.hop?.playerId === p.playerId && view.hop.piece === p.piece;
          const selectable = movable.has(p.piece) && p.color === myColor;
          const returning = kind === "return";
          return (
            <motion.div
              key={p.key}
              className="absolute left-0 top-0"
              style={{ width: `${CELL_PCT}%`, height: `${CELL_PCT}%`, zIndex: isHop || returning ? 40 : 10 + Math.round(p.y) }}
              initial={false}
              animate={{ x: `${(p.x - 0.5) * 100}%`, y: `${(p.y - 0.5) * 100}%` }}
              transition={transitionFor(kind)}
            >
              <motion.div
                key={isHop ? `hop-${view.hop?.key}` : returning ? `ret-${view.diceKey}-${p.progress}` : "still"}
                className="h-full w-full"
                initial={{ y: "0%", scale: isHop && kind === "exit" ? 0.5 : 1 }}
                animate={
                  isHop
                    ? kind === "exit"
                      ? { y: ["0%", "-60%", "0%"], scale: [0.5, 1.35, 1] }
                      : { y: ["0%", "-55%", "0%"], scale: [1, 1.22, 1] }
                    : returning
                      ? { y: ["0%", "-130%", "0%"], scale: [1, 1.5, 1], rotate: [0, 200, 360] }
                      : { y: "0%", scale: 1 }
                }
                transition={
                  isHop
                    ? { duration: (kind === "exit" ? TIMING.EXIT_MS : TIMING.STEP_MS) / 1000, ease: "easeOut" }
                    : returning
                      ? { duration: (TIMING.CAPTURE_MS / 1000) * 0.9, ease: "easeInOut" }
                      : { duration: 0 }
                }
              >
                <div
                  className="relative h-full w-full"
                  style={{ transform: `scale(${p.scale})`, transition: kind === "snap" ? "none" : "transform 0.25s" }}
                >
                  {selectable ? (
                    <button
                      type="button"
                      aria-label={`Mover peça ${p.piece + 1}`}
                      onClick={() => onMove(p.piece)}
                      onMouseEnter={() => setHovered(p.piece)}
                      onMouseLeave={() => setHovered((h) => (h === p.piece ? null : h))}
                      onFocus={() => setHovered(p.piece)}
                      onBlur={() => setHovered((h) => (h === p.piece ? null : h))}
                      className="pointer-events-auto absolute -inset-[35%] z-10 flex cursor-pointer items-center justify-center rounded-full outline-none"
                    >
                      <span
                        className="absolute inset-[21%] rounded-full"
                        style={{
                          background: `${LUDO_COLORS[p.color].light}66`,
                          border: "2.5px solid #fff",
                          boxShadow: `0 0 0 1.5px ${LUDO_COLORS[p.color].dark}, 0 0 14px 2px ${LUDO_COLORS[p.color].main}`,
                        }}
                      />
                      <span
                        className="absolute inset-[21%] rounded-full ludo-ping"
                        style={{ border: `2.5px solid ${LUDO_COLORS[p.color].light}` }}
                      />
                      <span className="ludo-bob block h-[52%] w-[52%]">
                        <Pawn color={p.color} selectable />
                      </span>
                    </button>
                  ) : (
                    <Pawn color={p.color} selectable={false} />
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })}

      <AnimatePresence>
        {view.effects.map((e) => (
          <EffectView key={e.id} effect={e} rotation={rotation} />
        ))}
      </AnimatePresence>
    </div>
  );
}
