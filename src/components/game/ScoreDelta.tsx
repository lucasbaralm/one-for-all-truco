"use client";

import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Pontos (💀) subindo: quando o valor aumenta, um "+N" vermelho sobe do número e
// o número dá um pulinho — o que antes só aparecia como o número mudando de repente.
// Com `from`, o número começa nele e sobe pro valor depois de `delayMs` (placar da rodada).

export function ScoreDelta({
  value,
  from,
  delayMs = 700,
  tone = "bad",
  children,
}: {
  value: number;
  from?: number;
  delayMs?: number;
  /** "bad" (vermelho, o padrão: caveiras, cartas na mão) ou "good" (verde: pontos que se quer ganhar). */
  tone?: "bad" | "good";
  /** O que mostrar no lugar do número (recebe o valor atual). Padrão: o próprio número. */
  children?: (shown: number) => ReactNode;
}) {
  const [state, setState] = useState({ shown: from ?? value, delta: 0, key: 0 });

  // Valor novo vindo de fora (sem `from` pendente): pulo e "+N" na hora.
  const pendingFrom = from !== undefined && state.shown === from && value !== from;
  if (!pendingFrom && value !== state.shown) {
    setState({ shown: value, delta: value - state.shown, key: state.key + 1 });
  }

  // Placar da rodada: começa no valor de antes e sobe depois de um instante.
  useEffect(() => {
    if (!pendingFrom) return;
    const t = setTimeout(() => setState((s) => ({ shown: value, delta: value - s.shown, key: s.key + 1 })), delayMs);
    return () => clearTimeout(t);
  }, [pendingFrom, value, delayMs]);

  return (
    <span className="relative inline-block">
      <motion.span key={state.key} className="inline-block" initial={state.key ? { scale: 1.5 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 14 }}>
        {children ? children(state.shown) : state.shown}
      </motion.span>
      <AnimatePresence>
        {state.delta > 0 && (
          <motion.span
            key={state.key}
            className={`pointer-events-none absolute -top-3 left-full z-10 ml-0.5 whitespace-nowrap text-xs font-black [text-shadow:0_2px_6px_rgba(0,0,0,0.9)] sm:text-sm ${tone === "good" ? "text-emerald-300" : "text-red-400"}`}
            initial={{ opacity: 0, y: 4, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -14, scale: 1.2 }}
            transition={{ duration: 1.8, ease: "easeOut" }}
          >
            +{state.delta}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
