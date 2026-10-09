"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, Copy, Crown, Eye, LogOut, Play, Plus, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { COLORS, COLOR_LABEL, LudoColor } from "@/lib/ludo/board";
import { BOT_LEVEL_LABEL } from "@/lib/ludo/bot";
import { BotLevel, LudoPlayer, MIN_PLAYERS } from "@/lib/ludo/engine";
import { LUDO_COLORS } from "./colors";
import { LudoRulesList } from "./LudoRules";
import type { LudoSession } from "./useLudoSession";

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

function Seat({
  color,
  occupant,
  isHost,
  me,
  iAmSeated,
  newBotLevel,
  session,
}: {
  color: LudoColor;
  occupant: LudoPlayer | undefined;
  isHost: boolean;
  me: string;
  iAmSeated: boolean;
  newBotLevel: BotLevel;
  session: LudoSession;
}) {
  const t = LUDO_COLORS[color];
  const hostId = session.state?.hostId;
  return (
    <motion.div
      layout
      className="relative flex min-h-[5.5rem] items-center gap-3 rounded-2xl border p-3"
      style={{
        borderColor: occupant ? t.main : `${t.main}55`,
        background: occupant ? `linear-gradient(135deg, ${t.main}33, rgba(0,0,0,0.55))` : "rgba(0,0,0,0.4)",
        boxShadow: occupant ? `0 0 22px ${t.main}33` : "none",
      }}
    >
      <span className="absolute left-3 top-2 text-[0.65rem] font-black uppercase tracking-widest" style={{ color: t.light }}>
        {COLOR_LABEL[color]}
      </span>

      {occupant ? (
        <>
          <div className="mt-3 shrink-0">
            {occupant.bot ? (
              <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: t.main, color: t.ink }}>
                <Bot className="h-6 w-6" />
              </div>
            ) : (
              <div className="relative rounded-full" style={{ boxShadow: `0 0 0 2.5px ${t.main}` }}>
                <PlayerAvatar avatarUrl={occupant.avatarUrl} name={occupant.name} className="h-11 w-11" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${occupant.connected ? "bg-emerald-400" : "bg-zinc-500"}`}
                />
              </div>
            )}
          </div>
          <div className="mt-3 min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate font-bold text-white">
              <span className="truncate">{occupant.name}</span>
              {occupant.id === me && <span className="text-xs font-semibold text-zinc-400">(você)</span>}
              {occupant.id === hostId && <Crown className="h-4 w-4 shrink-0 text-yellow-400" />}
            </p>
            {occupant.bot ? (
              isHost ? (
                <div className="mt-1">
                  <LevelPicker
                    small
                    value={occupant.bot}
                    onChange={(level) => session.send({ type: "set_bot_level", botId: occupant.id, level })}
                  />
                </div>
              ) : (
                <p className="text-xs text-zinc-400">Bot {BOT_LEVEL_LABEL[occupant.bot]}</p>
              )
            ) : (
              <p className="text-xs text-zinc-400">{occupant.connected ? "Pronto" : "Reconectando…"}</p>
            )}
          </div>
          {isHost && occupant.id !== me && (
            <button
              onClick={() =>
                session.send(occupant.bot ? { type: "remove_bot", botId: occupant.id } : { type: "kick", playerId: occupant.id })
              }
              aria-label={occupant.bot ? "Remover bot" : "Expulsar jogador"}
              title={occupant.bot ? "Remover bot" : "Expulsar jogador"}
              className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-red-400"
            >
              {occupant.bot ? <X className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            </button>
          )}
        </>
      ) : (
        <div className="mt-4 flex flex-1 flex-wrap items-center justify-center gap-2">
          {iAmSeated && (
            <Button size="sm" variant="secondary" onClick={() => session.send({ type: "set_color", color })}>
              Sentar aqui
            </Button>
          )}
          {isHost && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => session.send({ type: "add_bot", level: newBotLevel, color })}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Bot
            </Button>
          )}
          {!iAmSeated && !isHost && <span className="text-sm text-zinc-500">Vaga livre</span>}
        </div>
      )}
    </motion.div>
  );
}

export default function LudoLobbyRoom({ session, roomId, onExit }: { session: LudoSession; roomId: string; onExit: () => void }) {
  const { state, me } = session;
  const [newBotLevel, setNewBotLevel] = useState<BotLevel>("medium");
  const [copied, setCopied] = useState(false);
  if (!state) return null;

  const isHost = state.hostId === me;
  const iAmSeated = state.players.some((p) => p.id === me);
  const canStart = state.players.length >= MIN_PLAYERS;

  const copyLink = async () => {
    const url = `${window.location.origin}/ludo/${roomId}`;
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
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Ludo · sala</p>
          <h1 className="font-mono text-4xl font-black tracking-[0.25em] text-white">{roomId}</h1>
          <p className="text-sm text-zinc-400">
            {state.players.length}/4 jogadores — escolha sua cor e chame os amigos.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button onClick={copyLink} variant="secondary" size="sm" className="gap-1.5 bg-black/50 text-white hover:bg-black/70">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "ok" : "copy"}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="flex items-center"
              >
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

      {!iAmSeated && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 p-3 text-sm text-zinc-300">
          <Eye className="h-4 w-4 shrink-0" />
          {state.players.length >= 4 ? "A sala está cheia — você está só assistindo." : "Entrando na sala…"}
        </div>
      )}

      {isHost && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
            <Bot className="h-4 w-4 text-emerald-400" /> Nível dos bots novos
          </span>
          <LevelPicker value={newBotLevel} onChange={setNewBotLevel} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {COLORS.map((color) => (
          <Seat
            key={color}
            color={color}
            occupant={state.players.find((p) => p.color === color)}
            isHost={isHost}
            me={me}
            iAmSeated={iAmSeated}
            newBotLevel={newBotLevel}
            session={session}
          />
        ))}
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
        iAmSeated && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 text-center text-zinc-400">
            Aguardando o host iniciar a partida…
          </div>
        )
      )}

      <details className="rounded-xl border border-white/10 bg-black/40 p-4">
        <summary className="cursor-pointer select-none font-bold text-white">Como jogar</summary>
        <div className="mt-3">
          <LudoRulesList />
        </div>
      </details>
    </div>
  );
}
