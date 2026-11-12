"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Crown, Eye, LogOut, Play, UserX, Video, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallControls } from "@/components/call/CallControls";
import { VideoTile } from "@/components/call/VideoTile";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { peerCaption } from "@/lib/call/peerCaption";
import type { CallApi } from "@/lib/call/useCall";
import { MAX_PLAYERS, MIN_PLAYERS, ROUND_CHOICES } from "@/lib/mimica/engine";
import { ROUNDS_LABEL } from "@/lib/mimica/labels";
import { MimicaRulesList } from "./MimicaRules";
import type { MimicaSession } from "./useMimicaSession";

export default function MimicaLobbyRoom({ session, call, roomId, onExit }: { session: MimicaSession; call: CallApi; roomId: string; onExit: () => void }) {
  const { view, me } = session;
  const [copied, setCopied] = useState(false);
  if (!view) return null;

  const isHost = view.hostId === me;
  const seated = view.players.some((p) => p.id === me);
  const canStart = view.players.length >= MIN_PLAYERS;
  const full = view.players.length >= MAX_PLAYERS;
  const inCall = (id: string) => (id === me ? call.joined : !!call.peers[id]);

  const copyLink = async () => {
    const url = `${window.location.origin}/mimica/${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie o link da sala:", url);
    }
  };

  return (
    <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-4 overflow-y-auto pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Mímica · sala</p>
          <h1 className="font-mono text-4xl font-black tracking-[0.25em] text-white">{roomId}</h1>
          <p className="text-sm text-zinc-400">
            {view.players.length}/{MAX_PLAYERS} pessoas — chame os amigos (de {MIN_PLAYERS} a {MAX_PLAYERS}) e entrem na videochamada.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button onClick={copyLink} variant="secondary" size="sm" className="gap-1.5 bg-black/50 text-white hover:bg-black/70">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={copied ? "ok" : "copy"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="flex items-center">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </motion.span>
            </AnimatePresence>
            {copied ? "Copiado!" : "Copiar link"}
          </Button>
          <Button onClick={onExit} variant="ghost" size="sm" className="gap-1.5 text-zinc-400">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </Button>
        </div>
      </div>

      {session.status === "reconnecting" && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-200">
          <WifiOff className="h-4 w-4" /> Reconectando à sala…
        </div>
      )}
      {!seated && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 p-3 text-sm text-zinc-300">
          <Eye className="h-4 w-4 shrink-0" />
          {full ? "A sala está cheia — você está só assistindo." : "Entrando na sala…"}
        </div>
      )}

      {seated && (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-black/45 p-3" data-mimica-call="">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 font-bold text-white">
                <Video className="h-4 w-4 text-emerald-400" /> Videochamada
              </p>
              <p className="text-xs text-zinc-400">Quem faz a mímica aparece grande pra todo mundo. Teste a câmera e o microfone antes de começar.</p>
            </div>
            <CallControls call={call} />
          </div>
          {call.error && (
            <p className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200" data-call-error="">
              {call.error}
            </p>
          )}
          {call.joined && call.relay === false && (
            <p className="text-[0.7rem] text-zinc-500">Sem servidor de retransmissão (TURN) configurado: se alguém não conectar, a rede dele pode estar bloqueando a conexão direta.</p>
          )}
          {call.joined && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {view.players.map((p) => {
                const peer = call.peers[p.id];
                const mine = p.id === me;
                return (
                  <VideoTile
                    key={p.id}
                    stream={mine ? call.localStream : (peer?.stream ?? null)}
                    local={mine}
                    name={p.name}
                    avatarUrl={p.avatarUrl}
                    cam={mine ? call.camOn && call.hasCam : (peer?.cam ?? null)}
                    mic={mine ? call.micActive : (peer?.mic ?? null)}
                    placeholder={mine ? (call.hasCam ? undefined : "sem câmera") : peerCaption(peer)}
                    className="aspect-[4/3]"
                    testId={`lobby-${p.id}`}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/45 p-3" data-mimica-rounds="">
        <div>
          <p className="font-bold text-white">Quantas voltas?</p>
          <p className="text-xs text-zinc-400">Cada volta, todo mundo faz a mímica uma vez. {isHost ? "Só você, que é o host, define." : "O host define."}</p>
        </div>
        <div className="inline-flex rounded-lg bg-black/40 p-0.5">
          {ROUND_CHOICES.map((n) => (
            <button
              key={n}
              disabled={!isHost}
              onClick={() => session.send({ type: "set_rounds", rounds: n })}
              data-rounds={n}
              aria-pressed={view.rounds === n}
              aria-label={ROUNDS_LABEL(n)}
              title={ROUNDS_LABEL(n)}
              className={`h-8 w-9 rounded-md text-sm font-bold transition-colors disabled:cursor-default ${view.rounds === n ? "bg-white text-black" : "text-zinc-400 hover:text-white disabled:hover:text-zinc-400"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {view.players.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/45 p-3"
            >
              <div className="relative">
                <PlayerAvatar avatarUrl={p.avatarUrl} name={p.name} className="h-11 w-11" />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${p.connected ? "bg-emerald-400" : "bg-zinc-500"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-bold text-white">
                  <span className="truncate">{p.name}</span>
                  {p.id === me && <span className="text-xs font-semibold text-zinc-400">(você)</span>}
                  {p.id === view.hostId && <Crown className="h-4 w-4 shrink-0 text-yellow-400" />}
                </p>
                <p className="text-xs text-zinc-400">
                  {!p.connected ? "Reconectando…" : inCall(p.id) ? "🎥 na chamada" : "Pronto"}
                </p>
              </div>
              {isHost && p.id !== me && (
                <button
                  onClick={() => session.send({ type: "kick", playerId: p.id })}
                  aria-label="Expulsar jogador"
                  title="Expulsar jogador"
                  className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                >
                  <UserX className="h-4 w-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {!full && (
          <p className="px-1 text-xs text-zinc-500">
            {MAX_PLAYERS - view.players.length} {MAX_PLAYERS - view.players.length === 1 ? "vaga" : "vagas"} — manda o link.
          </p>
        )}
      </div>

      {isHost ? (
        <Button
          onClick={() => session.send({ type: "start" })}
          disabled={!canStart}
          data-mimica-start=""
          className="h-14 w-full rounded-xl bg-emerald-600 text-xl font-bold text-white hover:bg-emerald-700"
        >
          {canStart ? (
            <span className="flex items-center gap-2">
              <Play className="h-5 w-5 fill-current" /> Iniciar partida
            </span>
          ) : (
            "Precisa de pelo menos 2 pessoas"
          )}
        </Button>
      ) : (
        seated && <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 text-center text-zinc-400">Aguardando o host iniciar a partida…</div>
      )}

      <details className="rounded-xl border border-white/10 bg-black/40 p-4">
        <summary className="cursor-pointer select-none font-bold text-white">Como jogar</summary>
        <div className="mt-3">
          <MimicaRulesList />
        </div>
      </details>
    </div>
  );
}
