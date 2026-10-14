"use client";

/* Reage a cada estado novo da mesa (histórico, som e contagem de acertos). */

import { useEffect, useRef, useState } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import { FodinhaCue, diffFodinha } from "@/lib/game/feed";
import type { GameState } from "@/lib/game/state-machine";
import { sfx } from "./sfx";

/** Acertos e rodadas que ESTE cliente viu fechar (quem recarrega no meio perde o começo — a tela de fim sabe disso). */
export interface RoundStats {
  rounds: number;
  hits: Record<string, number>;
}

const EMPTY: RoundStats = { rounds: 0, hits: {} };

/** Histórico + sons + contagem de acertos da Fodinha, tudo derivado das mudanças do estado da mesa. */
export function useFodinhaFeed(gameState: GameState | null, me: string) {
  const feed = useEventFeed();
  const [roundStats, setRoundStats] = useState<RoundStats>(EMPTY);
  const prev = useRef<GameState | null>(null);
  const { push, reset } = feed;

  useEffect(() => {
    if (!gameState || gameState === prev.current) return;
    const before = prev.current;
    const d = diffFodinha(before, gameState, { me });
    prev.current = gameState;

    if (d.reset) {
      reset(d.items);
      setRoundStats(EMPTY);
    } else {
      push(d.items);
    }

    // Com a aba escondida não adianta tocar: o áudio se acumularia pra quando ela voltar.
    if (!document.hidden) {
      const play: Record<FodinhaCue, () => void> = {
        deal: sfx.deal,
        bet: sfx.bet,
        play: sfx.card,
        trick: sfx.trick,
        trickMine: sfx.trickMine,
        hit: sfx.hit,
        miss: sfx.miss,
        over: () => {
          const winner = [...gameState.players].sort((a, b) => a.score - b.score)[0];
          if (winner?.name === me) sfx.win();
          else if (gameState.players.some((p) => p.name === me)) sfx.lose();
        },
      };
      for (const cue of d.cues) play[cue]();
    }

    const results = d.roundResults;
    if (results) {
      setRoundStats((s) => ({
        rounds: s.rounds + 1,
        hits: { ...s.hits, ...Object.fromEntries(results.map((r) => [r.name, (s.hits[r.name] ?? 0) + (r.hit ? 1 : 0)])) },
      }));
    }
  }, [gameState, me, push, reset]);

  return { feed, roundStats };
}
