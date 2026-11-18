"use client";

import { ReactNode, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Check, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GROUP_COLOR, getEdition } from "@/lib/monopoly/editions";
import type { Bundle, MonoView } from "@/lib/monopoly/engine";
import { money } from "@/lib/monopoly/labels";
import { playerColor } from "@/lib/playerColors";
import { squareIcon } from "./Deed";
import { EDITION_UI } from "./edition-ui";
import type { MonopolySession } from "./useMonopolySession";

// Trocas: na sua vez você propõe a UMA pessoa dinheiro, propriedades e cartas de saída da prisão nos
// dois sentidos; ela aceita ou recusa (a resposta chega num cartão). Propriedade com construção no
// grupo não entra — vende as casas antes.

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-[62] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
          <p className="flex items-center gap-2 text-lg font-black text-white">
            <ArrowLeftRight className="h-5 w-5 text-sky-300" /> {title}
          </p>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** As casas de `ownerId` que dá pra trocar (sem construção no grupo). */
function tradable(view: MonoView, ownerId: string): { idx: number; blocked: boolean }[] {
  const ed = getEdition(view.edition);
  const out: { idx: number; blocked: boolean }[] = [];
  view.props.forEach((pr, idx) => {
    if (pr?.owner !== ownerId) return;
    const sq = ed.squares[idx];
    let blocked = false;
    if (sq.kind === "street") {
      blocked = ed.squares.some((o, j) => o.kind === "street" && o.group === sq.group && (view.props[j]?.houses ?? 0) > 0);
    }
    out.push({ idx, blocked });
  });
  return out;
}

/** Lista legível do que está numa oferta. */
export function BundleList({ view, bundle, empty = "nada" }: { view: MonoView; bundle: Bundle; empty?: string }) {
  const ed = getEdition(view.edition);
  const nothing = bundle.cash === 0 && bundle.props.length === 0 && bundle.jailCards === 0;
  return (
    <ul className="space-y-1 text-sm text-white">
      {nothing && <li className="text-zinc-400">{empty}</li>}
      {bundle.cash > 0 && <li className="font-black text-emerald-300">💵 {money(view.edition, bundle.cash)}</li>}
      {bundle.props.map((i) => {
        const sq = ed.squares[i];
        return (
          <li key={i} className="flex items-center gap-1.5">
            <span className="h-4 w-1.5 rounded-full" style={{ background: sq.kind === "street" ? GROUP_COLOR[sq.group] : "#71717a" }} />
            <span className="truncate">
              {squareIcon(ed, i)} {"name" in sq ? sq.name : ""}
            </span>
            {view.props[i]?.mortgaged && <span className="text-[0.65rem] font-bold text-red-300">(hipotecada)</span>}
          </li>
        );
      })}
      {bundle.jailCards > 0 && <li>🗝️ {bundle.jailCards} carta{bundle.jailCards > 1 ? "s" : ""} de saída da prisão</li>}
    </ul>
  );
}

function Side({
  title,
  who,
  view,
  cash,
  setCash,
  max,
  props,
  chosen,
  toggle,
  cards,
  setCards,
  maxCards,
  side,
}: {
  title: string;
  who: string;
  view: MonoView;
  cash: string;
  setCash: (v: string) => void;
  max: number;
  props: { idx: number; blocked: boolean }[];
  chosen: Set<number>;
  toggle: (i: number) => void;
  cards: number;
  setCards: (n: number) => void;
  maxCards: number;
  side: "give" | "take";
}) {
  const ed = getEdition(view.edition);
  return (
    <div className="space-y-2 rounded-xl bg-black/40 p-2.5" data-mono-trade-side={side}>
      <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{title}</p>
      <p className="text-xs text-zinc-500">{who} tem {money(view.edition, max)}</p>
      <label className="flex items-center gap-2 text-sm text-white">
        💵
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          placeholder="0"
          data-mono-trade-cash={side}
          className="h-9 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-2 text-sm font-bold text-white placeholder:text-zinc-600"
        />
      </label>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {props.length === 0 && <p className="text-xs text-zinc-500">Nenhuma propriedade.</p>}
        {props.map(({ idx, blocked }) => {
          const sq = ed.squares[idx];
          const on = chosen.has(idx);
          return (
            <button
              key={idx}
              type="button"
              disabled={blocked}
              onClick={() => toggle(idx)}
              data-mono-trade-prop={`${side}-${idx}`}
              data-on={on ? "true" : "false"}
              title={blocked ? "Tem construção no grupo: venda as casas antes" : undefined}
              className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition-colors ${on ? "border-sky-300 bg-sky-400/20 text-white" : "border-white/10 bg-white/5 text-zinc-200"} ${blocked ? "cursor-not-allowed opacity-40" : "hover:bg-white/10"}`}
            >
              <span className="h-4 w-1.5 shrink-0 rounded-full" style={{ background: sq.kind === "street" ? GROUP_COLOR[sq.group] : "#71717a" }} />
              <span className="min-w-0 flex-1 truncate">
                {squareIcon(ed, idx)} {"name" in sq ? sq.name : ""}
              </span>
              {view.props[idx]?.mortgaged && <span className="text-[0.6rem] font-bold text-red-300">hip.</span>}
              {on && <Check className="h-3.5 w-3.5 text-sky-300" />}
            </button>
          );
        })}
      </div>
      {maxCards > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-200">
          <span>🗝️ Cartas de saída da prisão</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => setCards(Math.max(0, cards - 1))} className="rounded bg-white/10 p-0.5 hover:bg-white/20" aria-label="Menos uma carta">
              <Minus className="h-3 w-3" />
            </button>
            <b className="w-3 text-center tabular-nums">{cards}</b>
            <button type="button" onClick={() => setCards(Math.min(maxCards, cards + 1))} className="rounded bg-white/10 p-0.5 hover:bg-white/20" aria-label="Mais uma carta">
              <Plus className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Montar e enviar uma proposta. */
export function TradeComposer({ session, view, onClose }: { session: MonopolySession; view: MonoView; onClose: () => void }) {
  const me = view.players.find((p) => p.id === session.me)!;
  const others = view.players.filter((p) => p.id !== session.me && !p.bankrupt);
  const [to, setTo] = useState<string | null>(others.length === 1 ? others[0].id : null);
  const [giveCash, setGiveCash] = useState("");
  const [takeCash, setTakeCash] = useState("");
  const [give, setGive] = useState<Set<number>>(new Set());
  const [take, setTake] = useState<Set<number>>(new Set());
  const [giveCards, setGiveCards] = useState(0);
  const [takeCards, setTakeCards] = useState(0);
  const target = others.find((p) => p.id === to);
  const ui = EDITION_UI[view.edition];

  const mine = useMemo(() => tradable(view, me.id), [view, me.id]);
  const theirs = useMemo(() => (to ? tradable(view, to) : []), [view, to]);

  const flip = (set: Set<number>, setter: (s: Set<number>) => void) => (i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setter(next);
  };
  const num = (s: string) => Math.max(0, Number.parseInt(s, 10) || 0);
  const bundle = (cash: string, props: Set<number>, jail: number): Bundle => ({ cash: num(cash), props: [...props].sort((a, b) => a - b), jailCards: jail });
  const offer = bundle(giveCash, give, giveCards);
  const ask = bundle(takeCash, take, takeCards);
  const empty = offer.cash === 0 && offer.props.length === 0 && offer.jailCards === 0 && ask.cash === 0 && ask.props.length === 0 && ask.jailCards === 0;
  const tooMuch = !!target && (offer.cash > me.cash || ask.cash > target.cash);

  return (
    <Shell title="Propor uma troca" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-mono-trade-composer="">
        <div className="space-y-1.5">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Com quem?</p>
          <div className="flex flex-wrap gap-1.5">
            {others.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setTo(p.id);
                  setTake(new Set());
                  setTakeCards(0);
                }}
                data-mono-trade-to={p.id}
                className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 text-sm font-bold text-white transition-colors ${to === p.id ? "border-sky-300 bg-sky-400/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
              >
                <PlayerAvatar avatarUrl={p.avatarUrl} name={p.name} className="h-5 w-5 text-[0.55rem]" />
                <span style={{ color: playerColor(view.players, p.id) }}>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
        {target ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Side title="Você oferece" who="Você" view={view} cash={giveCash} setCash={setGiveCash} max={me.cash} props={mine} chosen={give} toggle={flip(give, setGive)} cards={giveCards} setCards={setGiveCards} maxCards={me.jailCards.length} side="give" />
            <Side title={`Você pede de ${target.name}`} who={target.name} view={view} cash={takeCash} setCash={setTakeCash} max={target.cash} props={theirs} chosen={take} toggle={flip(take, setTake)} cards={takeCards} setCards={setTakeCards} maxCards={target.jailCards.length} side="take" />
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-zinc-400">Escolha com quem trocar.</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-white/10 p-3">
        <p className="text-xs text-zinc-400">{tooMuch ? "Alguém não tem esse dinheiro." : empty ? "Escolha o que entra na troca." : "A outra pessoa pode aceitar ou recusar."}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="text-zinc-300">
            Cancelar
          </Button>
          <Button
            disabled={!target || empty || tooMuch}
            onClick={() => {
              session.send({ type: "propose_trade", to: target!.id, give: offer, take: ask });
              onClose();
            }}
            className={`${ui.accent} font-black text-white`}
            data-mono-trade-send=""
          >
            Enviar proposta
          </Button>
        </div>
      </div>
    </Shell>
  );
}

/** A proposta que chegou pra mim: aceitar ou recusar. */
export function TradeOffer({ session, view }: { session: MonopolySession; view: MonoView }) {
  const t = view.trade;
  if (!t || t.to !== session.me) return null;
  const from = view.players.find((p) => p.id === t.from);
  const me = view.players.find((p) => p.id === session.me);
  const cantPay = !!me && t.take.cash > me.cash;
  return (
    <Shell title={`${from?.name ?? "Alguém"} propõe uma troca`} onClose={() => session.send({ type: "decline_trade" })}>
      <div className="grid gap-3 p-3 sm:grid-cols-2" data-mono-trade-offer="">
        <div className="rounded-xl bg-emerald-950/40 p-3">
          <p className="mb-1.5 text-xs font-black uppercase tracking-widest text-emerald-300">Você recebe</p>
          <BundleList view={view} bundle={t.give} />
        </div>
        <div className="rounded-xl bg-red-950/40 p-3">
          <p className="mb-1.5 text-xs font-black uppercase tracking-widest text-red-300">Você entrega</p>
          <BundleList view={view} bundle={t.take} />
        </div>
      </div>
      {cantPay && <p className="px-3 text-xs font-bold text-amber-300">Você não tem esse dinheiro pra aceitar.</p>}
      <div className="flex justify-end gap-2 border-t border-white/10 p-3">
        <Button variant="secondary" onClick={() => session.send({ type: "decline_trade" })} data-mono-trade-decline="">
          Recusar
        </Button>
        <Button disabled={cantPay} onClick={() => session.send({ type: "accept_trade" })} className="bg-emerald-600 font-black text-white hover:bg-emerald-700" data-mono-trade-accept="">
          Aceitar
        </Button>
      </div>
    </Shell>
  );
}
