"use client";

import { useEffect, useRef, useState } from "react";
import { TIMING } from "@/lib/forca/timing";
import { sfx } from "./sfx";

// Barra com o tempo que a pessoa da vez ainda tem. O prazo vem do servidor (relógio do
// servidor, `serverNow()` converte o relógio do aparelho): assim a barra bate com o chute
// automático mesmo com o relógio do aparelho adiantado ou atrasado.

interface TurnTimerProps {
  /** Quando a vez acaba (relógio do servidor, ms). */
  deadline: number;
  serverNow: () => number;
  /** Muda a cada vez/jogada: reinicia a contagem. */
  turnKey: string;
  /** É a minha vez: nos últimos segundos faz "tic". */
  mine: boolean;
}

const WARN_S = 5;

export function TurnTimer({ deadline, serverNow, turnKey, mine }: TurnTimerProps) {
  const [left, setLeft] = useState<number>(TIMING.TURN_MS);
  const lastSecond = useRef<number | null>(null);

  useEffect(() => {
    lastSecond.current = null;
    const tick = () => {
      const ms = Math.max(0, Math.min(TIMING.TURN_MS, deadline - serverNow()));
      setLeft(ms);
      const sec = Math.ceil(ms / 1000);
      if (mine && sec <= WARN_S && sec > 0 && lastSecond.current !== sec) {
        if (lastSecond.current !== null || sec < WARN_S) sfx.tick();
        lastSecond.current = sec;
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline, serverNow, turnKey, mine]);

  const sec = Math.ceil(left / 1000);
  const urgent = sec <= WARN_S;
  return (
    <div className="flex items-center gap-2" data-forca-timer="" data-seconds={sec}>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${(left / TIMING.TURN_MS) * 100}%`, background: urgent ? "#f87171" : "#fbbf24", transition: "width 0.1s linear, background-color 0.2s" }}
        />
      </div>
      <span className={`w-6 text-right text-sm font-black tabular-nums ${urgent ? "text-red-300" : "text-zinc-300"}`}>{sec}</span>
    </div>
  );
}
