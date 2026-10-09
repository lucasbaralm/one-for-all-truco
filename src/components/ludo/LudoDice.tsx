"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TIMING } from "@/lib/ludo/timing";
import type { ColorTokens } from "./colors";

// Dado 3D de verdade (um cubo CSS com 6 faces): ao rolar ele gira e cai já na
// face certa — o servidor decide o valor, aqui só se desenha o giro até ele.
// Faces opostas somam 7. O cubo usa o tamanho de `--dice` (definido por quem
// o coloca), então o mesmo componente serve pro painel pequeno e pro grande.

// Rotação do cubo que deixa cada valor virado pra frente.
const ORIENTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

// Transformação de cada face em relação à frente do cubo.
const FACE: Record<number, string> = {
  1: "",
  6: "rotateY(180deg)",
  2: "rotateY(90deg)",
  5: "rotateY(-90deg)",
  3: "rotateX(90deg)",
  4: "rotateX(-90deg)",
};

// Posições dos pontinhos numa grade 3x3 (coluna, linha).
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function Face({ value }: { value: number }) {
  return (
    <div
      className="absolute inset-0 rounded-[22%] border border-black/10 bg-gradient-to-br from-white to-zinc-200 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.12)]"
      style={{ transform: `${FACE[value]} translateZ(calc(var(--dice) / 2))` }}
    >
      <div className="absolute inset-[14%] grid grid-cols-3 grid-rows-3">
        {PIPS[value].map(([c, r], i) => (
          <span
            key={i}
            className="m-auto rounded-full"
            style={{
              gridColumn: c + 1,
              gridRow: r + 1,
              width: "62%",
              height: "62%",
              background: value === 1 ? "#dc2626" : "#1f2937",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface LudoDiceProps {
  /** Valor rolado (null = ainda não rolou nesta jogada). */
  value: number | null;
  rolling: boolean;
  /** Muda a cada rolada: faz o cubo dar voltas novas até a próxima face. */
  rollKey: number;
  canRoll: boolean;
  onRoll?: () => void;
  color: ColorTokens;
}

export function LudoDice({ value, rolling, rollKey, canRoll, onRoll, color }: LudoDiceProps) {
  // Mantém a última face enquanto não há valor novo (o cubo não "zera").
  const [lastValue, setLastValue] = useState(1);
  if (value && value !== lastValue) setLastValue(value);
  const face = value ?? lastValue;
  const o = ORIENTATION[face];

  // 720°/1080° a mais por rolada: o cubo sempre gira pra frente e cai na face certa.
  const rx = o.x + 720 * rollKey;
  const ry = o.y + 1080 * rollKey;

  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!canRoll}
      aria-label={canRoll ? "Rolar o dado" : value ? `Dado: ${value}` : "Dado"}
      className="relative shrink-0 rounded-xl outline-none disabled:cursor-default"
      style={{ width: "var(--dice)", height: "var(--dice)", perspective: "calc(var(--dice) * 6)" }}
    >
      {canRoll && (
        <>
          <span
            className="absolute -inset-1.5 rounded-2xl ludo-ping"
            style={{ border: `2px solid ${color.main}`, boxShadow: `0 0 14px ${color.main}` }}
          />
          <span
            className="absolute left-1/2 -top-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 text-[0.6rem] font-black uppercase tracking-wide whitespace-nowrap shadow-md"
            style={{ background: color.main, color: color.ink }}
          >
            Rolar!
          </span>
        </>
      )}
      <motion.div
        className="absolute inset-0"
        animate={rolling ? { y: ["0%", "-38%", "0%", "-14%", "0%"], scale: [1, 1.18, 1, 1.06, 1] } : { y: "0%", scale: 1 }}
        transition={{ duration: TIMING.DICE_MS / 1000, ease: "easeOut" }}
        style={{ opacity: value === null && !rolling ? 0.55 : 1 }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateX: rx, rotateY: ry }}
          transition={rolling ? { duration: TIMING.DICE_MS / 1000, ease: [0.15, 0.7, 0.2, 1] } : { duration: 0 }}
        >
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <Face key={v} value={v} />
          ))}
        </motion.div>
      </motion.div>
    </button>
  );
}
