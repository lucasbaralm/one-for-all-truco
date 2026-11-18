"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Hammer, Landmark, Minus, Plus, Undo2, X } from "lucide-react";
import { GROUP_COLOR, Group, getEdition, mortgageValue, unmortgageCost } from "@/lib/monopoly/editions";
import { MonoView, buildError, mortgageError, netWorth, rentOf, sellError, unmortgageError } from "@/lib/monopoly/engine";
import { money } from "@/lib/monopoly/labels";
import { MONO_ERROR_LABEL } from "@/lib/monopoly/protocol";
import { playerColor } from "@/lib/playerColors";
import { squareIcon } from "./Deed";
import type { MonopolySession } from "./useMonopolySession";

// As propriedades de um jogador, agrupadas por cor. Nas MINHAS, os botões de construir, vender casa,
// hipotecar e tirar a hipoteca — habilitados só quando o servidor diz que dá (`view.me`), e desabilitados
// com o motivo quando não (ex.: "construa parelho"). Nas dos outros, só olhar.

const GROUP_ORDER: Group[] = ["brown", "sky", "pink", "orange", "red", "yellow", "green", "navy"];

function Btn({ children, onClick, disabled, title, ...data }: { children: ReactNode; onClick: () => void; disabled: boolean; title?: string; [k: `data-${string}`]: string | undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2 text-[0.7rem] font-bold text-white transition-colors enabled:hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-35"
      {...data}
    >
      {children}
    </button>
  );
}

export function AssetsDialog({ session, view, playerId, onClose }: { session: MonopolySession; view: MonoView; playerId: string; onClose: () => void }) {
  const ed = getEdition(view.edition);
  const owner = view.players.find((p) => p.id === playerId);
  const isMine = playerId === session.me;
  const a = view.me;
  const color = owner ? playerColor(view.players, owner.id) : "#fff";

  const owned: number[] = [];
  view.props.forEach((p, i) => {
    if (p?.owner === playerId) owned.push(i);
  });
  const streetsOf = (g: Group) => owned.filter((i) => {
    const sq = ed.squares[i];
    return sq.kind === "street" && sq.group === g;
  });
  const others = owned.filter((i) => ed.squares[i].kind !== "street");
  const reason = (code: string | null) => (code ? (MONO_ERROR_LABEL[code] ?? code) : undefined);

  // função (não componente): componentes criados durante a renderização perdem o estado a cada render
  const renderRow = (i: number) => {
    const sq = ed.squares[i];
    const pr = view.props[i]!;
    if (!("price" in sq)) return null;
    const rent = rentOf(view, i, 7);
    const canBuild = a.build.includes(i);
    const canSell = a.sell.includes(i);
    const canMort = a.mortgage.includes(i);
    const canUnmort = a.unmortgage.includes(i);
    const isStreet = sq.kind === "street";
    const myTurnActions = isMine && view.phase === "playing";
    return (
      <div className="rounded-xl bg-black/40 p-2" data-mono-asset={i} data-houses={pr.houses} data-mortgaged={pr.mortgaged ? "true" : "false"}>
        <div className="flex items-center gap-2">
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: isStreet ? GROUP_COLOR[sq.group] : "#71717a" }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">
              <span className="mr-1">{squareIcon(ed, i)}</span>
              {sq.name}
            </p>
            <p className="text-[0.7rem] text-zinc-400">
              {pr.mortgaged ? <span className="font-bold text-red-300">hipotecada (recebeu {money(view.edition, mortgageValue(sq))})</span> : <>aluguel {money(view.edition, rent)}</>}
              {isStreet && pr.houses > 0 && <span className="ml-1.5 font-bold text-emerald-300">· {pr.houses === 5 ? "🏨 hotel" : `🏠×${pr.houses}`}</span>}
            </p>
          </div>
        </div>
        {myTurnActions && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {isStreet && (
              <>
                <Btn onClick={() => session.send({ type: "build", sq: i })} disabled={!canBuild} title={canBuild ? undefined : reason(buildError(view, session.me, i))} data-mono-build={String(i)}>
                  <Plus className="h-3 w-3" /> <Hammer className="h-3 w-3" /> {money(view.edition, sq.houseCost)}
                </Btn>
                <Btn onClick={() => session.send({ type: "sell", sq: i })} disabled={!canSell} title={canSell ? undefined : reason(sellError(view, session.me, i))} data-mono-sell={String(i)}>
                  <Minus className="h-3 w-3" /> casa +{money(view.edition, Math.floor(sq.houseCost / 2))}
                </Btn>
              </>
            )}
            {pr.mortgaged ? (
              <Btn onClick={() => session.send({ type: "unmortgage", sq: i })} disabled={!canUnmort} title={canUnmort ? undefined : reason(unmortgageError(view, session.me, i))} data-mono-unmortgage={String(i)}>
                <Undo2 className="h-3 w-3" /> Tirar hipoteca −{money(view.edition, unmortgageCost(sq))}
              </Btn>
            ) : (
              <Btn onClick={() => session.send({ type: "mortgage", sq: i })} disabled={!canMort} title={canMort ? undefined : reason(mortgageError(view, session.me, i))} data-mono-mortgage={String(i)}>
                <Landmark className="h-3 w-3" /> Hipotecar +{money(view.edition, mortgageValue(sq))}
              </Btn>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="flex max-h-full w-full max-w-md flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        data-mono-assets-dialog={playerId}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-3">
          <div>
            <p className="flex items-center gap-2 text-lg font-black text-white">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              {isMine ? "Suas propriedades" : `Propriedades de ${owner?.name ?? "?"}`}
            </p>
            {owner && !owner.bankrupt && (
              <p className="text-xs text-zinc-400">
                {money(view.edition, owner.cash)} em dinheiro · patrimônio {money(view.edition, netWorth(view, owner.id))}
                {owner.jailCards.length > 0 && ` · 🗝️×${owner.jailCards.length}`}
              </p>
            )}
            <p className="text-[0.7rem] text-zinc-500">
              Banco: {view.supply.houses} casas · {view.supply.hotels} hotéis
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white" data-mono-close="">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {owned.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">Nenhuma propriedade ainda.</p>}
          {GROUP_ORDER.map((g) => {
            const list = streetsOf(g);
            if (list.length === 0) return null;
            const total = ed.squares.filter((s) => s.kind === "street" && s.group === g).length;
            return (
              <section key={g} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-widest text-zinc-400">
                  <span className="h-2 w-6 rounded-full" style={{ background: GROUP_COLOR[g] }} />
                  {list.length}/{total} {list.length === total && <span className="text-emerald-300">grupo completo</span>}
                </p>
                {list.map((i) => (
                  <div key={i}>{renderRow(i)}</div>
                ))}
              </section>
            );
          })}
          {others.length > 0 && (
            <section className="space-y-1.5">
              <p className="text-[0.65rem] font-black uppercase tracking-widest text-zinc-400">Transportes e serviços</p>
              {others.map((i) => (
                <div key={i}>{renderRow(i)}</div>
              ))}
            </section>
          )}
          {isMine && view.phase === "playing" && (
            <p className="rounded-lg bg-white/5 p-2 text-[0.7rem] text-zinc-400">
              Construir e tirar hipoteca só na sua vez, na fase livre. Construa parelho dentro do grupo de cor. Vender casas e hipotecar vale também pra levantar dinheiro.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
