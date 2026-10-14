"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Crown, Medal, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/Confetti";
import type { ResultHeadline } from "@/lib/gameResult";

// Tela de fim de partida dos três jogos: o texto fala com quem está olhando
// (venceu / ficou em Nº lugar / assistia), a linha da própria pessoa fica em
// destaque e cada linha pode trazer estatísticas da partida. Sem blur no fundo
// (um desfoque em tela cheia por trás de confete é caro de pintar).

export interface GameOverRow {
  id: string;
  name: string;
  /** Resultado principal da linha (ex.: "3/4 em casa", "12 cartas"). */
  detail: string;
  /** Estatísticas da partida, em letra pequena embaixo do nome. */
  stats?: string;
  /** Cor do jogador (bolinha ao lado do nome). */
  color?: string;
  isMe?: boolean;
}

export interface GameOverAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  primary?: boolean;
}

interface GameOverPanelProps {
  headline: ResultHeadline;
  rows: GameOverRow[];
  /** Resumo do SEU desempenho, em fichinhas (ex.: ["💥 3 capturas", "🎲 5 seis"]). */
  myStats?: string[];
  actions: GameOverAction[];
}

export function GameOverPanel({ headline, rows, myStats = [], actions }: GameOverPanelProps) {
  const win = headline.tone === "win";
  const lose = headline.tone === "lose";
  return (
    <>
      {win && <Confetti />}
      <motion.div
        className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-md rounded-3xl border bg-zinc-900 p-6 text-center shadow-2xl"
          style={{ borderColor: win ? "rgba(250,204,21,0.55)" : "rgb(63 63 70)" }}
          initial={{ scale: 0.7, y: 40 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
        >
          <motion.div
            animate={win ? { rotate: [0, -8, 8, -4, 0], scale: [1, 1.15, 1] } : { scale: [1, 1.06, 1] }}
            transition={{ duration: 1.2, delay: 0.3 }}
            className={`mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full ${win ? "bg-yellow-400/15" : "bg-white/5"}`}
          >
            {lose ? <Medal className="h-9 w-9 text-zinc-300" /> : <Trophy className={`h-9 w-9 ${win ? "text-yellow-400" : "text-zinc-400"}`} />}
          </motion.div>
          <p className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{headline.kicker}</p>
          <h2 className={`text-3xl font-black ${win ? "text-yellow-300" : "text-white"}`}>{headline.title}</h2>
          {headline.subtitle && <p className="mt-0.5 text-sm font-semibold text-zinc-400">{headline.subtitle}</p>}

          {myStats.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {myStats.map((s) => (
                <span key={s} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-bold text-zinc-200">
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="my-5 space-y-2">
            {rows.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.25 + i * 0.1 }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.isMe ? "bg-white/12 ring-1 ring-white/30" : "bg-black/40"}`}
              >
                <span className="flex w-5 justify-center text-lg font-black text-zinc-500">
                  {i === 0 ? <Crown className="h-5 w-5 text-yellow-400" /> : i + 1}
                </span>
                {r.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate font-bold text-white">
                    {r.name}
                    {r.isMe && <span className="ml-1 text-xs font-semibold text-zinc-400">(você)</span>}
                  </p>
                  {r.stats && <p className="text-[0.7rem] leading-snug text-zinc-400">{r.stats}</p>}
                </div>
                <span className="shrink-0 text-sm text-zinc-300">{r.detail}</span>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {actions.map((a) =>
              a.primary ? (
                <Button key={a.label} onClick={a.onClick} className="h-11 bg-white font-bold text-black hover:bg-zinc-200">
                  {a.icon} {a.label}
                </Button>
              ) : (
                <Button key={a.label} variant="secondary" onClick={a.onClick} className="h-10">
                  {a.icon} {a.label}
                </Button>
              )
            )}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
