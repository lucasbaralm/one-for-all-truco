"use client";

import { useEffect, useRef, useState } from "react";
import { sfx } from "./sfx";

// Barra com o tempo que falta. O prazo vem do servidor (relógio do servidor; `serverNow()` converte o relógio do
// aparelho): assim a barra bate com o fim do tempo mesmo com o relógio do aparelho adiantado ou atrasado.

interface CountdownBarProps {
  /** Quando acaba (relógio do servidor, ms). */
  deadline: number;
  serverNow: () => number;
  /** Duração total da contagem. */
  totalMs: number;
  /** Muda a cada fase/turno: reinicia a contagem. */
  turnKey: string;
  /** Nos últimos segundos faz "tic" (só pra quem está na vez). */
  ticking?: boolean;
}

const WARN_S = 10;

export function CountdownBar({ deadline, serverNow, totalMs, turnKey, ticking = false }: CountdownBarProps) {
  const [left, setLeft] = useState<number>(totalMs);
  const lastSecond = useRef<number | null>(null);

  useEffect(() => {
    lastSecond.current = null;
    const tick = () => {
      const ms = Math.max(0, Math.min(totalMs, deadline - serverNow()));
      setLeft(ms);
      const sec = Math.ceil(ms / 1000);
      if (ticking && sec <= 5 && sec > 0 && lastSecond.current !== sec) {
        if (lastSecond.current !== null || sec < 5) sfx.tick();
        lastSecond.current = sec;
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline, serverNow, turnKey, ticking, totalMs]);

  const sec = Math.ceil(left / 1000);
  const urgent = sec <= WARN_S;
  return (
    <div className="flex items-center gap-2" data-mimica-timer="" data-seconds={sec}>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${(left / totalMs) * 100}%`, background: urgent ? "#f87171" : "#fbbf24", transition: "width 0.1s linear, background-color 0.2s" }} />
      </div>
      <span className={`w-7 text-right text-sm font-black tabular-nums ${urgent ? "text-red-300" : "text-zinc-300"}`}>{sec}</span>
    </div>
  );
}
