"use client";

/* Aparece e some em reação ao dado rolando — por isso o efeito atualiza estado. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ColorTokens } from "./colors";
import { LudoDice } from "./LudoDice";
import type { AnimatedView } from "./useLudoAnimator";

// O dado grande no CENTRO do tabuleiro, onde o olho está: na sua vez ele pede o
// clique ("Rolar!"); na vez dos outros ele rola ali, mostra o número por um
// instante e some (o número continua no painel de quem jogou). Fica sempre
// montado, só muda de opacidade — um cubo montado já na face final não giraria.

/** Quanto tempo o número fica no centro depois que o dado para. */
export const RESULT_LINGER_MS = 1100;

interface LudoCenterDiceProps {
  view: AnimatedView;
  canRoll: boolean;
  onRoll: () => void;
  color: ColorTokens;
}

export function LudoCenterDice({ view, canRoll, onRoll, color }: LudoCenterDiceProps) {
  const [lingering, setLingering] = useState(false);
  const wasRolling = useRef(false);

  useEffect(() => {
    if (view.diceRolling) {
      wasRolling.current = true;
      setLingering(true);
      return;
    }
    if (wasRolling.current) {
      wasRolling.current = false;
      const t = setTimeout(() => setLingering(false), RESULT_LINGER_MS);
      return () => clearTimeout(t);
    }
  }, [view.diceRolling, view.diceKey]);

  const visible = canRoll || view.diceRolling || lingering;

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 z-[58]"
      style={{ x: "-50%", y: "-50%", ["--dice" as string]: "calc(var(--s) * 0.15)", pointerEvents: canRoll ? "auto" : "none" }}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.5 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="rounded-[28%] p-[calc(var(--dice)*0.16)]"
        style={{ background: "rgba(0,0,0,0.42)", boxShadow: `0 0 0 2px ${color.main}, 0 10px 30px rgba(0,0,0,0.5)` }}
      >
        <LudoDice value={view.dice} rolling={view.diceRolling} rollKey={view.diceKey} canRoll={canRoll} onRoll={onRoll} color={color} />
      </div>
    </motion.div>
  );
}
