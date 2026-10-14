"use client";

import { memo, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import { FeedEntry, FeedInput, FeedTone, appendEntries } from "@/lib/feed";

// Histórico de eventos da partida, igual nos três jogos:
//  • FeedList     — as últimas entradas, as mais velhas esmaecendo (fica num canto livre da tela);
//  • FeedHistoryButton — botão do cabeçalho que abre a lista completa (é o único em telas pequenas).

export function useEventFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const push = useCallback((items: FeedInput[]) => setEntries((prev) => appendEntries(prev, items)), []);
  /** Começa uma lista nova (partida nova), já com as primeiras entradas. */
  const reset = useCallback((items: FeedInput[] = []) => setEntries(() => appendEntries([], items)), []);
  return { entries, push, reset };
}

const TONE: Record<FeedTone, string> = {
  info: "text-zinc-200",
  good: "text-emerald-300",
  bad: "text-red-300",
  special: "text-yellow-300",
};

const EDGE = "rgba(255,255,255,0.2)";

function Entry({ entry, opacity }: { entry: FeedEntry; opacity: number }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity, x: 0 }}
      exit={{ opacity: 0 }}
      // A entrada nova espera as antigas subirem (layout) antes de aparecer — senão as duas ficam uma em cima da outra por um instante.
      transition={{ duration: 0.22, layout: { duration: 0.18, ease: "easeOut" }, opacity: { duration: 0.22, delay: 0.1 }, x: { duration: 0.22, delay: 0.1 } }}
      className={`rounded-lg bg-black/55 px-2 py-1 text-[0.72rem] font-semibold leading-snug ${TONE[entry.tone]}`}
      style={{ borderLeft: `3px solid ${entry.color ?? EDGE}` }}
    >
      {entry.text}
    </motion.div>
  );
}

/** As últimas `visible` entradas, a mais nova embaixo e as velhas apagando. */
export const FeedList = memo(function FeedList({
  entries,
  visible = 7,
  className = "",
}: {
  entries: FeedEntry[];
  visible?: number;
  className?: string;
}) {
  const shown = entries.slice(-visible);
  return (
    <div className={`pointer-events-none flex min-h-0 flex-col justify-end gap-1 overflow-hidden ${className}`}>
      {shown.length > 0 && (
        <p className="mb-0.5 flex items-center gap-1 text-[0.6rem] font-black uppercase tracking-widest text-white/45">
          <ScrollText className="h-3 w-3" /> Histórico
        </p>
      )}
      <AnimatePresence initial={false}>
        {shown.map((e, i) => {
          const age = shown.length - 1 - i;
          return <Entry key={e.id} entry={e} opacity={Math.max(0.4, 1 - age * 0.12)} />;
        })}
      </AnimatePresence>
    </div>
  );
});

/** Botão do cabeçalho: abre a lista completa (a mais nova em cima). Um pontinho avisa de coisa nova. */
export function FeedHistoryButton({
  entries,
  className = "flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70",
  iconClassName = "h-4 w-4",
  align = "right",
}: {
  entries: FeedEntry[];
  className?: string;
  iconClassName?: string;
  /** Lado do botão em que a lista abre (`left` quando o botão está perto da borda esquerda da tela). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [seenId, setSeenId] = useState(0);
  const lastId = entries.length > 0 ? entries[entries.length - 1].id : 0;
  const unread = !open && lastId > seenId;

  const toggle = () => {
    setSeenId(lastId);
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button onClick={toggle} aria-label="Histórico da partida" title="Histórico" className={`relative ${className}`}>
        <ScrollText className={iconClassName} />
        {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-black/60" />}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button aria-label="Fechar histórico" className="fixed inset-0 z-[44] cursor-default" onClick={() => setOpen(false)} />
            <motion.div
              // Celular: preso às bordas da TELA (o botão fica no meio do cabeçalho e a lista passaria da borda).
              // Telas maiores: logo abaixo do botão.
              className={`fixed top-12 ${align === "left" ? "left-2 sm:left-auto" : "right-2 sm:right-auto"} sm:absolute sm:top-full ${align === "left" ? "sm:left-0" : "sm:right-0"} z-[45] sm:mt-1.5 max-h-[55vh] w-[min(18rem,calc(100vw-1rem))] space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-2 shadow-2xl`}
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {entries.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-zinc-400">Nada aconteceu ainda.</p>
              ) : (
                [...entries].reverse().map((e) => (
                  <div
                    key={e.id}
                    className={`rounded-lg bg-black/40 px-2 py-1 text-xs font-semibold leading-snug ${TONE[e.tone]}`}
                    style={{ borderLeft: `3px solid ${e.color ?? EDGE}` }}
                  >
                    {e.text}
                  </div>
                ))
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
