"use client";

import { useEffect, useRef } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import type { DobbleView } from "@/lib/dobble/engine";
import { diffDobble } from "@/lib/dobble/feed";

/** Histórico do Dobble: a cada visão nova do servidor, registra o que mudou. */
export function useDobbleFeed(view: DobbleView | null, me: string) {
  const feed = useEventFeed();
  const prev = useRef<DobbleView | null>(null);
  const { push, reset } = feed;

  useEffect(() => {
    if (!view || view === prev.current) return;
    const d = diffDobble(prev.current, view, { me });
    prev.current = view;
    if (d.reset) reset(d.items);
    else push(d.items);
  }, [view, me, push, reset]);

  return feed;
}
