"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE-PLAYER BADGE — small pulsing label showing what the active player is
// doing right now (embaralhando / apostando / escolhendo carta).
// ─────────────────────────────────────────────────────────────────────────────
export function ActiveBadge({ label, className = "mt-1" }: { label: string; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: [0.75, 1, 0.75], y: 0 }}
      transition={{ opacity: { repeat: Infinity, duration: 1.4 }, y: { duration: 0.2 } }}
      className={`${className} inline-flex items-center gap-1 bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap`}>
      {label}
    </motion.div>
  );
}

// Seta que aponta pro portrait de quem está ativo — "direction" é de onde a
// seta aponta: "down" fica em cima do avatar (oponentes), "up" fica embaixo
// (minha área, que já está na parte de baixo da tela).
export function ActiveArrow({ direction }: { direction: "down" | "up" }) {
  const Icon = direction === "down" ? ChevronDown : ChevronUp;
  return (
    <motion.div
      animate={{ y: direction === "down" ? [0, 6, 0] : [0, -6, 0] }}
      transition={{ repeat: Infinity, duration: 0.8 }}
      className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
      <Icon className="w-9 h-9 sm:w-11 sm:h-11" strokeWidth={3} />
    </motion.div>
  );
}
