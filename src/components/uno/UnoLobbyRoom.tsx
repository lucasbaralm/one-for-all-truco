"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, Copy, Crown, Eye, LogOut, Play, Plus, UserX, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { BotLevel, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/uno/engine";
import { BOT_LEVEL_LABEL } from "@/lib/uno/labels";
import { UnoRulesList } from "./UnoRules";
import type { UnoSession } from "./useUnoSession";

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];

function LevelPicker({ value, onChange, small }: { value: BotLevel; onChange: (l: BotLevel) => void; small?: boolean }) {
  return (
    <div className="inline-flex rounded-lg bg-black/40 p-0.5">
      {LEVELS.map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`rounded-md font-bold transition-colors ${small ? "px-1.5 py-0.5 text-[0.65rem]" : "px-3 py-1 text-xs"} ${
            value === l ? "bg-white text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          {BOT_LEVEL_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export default function UnoLobbyRoom({ session, roomId, onExit }: { session: UnoSession; roomId: string; onExit: () => void }) {
  const { view, me } = session;
  const [newBotLevel, setNewBotLevel] = useState<BotLevel>("medium");
  const [copied, setCopied] = useState(false);
  if (!view) return null;

  const isHost = view.hostId === me;
  const seated = view.players.some((p) => p.id === me);
  const canStart = view.players.length >= MIN_PLAYERS;
  const full = view.players.length >= MAX_PLAYERS;

  const copyLink = async () => {
    const url = `${window.location.origin}/uno/${roomId}`;
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
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Uno · sala</p>
          <h1 className="font-mono text-4xl font-black tracking-[0.25em] text-white">{roomId}</h1>
          <p className="text-sm text-zinc-400">
            {view.players.length}/{MAX_PLAYERS} jogadores — chame os amigos ou complete com bots.
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
              {p.bot ? (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
                  <Bot className="h-6 w-6" />
                </div>
              ) : (
                <div className="relative">
                  <PlayerAvatar avatarUrl={p.avatarUrl} name={p.name} className="h-11 w-11" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${p.connected ? "bg-emerald-400" : "bg-zinc-500"}`} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-bold text-white">
                  <span className="truncate">{p.name}</span>
                  {p.id === me && <span className="text-xs font-semibold text-zinc-400">(você)</span>}
                  {p.id === view.hostId && <Crown className="h-4 w-4 shrink-0 text-yellow-400" />}
                </p>
                {p.bot ? (
                  isHost ? (
                    <div className="mt-1">
                      <LevelPicker small value={p.bot} onChange={(level) => session.send({ type: "set_bot_level", botId: p.id, level })} />
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">Bot {BOT_LEVEL_LABEL[p.bot]}</p>
                  )
                ) : (
                  <p className="text-xs text-zinc-400">{p.connected ? "Pronto" : "Reconectando…"}</p>
                )}
              </div>
              {isHost && p.id !== me && (
                <button
                  onClick={() => session.send(p.bot ? { type: "remove_bot", botId: p.id } : { type: "kick", playerId: p.id })}
                  aria-label={p.bot ? "Remover bot" : "Expulsar jogador"}
                  title={p.bot ? "Remover bot" : "Expulsar jogador"}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-red-400"
                >
                  {p.bot ? <X className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isHost && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-white/15 bg-black/30 p-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={full} onClick={() => session.send({ type: "add_bot", level: newBotLevel })} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar bot
              </Button>
              <LevelPicker value={newBotLevel} onChange={setNewBotLevel} />
            </div>
            <span className="text-xs text-zinc-500">{full ? "sala cheia" : `${MAX_PLAYERS - view.players.length} vagas`}</span>
          </div>
        )}
      </div>

      {isHost ? (
        <Button
          onClick={() => session.send({ type: "start" })}
          disabled={!canStart}
          className="h-14 w-full rounded-xl bg-red-600 text-xl font-bold text-white hover:bg-red-700"
        >
          {canStart ? (
            <span className="flex items-center gap-2">
              <Play className="h-5 w-5 fill-current" /> Iniciar partida
            </span>
          ) : (
            "Precisa de pelo menos 2 jogadores (ou bots)"
          )}
        </Button>
      ) : (
        seated && <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 text-center text-zinc-400">Aguardando o host iniciar a partida…</div>
      )}

      <details className="rounded-xl border border-white/10 bg-black/40 p-4">
        <summary className="cursor-pointer select-none font-bold text-white">Como jogar</summary>
        <div className="mt-3">
          <UnoRulesList />
        </div>
      </details>
    </div>
  );
}
