"use client";

import { ReactNode, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gavel, Handshake, Landmark, Loader2, Lock, ScrollText, Skull, Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEdition } from "@/lib/monopoly/editions";
import type { MonoView } from "@/lib/monopoly/engine";
import { money, squareLabel } from "@/lib/monopoly/labels";
import { playerColor } from "@/lib/playerColors";
import { Deed } from "./Deed";
import { EDITION_UI } from "./edition-ui";
import type { MonopolySession } from "./useMonopolySession";

// O painel de ações: diz de quem é a vez e mostra SÓ o que dá pra fazer agora (o servidor entrega
// pronto em `view.me`) — rolar, comprar ou recusar, dar lance, pagar a dívida, encerrar a vez — mais
// os atalhos de propriedades, trocas e desistir.

type Tone = "primary" | "secondary" | "danger" | "ghost";

function Act({
  children,
  onClick,
  disabled,
  tone = "primary",
  accent,
  className = "",
  ...data
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: Tone;
  accent?: string;
  className?: string;
  [k: `data-${string}`]: string | undefined;
}) {
  const look =
    tone === "primary"
      ? `${accent ?? "bg-red-600 hover:bg-red-700"} text-white`
      : tone === "danger"
        ? "bg-zinc-800 text-red-300 hover:bg-red-950"
        : tone === "ghost"
          ? "bg-transparent text-zinc-300 hover:bg-white/10"
          : "bg-white/10 text-white hover:bg-white/20";
  return (
    <Button type="button" onClick={onClick} disabled={disabled} className={`h-10 gap-1.5 rounded-xl px-3 text-sm font-black ${look} ${className}`} {...data}>
      {children}
    </Button>
  );
}

const DEBT_REASON: Record<string, string> = { rent: "aluguel", tax: "imposto", card: "carta", bail: "fiança da prisão", repairs: "reparos" };

export function ActionPanel({
  session,
  view,
  onAssets,
  onTrade,
  onResign,
}: {
  session: MonopolySession;
  view: MonoView;
  onAssets: (playerId: string) => void;
  onTrade: () => void;
  onResign: () => void;
}) {
  const me = session.me;
  const a = view.me;
  const ui = EDITION_UI[view.edition];
  const ed = getEdition(view.edition);
  const mine = view.players.find((p) => p.id === me);
  const current = view.players[view.turn];
  const playing = view.phase === "playing";
  const myTurn = playing && current?.id === me;
  const send = session.send;
  const [confirmBankrupt, setConfirmBankrupt] = useState(false);
  const [bidText, setBidText] = useState("");

  // ── cabeçalho: de quem é a vez
  const roundLabel = view.settings.limit > 0 ? `Rodada ${Math.min(view.round, view.settings.limit)}/${view.settings.limit}` : `Rodada ${view.round}`;
  let body: ReactNode = null;

  if (!playing) body = null;
  else if (!mine || mine.bankrupt) {
    body = <Note>{mine?.bankrupt ? "Você faliu — agora é só assistir 🍿" : "Você está assistindo a partida."}</Note>;
  } else if (view.step === "auction" && view.auction) {
    const au = view.auction;
    const leader = au.leader ? view.players.find((p) => p.id === au.leader) : undefined;
    const bidder = view.players.find((p) => p.id === au.bidder);
    const raise = (inc: number) => Math.max(a.minBid, au.bid + inc);
    const typed = Number.parseInt(bidText, 10);
    body = (
      <div className="space-y-2" data-mono-auction={au.sq}>
        <p className="flex items-center gap-1.5 text-sm font-black text-amber-300">
          <Gavel className="h-4 w-4" /> Leilão: {squareLabel(view.edition, au.sq)}
        </p>
        <p className="text-sm text-white">
          {leader ? (
            <>
              Maior lance: <b data-mono-top-bid={au.bid}>{money(view.edition, au.bid)}</b> de <b style={{ color: playerColor(view.players, leader.id) }}>{leader.id === me ? "você" : leader.name}</b>
            </>
          ) : (
            "Ninguém deu lance ainda."
          )}
        </p>
        {a.bid || a.passBid ? (
          <div className="space-y-1.5 rounded-xl border border-amber-300/40 bg-amber-400/10 p-2">
            <p className="text-xs font-black uppercase tracking-wide text-amber-200">Sua vez de dar lance</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[10, 50, 100].map((inc) => {
                const amount = raise(inc);
                return (
                  <Act key={inc} tone="secondary" onClick={() => send({ type: "bid", amount })} disabled={!a.bid || amount > a.maxBid} data-mono-bid={String(amount)} className="h-9 px-1 text-xs">
                    +{inc}
                    <span className="hidden text-[0.65rem] font-semibold opacity-70 sm:inline">({money(view.edition, amount)})</span>
                  </Act>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={a.minBid}
                max={a.maxBid}
                value={bidText}
                onChange={(e) => setBidText(e.target.value)}
                placeholder={`mín. ${a.minBid}`}
                data-mono-bid-input=""
                className="h-9 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-2 text-sm font-bold text-white placeholder:text-zinc-500"
              />
              <Act
                tone="primary"
                accent={ui.accent}
                disabled={!a.bid || !Number.isFinite(typed) || typed < a.minBid || typed > a.maxBid}
                onClick={() => {
                  send({ type: "bid", amount: typed });
                  setBidText("");
                }}
                data-mono-bid-submit=""
                className="h-9"
              >
                Dar lance
              </Act>
            </div>
            <Act tone="ghost" onClick={() => send({ type: "pass_bid" })} data-mono-pass="" className="h-8 w-full text-xs">
              Passar (não quero)
            </Act>
          </div>
        ) : (
          <Note>
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Vez de {bidder?.name ?? "alguém"} dar lance…
          </Note>
        )}
        <Deed edition={view.edition} idx={au.sq} prop={view.props[au.sq]} players={view.players} className="text-[0.95em]" />
      </div>
    );
  } else if (view.step === "debt" && view.debt) {
    const d = view.debt;
    const to = d.to === "bank" ? "o banco" : d.to === "each" ? "cada jogador" : (view.players.find((p) => p.id === d.to)?.name ?? "alguém");
    const missing = Math.max(0, d.amount - (mine?.cash ?? 0));
    body = myTurn ? (
      <div className="space-y-2 rounded-xl border border-red-400/50 bg-red-950/50 p-2.5" data-mono-debt={d.amount}>
        <p className="flex items-center gap-1.5 text-sm font-black text-red-200">
          <Landmark className="h-4 w-4" /> Você deve {money(view.edition, d.amount)} a {to}
        </p>
        <p className="text-xs text-red-100/80">
          {DEBT_REASON[d.reason] ?? "dívida"}
          {d.sq !== undefined ? ` · ${squareLabel(view.edition, d.sq)}` : ""} — você tem {money(view.edition, mine?.cash ?? 0)}
          {missing > 0 ? `, faltam ${money(view.edition, missing)}.` : "."}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <Act onClick={() => send({ type: "pay_debt" })} disabled={!a.payDebt} accent={ui.accent} data-mono-pay-debt="">
            Pagar agora
          </Act>
          <Act tone="secondary" onClick={() => onAssets(me)} data-mono-open-assets="">
            Vender / hipotecar
          </Act>
        </div>
        {missing > 0 && (
          <p className="text-[0.7rem] text-red-100/70">Venda casas ou hipoteque propriedades pra levantar o dinheiro. Sem saída, declare falência.</p>
        )}
        {confirmBankrupt ? (
          <div className="flex gap-1.5">
            <Act tone="danger" onClick={() => send({ type: "bankrupt" })} className="flex-1" data-mono-bankrupt-confirm="">
              <Skull className="h-4 w-4" /> Confirmar falência
            </Act>
            <Act tone="ghost" onClick={() => setConfirmBankrupt(false)}>
              Voltar
            </Act>
          </div>
        ) : (
          <Act tone="danger" onClick={() => setConfirmBankrupt(true)} className="w-full" data-mono-bankrupt="">
            <Skull className="h-4 w-4" /> Declarar falência
          </Act>
        )}
      </div>
    ) : (
      <Note>
        <b style={{ color: playerColor(view.players, current.id) }}>{current.name}</b> está sem dinheiro pra pagar {money(view.edition, d.amount)} a {to}…
      </Note>
    );
  } else if (view.step === "buy" && current) {
    const sq = current.pos;
    // os botões vêm ANTES da escritura: o que importa (comprar/recusar) nunca fica abaixo da dobra em tela pequena
    body = myTurn ? (
      <div className="space-y-2" data-mono-buying={sq}>
        <div className="grid grid-cols-2 gap-1.5">
          <Act onClick={() => send({ type: "buy" })} disabled={!a.buy} accent={ui.accent} data-mono-buy="">
            Comprar {"price" in ed.squares[sq] ? money(view.edition, ed.squares[sq].price) : ""}
          </Act>
          <Act tone="secondary" onClick={() => send({ type: "decline" })} data-mono-decline="">
            {ed.auction ? "Leilão" : "Não comprar"}
          </Act>
        </div>
        {!a.buy && <p className="text-xs text-amber-200">Dinheiro insuficiente — hipoteque algo pra comprar, ou recuse.</p>}
        {ed.auction && <p className="text-[0.7rem] text-zinc-400">Se você não comprar, a propriedade vai a leilão entre todos.</p>}
        <Deed edition={view.edition} idx={sq} prop={view.props[sq]} players={view.players} className="text-[0.95em]" />
      </div>
    ) : (
      <Note>
        <b style={{ color: playerColor(view.players, current.id) }}>{current.name}</b> está decidindo se compra <b>{squareLabel(view.edition, sq)}</b> ({money(view.edition, "price" in ed.squares[sq] ? ed.squares[sq].price : 0)})…
      </Note>
    );
  } else if (view.step === "roll" && current) {
    if (myTurn) {
      const jail = mine.jail;
      body = (
        <div className="space-y-2">
          {jail !== null && (
            <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-2 text-sm text-amber-100">
              <p className="flex items-center gap-1.5 font-black">
                <Lock className="h-4 w-4" /> Você está na {ed.words.jail.toLowerCase()} (tentativa {jail + 1}/3)
              </p>
              <p className="text-xs opacity-80">Tire dupla pra sair, pague {money(view.edition, ed.bail)} ou use a carta. Na 3ª tentativa a fiança é paga e você anda.</p>
            </div>
          )}
          {jail === null && view.doubles > 0 && <p className="text-sm font-black text-emerald-300">🎲 Dobrou! Jogue de novo.</p>}
          <Act onClick={() => send({ type: "roll" })} disabled={!a.roll} accent={ui.accent} className="h-12 w-full text-base" data-mono-roll="">
            <Dices className="h-5 w-5" /> {jail !== null ? "Tentar tirar dupla" : "Rolar os dados"}
          </Act>
          {jail !== null && (
            <div className="grid grid-cols-2 gap-1.5">
              <Act tone="secondary" onClick={() => send({ type: "pay_bail" })} disabled={!a.payBail} data-mono-bail="">
                Pagar {money(view.edition, ed.bail)}
              </Act>
              <Act tone="secondary" onClick={() => send({ type: "use_card" })} disabled={!a.useJailCard} data-mono-jailcard="">
                🗝️ Usar carta
              </Act>
            </div>
          )}
        </div>
      );
    } else {
      body = (
        <Note>
          <b style={{ color: playerColor(view.players, current.id) }}>{current.name}</b>{" "}
          {current.jail !== null ? "está preso e vai tentar sair…" : view.doubles > 0 ? "dobrou os dados e joga de novo…" : "vai rolar os dados…"}
        </Note>
      );
    }
  } else if (view.step === "manage" && current) {
    body = myTurn ? (
      <div className="space-y-1.5">
        <Act onClick={() => send({ type: "end_turn" })} disabled={!a.endTurn} accent={ui.accent} className="h-11 w-full text-base" data-mono-end="">
          Encerrar a vez
        </Act>
        <p className="text-[0.7rem] text-zinc-400">
          {a.endTurn ? "Antes disso você pode construir, hipotecar ou propor uma troca." : "Espere a resposta da troca pra continuar."}
        </p>
      </div>
    ) : (
      <Note>
        <b style={{ color: playerColor(view.players, current.id) }}>{current.name}</b> está organizando as propriedades…
      </Note>
    );
  }

  const trade = view.trade;
  const tradeWith = trade && trade.from === me ? view.players.find((p) => p.id === trade.to) : undefined;

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/55 p-2.5" data-mono-actions="" data-step={view.step} data-my-turn={myTurn ? "true" : "false"}>
      <div className="flex items-center justify-between gap-2">
        {playing && current ? (
          <p className={`min-w-0 truncate text-sm font-black ${myTurn ? "text-yellow-300" : "text-white"}`}>
            {myTurn ? "Sua vez!" : `Vez de ${current.name}`}
          </p>
        ) : (
          <p className="text-sm font-black text-white">Partida encerrada</p>
        )}
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-bold text-zinc-300" data-mono-round={view.round}>
          {roundLabel}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${view.step}-${current?.id}-${view.auction?.bidder ?? ""}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {body}
        </motion.div>
      </AnimatePresence>

      {tradeWith && (
        <div className="space-y-1.5 rounded-xl border border-sky-300/40 bg-sky-400/10 p-2 text-sm text-sky-100" data-mono-trade-waiting="">
          <p className="flex items-center gap-1.5 font-bold">
            <Handshake className="h-4 w-4" /> Proposta enviada a {tradeWith.name}…
          </p>
          <Act tone="secondary" onClick={() => send({ type: "cancel_trade" })} disabled={!a.cancelTrade} data-mono-cancel-trade="" className="h-8 w-full text-xs">
            Cancelar proposta
          </Act>
        </div>
      )}

      {playing && mine && !mine.bankrupt && (
        <div className="grid grid-cols-3 gap-1.5">
          <Act tone="secondary" onClick={() => onAssets(me)} className="h-9 px-1 text-xs" data-mono-open-assets="">
            <ScrollText className="h-3.5 w-3.5" /> Propriedades
          </Act>
          <Act tone="secondary" onClick={onTrade} disabled={!a.propose} className="h-9 px-1 text-xs" data-mono-open-trade="">
            <Handshake className="h-3.5 w-3.5" /> Trocar
          </Act>
          <Act tone="ghost" onClick={onResign} className="h-9 px-1 text-xs text-zinc-400" data-mono-resign="">
            <Skull className="h-3.5 w-3.5" /> Desistir
          </Act>
        </div>
      )}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-white/5 px-2.5 py-2 text-sm text-zinc-200">{children}</p>;
}
