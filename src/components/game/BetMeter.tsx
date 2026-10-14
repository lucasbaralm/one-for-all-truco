"use client";

import { motion } from "framer-motion";

// Quanto já foi apostado em relação às vazas que existem na rodada. A soma das
// apostas nunca pode "fechar" exata pra quem aposta por último — ver isso
// acontecendo explica por que um número fica bloqueado e quem vai ter que errar.

const vazas = (n: number) => `${n} ${n === 1 ? "vaza" : "vazas"}`;

/** Texto de apoio da soma das apostas (puro, pra testar). */
export function betBalance(sum: number, cards: number): { label: string; tone: "free" | "over" | "exact" } {
  const diff = cards - sum;
  if (diff > 0) return { label: `${vazas(diff)} sem dono ainda`, tone: "free" };
  if (diff < 0) return { label: `pediram ${vazas(-diff)} a mais`, tone: "over" };
  return { label: "soma exata", tone: "exact" };
}

const TONE = {
  free: { text: "text-sky-300", bar: "bg-sky-400" },
  over: { text: "text-rose-300", bar: "bg-rose-400" },
  exact: { text: "text-amber-300", bar: "bg-amber-400" },
};

export function BetMeter({ sum, cards, pending }: { sum: number; cards: number; pending: number }) {
  const { label, tone } = betBalance(sum, cards);
  const pct = Math.min(100, Math.round((sum / Math.max(1, cards)) * 100));
  return (
    <div className="pointer-events-none flex flex-col items-center gap-0.5 rounded-xl border border-white/10 bg-black/65 px-3 py-1">
      <p className="whitespace-nowrap text-[10px] font-bold text-white sm:text-xs">
        🎯 Apostas: {sum} de {cards}
        {pending > 0 && <span className="text-zinc-400"> · faltam {pending} apostar</span>}
      </p>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/15">
        <motion.div className={`h-full rounded-full ${TONE[tone].bar}`} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
      </div>
      <p className={`whitespace-nowrap text-[10px] font-semibold sm:text-xs ${TONE[tone].text}`}>{label}</p>
    </div>
  );
}
