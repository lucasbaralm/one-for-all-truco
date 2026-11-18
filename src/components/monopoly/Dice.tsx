"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TIMING } from "@/lib/monopoly/timing";

// Os dois dados: ao chegar uma rolada nova eles chacoalham (faces trocando) e caem nos valores que o
// servidor sorteou — a tela só desenha o giro. Pontinhos numa grade 3×3, como o dado do Ludo.

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function Die({ value, rolling, tilt }: { value: number; rolling: boolean; tilt: number }) {
  return (
    <motion.div
      data-mono-die={value}
      className="relative shrink-0 rounded-[18%] border border-black/15 bg-gradient-to-br from-white to-zinc-200 shadow-[0_3px_8px_rgba(0,0,0,0.35),inset_0_-3px_5px_rgba(0,0,0,0.12)]"
      style={{ width: "var(--die)", height: "var(--die)" }}
      animate={rolling ? { rotate: [tilt, tilt + 200, tilt + 380, tilt + 540], y: [0, -14, 0, -5, 0], scale: [1, 1.12, 1, 1.04, 1] } : { rotate: tilt, y: 0, scale: 1 }}
      transition={{ duration: TIMING.DICE_MS / 1000, ease: "easeOut" }}
    >
      <div className="absolute inset-[13%] grid grid-cols-3 grid-rows-3">
        {PIPS[value].map(([c, r], i) => (
          <span
            key={i}
            className="m-auto rounded-full"
            style={{ gridColumn: c + 1, gridRow: r + 1, width: "64%", height: "64%", background: value === 1 ? "#dc2626" : "#1f2937", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/** `rollKey` sobe a cada rolada nova (é o eventSeq da jogada); `dice` é o resultado final. */
export function DicePair({ dice, rollKey, animate }: { dice: [number, number] | null; rollKey: number; animate: boolean }) {
  const [shown, setShown] = useState<[number, number]>(dice ?? [1, 1]);
  const [rolling, setRolling] = useState(false);
  const lastKey = useRef(rollKey);

  useEffect(() => {
    // Só chacoalha quando a rolada é nova DE VERDADE (não na primeira tela de quem recarregou).
    if (!dice) return;
    if (lastKey.current === rollKey || !animate) {
      setShown(dice);
      lastKey.current = rollKey;
      return;
    }
    lastKey.current = rollKey;
    setRolling(true);
    const spin = setInterval(() => setShown([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 85);
    const stop = setTimeout(() => {
      clearInterval(spin);
      setShown(dice);
      setRolling(false);
    }, TIMING.DICE_MS);
    return () => {
      clearInterval(spin);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, dice?.[0], dice?.[1], animate]);

  return (
    <div className="flex items-center justify-center" style={{ gap: "calc(var(--die) * 0.35)" }} data-mono-dice={dice ? `${dice[0]}+${dice[1]}` : ""} data-rolling={rolling ? "true" : "false"}>
      <Die value={shown[0]} rolling={rolling} tilt={-8} />
      <Die value={shown[1]} rolling={rolling} tilt={10} />
    </div>
  );
}
