"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Crown, Lock, Skull, WifiOff } from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GROUP_COLOR, getEdition } from "@/lib/monopoly/editions";
import { MonoPlayer, MonoView, netWorth } from "@/lib/monopoly/engine";
import { BOT_LEVEL_LABEL, money } from "@/lib/monopoly/labels";
import { playerColor } from "@/lib/playerColors";

// O cartão de cada jogador: foto/bot, ficha, dinheiro (com o "+$200" / "−$50" subindo quando muda),
// estado (preso, falido, caiu) e as propriedades que tem, uma pastilha colorida por casa.

/** O dinheiro com o valor que entrou/saiu flutuando — verde quando entra, vermelho quando sai. */
export function Cash({ value, edition }: { value: number; edition: MonoView["edition"] }) {
  const [state, setState] = useState({ shown: value, delta: 0, key: 0 });
  if (value !== state.shown) setState({ shown: value, delta: value - state.shown, key: state.key + 1 });
  const up = state.delta > 0;
  return (
    <span className="relative inline-block tabular-nums" data-mono-cash-value={value}>
      <motion.span key={state.key} className="inline-block" initial={state.key ? { scale: 1.3 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
        {money(edition, value)}
      </motion.span>
      <AnimatePresence>
        {state.delta !== 0 && (
          <motion.span
            key={state.key}
            className={`pointer-events-none absolute -top-3 left-full z-10 ml-1 whitespace-nowrap text-xs font-black [text-shadow:0_2px_6px_rgba(0,0,0,0.9)] ${up ? "text-emerald-300" : "text-red-400"}`}
            initial={{ opacity: 0, y: 4, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -14, scale: 1.15 }}
            transition={{ duration: 1.8, ease: "easeOut" }}
          >
            {up ? "+" : "−"}
            {money(edition, Math.abs(state.delta))}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Uma pastilha por propriedade (cor do grupo; hipotecada fica riscada). */
export function PropPips({ view, ownerId, max = 28 }: { view: MonoView; ownerId: string; max?: number }) {
  const ed = getEdition(view.edition);
  const owned: number[] = [];
  view.props.forEach((p, i) => {
    if (p?.owner === ownerId) owned.push(i);
  });
  if (owned.length === 0) return <p className="text-[0.62rem] text-zinc-500">sem propriedades</p>;
  return (
    <div className="flex flex-wrap gap-[3px]" data-mono-pips={ownerId}>
      {owned.slice(0, max).map((i) => {
        const sq = ed.squares[i];
        const prop = view.props[i]!;
        const color = sq.kind === "street" ? GROUP_COLOR[sq.group] : sq.kind === "utility" ? "#f4f4f5" : "#71717a";
        return (
          <span
            key={i}
            title={"name" in sq ? sq.name : ""}
            data-mono-pip={i}
            className="relative inline-flex h-3 w-2.5 items-center justify-center rounded-[2px] border border-black/50"
            style={{ background: color, opacity: prop.mortgaged ? 0.4 : 1 }}
          >
            {prop.houses > 0 && <span className={`h-1 w-1 rounded-full ${prop.houses === 5 ? "bg-red-600" : "bg-emerald-700"}`} />}
            {prop.mortgaged && <span className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-black" />}
          </span>
        );
      })}
    </div>
  );
}

export function PlayerTile({
  view,
  player,
  seat,
  isMe,
  emojis,
  onOpen,
}: {
  view: MonoView;
  player: MonoPlayer;
  seat: number;
  isMe: boolean;
  emojis: { id: string; emoji: string }[];
  onOpen: (id: string) => void;
}) {
  const ed = getEdition(view.edition);
  const color = playerColor(view.players, player.id);
  const isTurn = view.phase === "playing" && view.players[view.turn]?.id === player.id && !player.bankrupt;
  const away = !player.bot && !player.connected && !player.bankrupt;
  const status = player.bankrupt ? "faliu" : player.jail !== null ? "preso" : away ? "desconectado" : null;

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(player.id)}
      data-mono-tile={player.id}
      data-turn={isTurn ? "true" : "false"}
      data-bankrupt={player.bankrupt ? "true" : "false"}
      className="relative min-w-[10.5rem] shrink-0 rounded-xl border bg-black/70 px-2.5 py-1.5 text-left lg:min-w-0"
      style={{
        borderTopColor: isTurn ? "#facc15" : "rgba(255,255,255,0.12)",
        borderRightColor: isTurn ? "#facc15" : "rgba(255,255,255,0.12)",
        borderBottomColor: isTurn ? "#facc15" : "rgba(255,255,255,0.12)",
        borderLeftColor: color,
        borderLeftWidth: 4,
        boxShadow: isTurn ? "0 0 0 2px rgba(250,204,21,0.55), 0 0 18px rgba(250,204,21,0.35)" : undefined,
        opacity: player.bankrupt ? 0.5 : away ? 0.65 : 1,
      }}
      animate={isTurn ? { scale: 1.02 } : { scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="relative shrink-0">
          {player.bot ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
              <Bot className="h-4 w-4" />
            </span>
          ) : (
            <PlayerAvatar avatarUrl={player.avatarUrl} name={player.name} className="h-7 w-7 text-xs" />
          )}
          <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 bg-white text-[0.55rem] leading-none" style={{ borderColor: color }}>
            {ed.tokens[seat % ed.tokens.length]}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-[0.78rem] font-bold leading-tight text-white">
            <span className="truncate">{player.name}</span>
            {isMe && <span className="text-[0.6rem] font-semibold text-zinc-400">(você)</span>}
            {player.id === view.hostId && <Crown className="h-3 w-3 shrink-0 text-yellow-400" />}
          </p>
          <p className="flex items-center gap-1 truncate text-[0.62rem] leading-tight text-zinc-400">
            {status === "preso" && <Lock className="h-2.5 w-2.5 text-amber-300" />}
            {status === "faliu" && <Skull className="h-2.5 w-2.5 text-red-400" />}
            {status === "desconectado" && <WifiOff className="h-2.5 w-2.5 text-red-300" />}
            {status ?? (player.bot ? `Bot ${BOT_LEVEL_LABEL[player.bot]}` : " ")}
          </p>
        </div>
      </div>
      {!player.bankrupt && (
        <>
          <p className="mt-1 flex items-baseline justify-between gap-2 text-sm font-black text-white">
            <Cash value={player.cash} edition={view.edition} />
            <span className="text-[0.6rem] font-semibold text-zinc-400" title="Patrimônio: dinheiro + propriedades + construções">
              {money(view.edition, netWorth(view, player.id))}
            </span>
          </p>
          <div className="mt-1">
            <PropPips view={view} ownerId={player.id} />
          </div>
          {player.jailCards.length > 0 && <p className="mt-0.5 text-[0.62rem] font-bold text-amber-300">🗝️ {player.jailCards.length} carta{player.jailCards.length > 1 ? "s" : ""} de saída</p>}
        </>
      )}
      <AnimatePresence>
        {emojis.map((e) => (
          <motion.span
            key={e.id}
            className="pointer-events-none absolute left-1/2 top-0 z-50 text-2xl"
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{ y: -34, opacity: [0, 1, 1, 0], scale: 1.3 }}
            transition={{ duration: 2, ease: "easeOut" }}
          >
            {e.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.button>
  );
}
