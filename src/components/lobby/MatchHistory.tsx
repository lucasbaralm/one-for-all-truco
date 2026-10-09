"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { History, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Game, HISTORY_PREFIX as PREFIX, Summary, describeResult, gameOf, roomCodeOf } from "@/lib/matchHistory";

const BADGE: Record<Game, { label: string; className: string }> = {
  fodinha: { label: "Fodinha", className: "bg-red-500/20 text-red-300" },
  ludo: { label: "Ludo", className: "bg-blue-500/20 text-blue-300" },
  dobble: { label: "Dobble", className: "bg-indigo-500/20 text-indigo-300" },
};

interface MatchRow {
  id: string;
  created_at: string;
  room_id: string;
  winner_name: string;
  players_summary: Summary[];
}

export function MatchHistory({ game, limit = 5 }: { game?: Game; limit?: number }) {
  const [history, setHistory] = useState<MatchRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let query = supabase.from("match_history").select("*").order("created_at", { ascending: false }).limit(limit);
      if (game === "ludo" || game === "dobble") query = query.like("room_id", `${PREFIX[game]}%`);
      if (game === "fodinha") query = query.not("room_id", "like", `${PREFIX.ludo}%`).not("room_id", "like", `${PREFIX.dobble}%`);
      const { data } = await query;
      if (!cancelled && data) setHistory(data as MatchRow[]);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [game, limit]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="w-full max-w-md mt-8 space-y-4"
    >
      <div className="flex items-center gap-2 text-white/80">
        <History className="w-5 h-5" />
        <h2 className="text-xl font-bold">Últimas Partidas</h2>
      </div>

      {history.length === 0 ? (
        <div className="text-zinc-500 text-center py-4 bg-black/40 rounded-xl border border-white/5">Nenhuma partida foi jogada ainda.</div>
      ) : (
        <div className="space-y-3">
          {history.map((match) => {
            const g = gameOf(match.room_id);
            const code = roomCodeOf(match.room_id);
            return (
              <div key={match.id} className="bg-black/40 p-4 rounded-xl border border-white/10 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-zinc-400 text-xs">
                    <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-black uppercase ${BADGE[g].className}`}>{BADGE[g].label}</span>
                    Sala: {code}
                  </span>
                  <span className="text-zinc-500 text-xs">{new Date(match.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-white font-bold text-lg">{match.winner_name} venceu!</span>
                </div>
                <div className="text-sm text-zinc-400">{match.players_summary.map((p) => describeResult(g, p)).join(" • ")}</div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
