"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FINISHED, IN_BASE, LudoColor, pieceCenter } from "@/lib/ludo/board";
import type { LudoState } from "@/lib/ludo/engine";
import { TIMING, moveAnimationMs } from "@/lib/ludo/timing";
import { TrailPoint, trailPoints } from "@/lib/ludo/trail";
import { sfx } from "./sfx";

// O servidor manda estados "de uma vez" (o dado já rolado, a peça já na casa
// nova). Pra isso virar animação — dado girando, peça pulando casa por casa,
// captura voando de volta pra base — este hook mantém uma fila de estados e
// os "toca" em ordem: o que a tela mostra (`view`) fica um pouco atrás do
// estado real até a animação de cada passo terminar.

export type MotionKind = "step" | "exit" | "return" | "snap";

export interface BoardEffect {
  id: number;
  kind: "capture" | "home";
  /** Em unidades de casa, no tabuleiro "canônico" (antes de girar pra exibição). */
  x: number;
  y: number;
  color: LudoColor;
}

/** Rastro da última jogada: o caminho percorrido, desenhado e depois apagado devagar. */
export interface BoardTrail {
  id: number;
  color: LudoColor;
  /** Centros das casas, no tabuleiro "canônico" (antes de girar pra exibição). */
  points: TrailPoint[];
  /** Quanto tempo o traço leva pra ser desenhado (acompanha a peça andando). */
  drawMs: number;
}

/** Depois de desenhado, o rastro fica visível por esse tempo antes de sumir. */
export const TRAIL_LINGER_MS = 2400;

export interface AnimatedView {
  /** Último estado já "mostrado" (turno, fase, jogadas legais...). */
  state: LudoState | null;
  /** Progresso de cada peça como está desenhada agora (por id de jogador). */
  pieces: Record<string, number[]>;
  /** Como cada peça deve se mover até a próxima posição. Chave: `${id}:${piece}`. */
  motion: Record<string, MotionKind>;
  /** Peça que está pulando agora (destaque + pulinho). */
  hop: { key: number; playerId: string; piece: number } | null;
  dice: number | null;
  diceRolling: boolean;
  diceKey: number;
  /** Tem animação rolando: nada de clique no dado/peças nesse meio tempo. */
  busy: boolean;
  effects: BoardEffect[];
  trail: BoardTrail | null;
}

export const pieceKey = (playerId: string, piece: number) => `${playerId}:${piece}`;

/**
 * Como passar do último estado mostrado (`prev`) pro que acabou de chegar:
 *  • "move" / "roll" — anima UMA jogada ou UMA rolada, e só se o próximo estado
 *    é exatamente o seguinte (contador +1);
 *  • "snapshot" — pula direto: primeira tela, aba escondida (os timers dela
 *    atrasam), outra partida, lobby, ou contadores que pularam (reconexão).
 */
export function planTransition(prev: LudoState | null, next: LudoState, hidden: boolean): "snapshot" | "move" | "roll" {
  if (!prev || hidden || next.gameNumber !== prev.gameNumber || next.phase === "lobby" || prev.phase === "lobby") {
    return "snapshot";
  }
  if (next.moveSeq === prev.moveSeq + 1 && next.lastMove) return "move";
  if (next.rollSeq === prev.rollSeq + 1 && next.lastRoll) return "roll";
  return "snapshot";
}

export function snapshot(state: LudoState | null): AnimatedView {
  const pieces: Record<string, number[]> = {};
  const motion: AnimatedView["motion"] = {};
  state?.players.forEach((p) => {
    pieces[p.id] = [...p.pieces];
    p.pieces.forEach((_, i) => {
      motion[pieceKey(p.id, i)] = "snap";
    });
  });
  return {
    state,
    pieces,
    motion,
    hop: null,
    dice: state?.dice ?? null,
    diceRolling: false,
    diceKey: state?.rollSeq ?? 0,
    busy: false,
    effects: [],
    trail: null,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let effectSeq = 0;
let hopSeq = 0;
let trailSeq = 0;

export function useLudoAnimator(incoming: LudoState | null): AnimatedView {
  const [view, setViewState] = useState<AnimatedView>(() => snapshot(incoming));
  const viewRef = useRef(view);
  const queueRef = useRef<LudoState[]>([]);
  const processingRef = useRef(false);
  const shownRef = useRef<LudoState | null>(incoming);
  const lastIncomingRef = useRef<LudoState | null>(incoming);
  const aliveRef = useRef(true);

  const setView = useCallback((next: AnimatedView | ((v: AnimatedView) => AnimatedView)) => {
    const value = typeof next === "function" ? next(viewRef.current) : next;
    viewRef.current = value;
    setViewState(value);
  }, []);

  const show = useCallback(
    (state: LudoState) => {
      shownRef.current = state;
      // Efeitos em andamento (explosões) e o rastro sobrevivem ao snapshot: eles se apagam sozinhos.
      setView((v) => ({ ...snapshot(state), effects: v.effects, trail: v.trail }));
    },
    [setView]
  );

  const addEffect = useCallback(
    (effect: Omit<BoardEffect, "id">, ms: number) => {
      const id = ++effectSeq;
      setView((v) => ({ ...v, effects: [...v.effects, { ...effect, id }] }));
      setTimeout(() => {
        if (aliveRef.current) setView((v) => ({ ...v, effects: v.effects.filter((e) => e.id !== id) }));
      }, ms);
    },
    [setView]
  );

  const addTrail = useCallback(
    (trail: Omit<BoardTrail, "id">) => {
      const id = ++trailSeq;
      setView((v) => ({ ...v, trail: { ...trail, id } }));
      setTimeout(() => {
        if (aliveRef.current) setView((v) => (v.trail?.id === id ? { ...v, trail: null } : v));
      }, trail.drawMs + TRAIL_LINGER_MS);
    },
    [setView]
  );

  const animateRoll = useCallback(
    async (prev: LudoState, next: LudoState) => {
      sfx.roll();
      setView((v) => ({
        ...v,
        state: prev,
        dice: next.dice,
        diceRolling: true,
        diceKey: next.rollSeq,
        busy: true,
      }));
      await sleep(TIMING.DICE_MS);
      if (!aliveRef.current) return;
      if (next.dice) sfx.rollResult(next.dice);
      show(next);
    },
    [setView, show]
  );

  const animateMove = useCallback(
    async (prev: LudoState, next: LudoState) => {
      const lm = next.lastMove;
      if (!lm) {
        show(next);
        return;
      }
      const mover = prev.players.find((p) => p.id === lm.playerId);
      if (!mover) {
        show(next);
        return;
      }
      const key = pieceKey(mover.id, lm.piece);
      const setMoverProgress = (progress: number, kind: MotionKind) =>
        setView((v) => ({
          ...v,
          busy: true,
          pieces: { ...v.pieces, [mover.id]: v.pieces[mover.id].map((x, i) => (i === lm.piece ? progress : x)) },
          motion: { ...v.motion, [key]: kind },
          hop: { key: ++hopSeq, playerId: mover.id, piece: lm.piece },
        }));

      setView((v) => ({ ...v, busy: true }));
      addTrail({
        color: mover.color,
        points: trailPoints(mover.color, lm.piece, lm.from, lm.to),
        drawMs: Math.max(250, moveAnimationMs({ ...lm, captures: [], finished: false })),
      });

      if (lm.from === IN_BASE) {
        sfx.exitBase();
        setMoverProgress(lm.to, "exit");
        await sleep(TIMING.EXIT_MS);
      } else {
        for (let p = lm.from + 1; p <= lm.to; p++) {
          if (!aliveRef.current) return;
          sfx.step(p - lm.from);
          setMoverProgress(p, "step");
          await sleep(TIMING.STEP_MS);
        }
      }
      if (!aliveRef.current) return;

      if (lm.finished) {
        sfx.home();
        addEffect({ kind: "home", ...pieceCenter(mover.color, FINISHED, lm.piece), color: mover.color }, 1400);
        await sleep(TIMING.HOME_MS);
      }

      if (lm.captures.length > 0) {
        sfx.capture();
        const where = pieceCenter(mover.color, lm.to);
        addEffect({ kind: "capture", x: where.x, y: where.y, color: mover.color }, 1100);
        setView((v) => {
          const pieces = { ...v.pieces };
          const motion = { ...v.motion };
          for (const c of lm.captures) {
            pieces[c.playerId] = pieces[c.playerId].map((x, i) => (i === c.piece ? IN_BASE : x));
            motion[pieceKey(c.playerId, c.piece)] = "return";
          }
          return { ...v, pieces, motion, hop: null };
        });
        await sleep(TIMING.CAPTURE_MS);
      }
      if (!aliveRef.current) return;
      show(next);
    },
    [addEffect, addTrail, setView, show]
  );

  const transition = useCallback(
    async (prev: LudoState | null, next: LudoState) => {
      const hidden = typeof document !== "undefined" && document.hidden;
      const plan = planTransition(prev, next, hidden);
      if (plan === "move") await animateMove(prev!, next);
      else if (plan === "roll") await animateRoll(prev!, next);
      else show(next);
    },
    [animateMove, animateRoll, show]
  );

  const pump = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0 && aliveRef.current) {
        // Muito atrasado (aba em segundo plano, conexão que voltou): pula pro estado atual.
        if (queueRef.current.length > 3) {
          const latest = queueRef.current[queueRef.current.length - 1];
          queueRef.current = [];
          show(latest);
          break;
        }
        const next = queueRef.current.shift()!;
        await transition(shownRef.current, next);
      }
    } finally {
      processingRef.current = false;
    }
  }, [show, transition]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!incoming || incoming === lastIncomingRef.current) return;
    lastIncomingRef.current = incoming;
    queueRef.current.push(incoming);
    void pump();
  }, [incoming, pump]);

  return view;
}
