"use client";

import { useEffect, useRef } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import type { LudoState } from "@/lib/ludo/engine";
import { diffLudo } from "@/lib/ludo/feed";
import { LUDO_COLORS } from "./colors";

const hex = (color: keyof typeof LUDO_COLORS) => LUDO_COLORS[color].main;

/** Histórico do Ludo: a cada estado que a animação acabou de mostrar, registra o que mudou. */
export function useLudoFeed(shown: LudoState | null, me: string) {
  const feed = useEventFeed();
  const prev = useRef<LudoState | null>(null);
  const { push, reset } = feed;

  useEffect(() => {
    if (!shown || shown === prev.current) return;
    const d = diffLudo(prev.current, shown, { me, hex });
    prev.current = shown;
    if (d.reset) reset(d.items);
    else push(d.items);
  }, [shown, me, push, reset]);

  return feed;
}
