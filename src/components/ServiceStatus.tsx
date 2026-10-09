"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { ServiceHealth, checkPartykit, checkSupabase } from "@/lib/services";

const RECHECK_MS = 15_000;

/**
 * Estado do room server (PartyKit) e do Supabase, conferido na hora que a
 * tela abre, de tempos em tempos, e quando a aba volta a ter foco / a rede volta.
 */
export function useServiceStatus() {
  const [partykit, setPartykit] = useState<ServiceHealth>("checking");
  const [supabase, setSupabase] = useState<ServiceHealth>("checking");
  const [rechecking, setRechecking] = useState(false);
  const alive = useRef(true);

  const recheck = useCallback(async () => {
    setRechecking(true);
    const [pk, sb] = await Promise.all([checkPartykit(), checkSupabase()]);
    if (!alive.current) return;
    setPartykit(pk ? "ok" : "down");
    setSupabase(sb ? "ok" : "down");
    setRechecking(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com serviços externos (rede)
    void recheck();
    const timer = setInterval(recheck, RECHECK_MS);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [recheck]);

  return { partykit, supabase, recheck, rechecking };
}

export const PARTYKIT_DOWN_TITLE = "Servidor de jogo (PartyKit) fora do ar";
export const SUPABASE_DOWN_TITLE = "Supabase não está respondendo";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Aviso no topo da tela inicial (login e menu de jogos) quando o PartyKit ou o
 * Supabase estão fora do ar. Some sozinho quando voltam.
 */
export function ServiceStatusBanner() {
  const { partykit, supabase, recheck, rechecking } = useServiceStatus();
  const problems: { key: string; title: string; detail: string }[] = [];
  if (partykit === "down") {
    problems.push({
      key: "partykit",
      title: PARTYKIT_DOWN_TITLE,
      detail: isDev
        ? "Salas online e partidas contra bots não vão conectar. Rode `npx partykit dev` no terminal."
        : "Salas online e partidas contra bots não vão conectar até ele voltar.",
    });
  }
  if (supabase === "down") {
    problems.push({
      key: "supabase",
      title: SUPABASE_DOWN_TITLE,
      detail: "Login, foto de perfil e histórico de partidas podem falhar — e o servidor de jogo não consegue validar quem é você.",
    });
  }

  // No fluxo da página (não flutuando): o aviso empurra o conteúdo pra baixo em
  // vez de cobrir o título; a margem de cima no mobile deixa o botão de temas livre.
  return (
    <AnimatePresence>
      {problems.length > 0 && (
        <div key="service-banner" className="relative z-20 mx-auto mb-3 mt-12 w-[min(92vw,30rem)] shrink-0 sm:mt-3">
          <motion.div
            role="alert"
            className="rounded-2xl border border-amber-500/40 bg-amber-950/90 p-3 text-amber-50 shadow-2xl backdrop-blur-md"
            initial={{ y: -16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0 }}
          >
            <div className="flex items-start gap-2.5">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1 space-y-2">
                {problems.map((p) => (
                  <div key={p.key}>
                    <p className="text-sm font-black">{p.title}</p>
                    <p className="text-xs text-amber-100/80">{p.detail}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={recheck}
                disabled={rechecking}
                aria-label="Verificar de novo"
                title="Verificar de novo"
                className="shrink-0 rounded-lg p-1.5 text-amber-200 hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${rechecking ? "animate-spin" : ""}`} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
