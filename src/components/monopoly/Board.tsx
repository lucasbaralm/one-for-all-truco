"use client";

import { ReactNode, useState } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { GROUP_COLOR, getEdition } from "@/lib/monopoly/editions";
import type { MonoPlayer, MonoView } from "@/lib/monopoly/engine";
import { centerOf, cellOf, innerEdge, sideOf, slotOffset, walkPath } from "@/lib/monopoly/geometry";
import { money } from "@/lib/monopoly/labels";
import { TIMING } from "@/lib/monopoly/timing";
import { playerColor } from "@/lib/playerColors";
import { squareIcon } from "./Deed";
import { EDITION_UI } from "./edition-ui";

// O tabuleiro: grid 11×11 com as 40 casas em volta e o miolo livre (dados, cartas, avisos). As peças
// ficam numa camada por cima e andam casa a casa. Tudo é dimensionado por `--s` (o lado do tabuleiro,
// definido pelo layout), então o mesmo componente serve pro celular e pro monitor.

function Houses({ houses }: { houses: number }) {
  if (houses === 0) return null;
  if (houses === 5) return <span className="mono-hotel" aria-label="hotel" />;
  return (
    <>
      {Array.from({ length: houses }).map((_, i) => (
        <span key={i} className="mono-house" aria-hidden />
      ))}
    </>
  );
}

function Square({
  view,
  idx,
  onClick,
  active,
}: {
  view: MonoView;
  idx: number;
  onClick: (idx: number) => void;
  active: boolean;
}) {
  const ed = getEdition(view.edition);
  const ui = EDITION_UI[view.edition];
  const sq = ed.squares[idx];
  const prop = view.props[idx];
  const { col, row } = cellOf(idx);
  const inner = innerEdge(idx);
  const owner = prop?.owner ? view.players.find((p) => p.id === prop.owner) : undefined;
  const ownerColor = owner ? playerColor(view.players, owner.id) : undefined;
  const icon = squareIcon(ed, idx);
  const name = sq.kind === "card" ? ed.deckNames[sq.deck] : sq.name;
  const corner = sideOf(idx) === "corner";
  const price = "price" in sq ? sq.price : sq.kind === "tax" ? sq.amount : sq.kind === "bonus" ? sq.amount : null;

  return (
    <button
      type="button"
      onClick={() => onClick(idx)}
      className="mono-sq"
      data-mono-sq={idx}
      data-kind={sq.kind}
      data-side={sideOf(idx)}
      data-inner={inner ?? ""}
      data-owner={owner?.id ?? ""}
      data-houses={prop?.houses ?? 0}
      data-mortgaged={prop?.mortgaged ? "true" : "false"}
      data-active={active ? "true" : "false"}
      aria-label={`${name}${owner ? `, de ${owner.name}` : ""}`}
      style={{
        gridColumn: col,
        gridRow: row,
        // casa de carta: a cor do baralho (laranja = Sorte, azul = Caixa Comunitária, verde = Sorte ou Revés) com texto claro
        background: sq.kind === "card" ? ui.deckColor[sq.deck] : ui.cell,
        color: sq.kind === "card" ? "#fff" : ui.ink,
        boxShadow: ownerColor ? `inset 0 0 0 0.28em ${ownerColor}` : undefined,
      }}
    >
      {sq.kind === "street" && (
        <span className="mono-band" style={{ background: GROUP_COLOR[sq.group] }}>
          <Houses houses={prop?.houses ?? 0} />
        </span>
      )}
      <span className="mono-sq-body">
        {icon && <span className="mono-sq-icon">{icon}</span>}
        <span className="mono-sq-name">{name}</span>
        {price !== null && (
          <span className="mono-sq-price">
            {sq.kind === "tax" ? "−" : sq.kind === "bonus" ? "+" : ""}
            {money(view.edition, price)}
          </span>
        )}
        {corner && sq.kind === "go" && <span className="mono-sq-price">+{money(view.edition, ed.salary)}</span>}
      </span>
      {prop?.mortgaged && <span className="mono-mortgaged">H</span>}
    </button>
  );
}

/** A peça de um jogador: anda casa a casa quando o deslocamento é curto, e pula direto no resto. */
function Token({ player, seat, view, color, total, slot, delayMs }: { player: MonoPlayer; seat: number; view: MonoView; color: string; total: number; slot: number; delayMs: number }) {
  const ed = getEdition(view.edition);
  const pos = player.pos;
  // Guarda de onde a peça veio (padrão "estado derivado": ajusta durante a renderização, sem efeito).
  const [track, setTrack] = useState({ pos, path: [pos] });
  if (track.pos !== pos) setTrack({ pos, path: walkPath(track.pos, pos) });

  const off = slotOffset(slot, total);
  const jailed = player.jail !== null;
  // Quem está preso fica "atrás das grades" (canto de dentro da casa); quem só visita, no cantinho de fora.
  const jailShift = pos === ed.jailIndex ? (jailed ? { dx: 1.6, dy: -1.6 } : { dx: -1.8, dy: 1.8 }) : { dx: 0, dy: 0 };
  const xs = track.path.map((i) => `${centerOf(i).x + off.dx + (i === ed.jailIndex ? jailShift.dx : 0)}%`);
  const ys = track.path.map((i) => `${centerOf(i).y + off.dy + (i === ed.jailIndex ? jailShift.dy : 0)}%`);
  const steps = track.path.length;
  const duration = steps <= 1 ? 0.35 : (steps * TIMING.STEP_MS) / 1000;
  const isTurn = view.phase === "playing" && view.players[view.turn]?.id === player.id;

  return (
    <motion.div
      className="mono-token"
      data-mono-token={player.id}
      data-pos={pos}
      data-jailed={jailed ? "true" : "false"}
      initial={false}
      animate={{ left: steps > 1 ? [null, ...xs] : xs[0], top: steps > 1 ? [null, ...ys] : ys[0] }}
      transition={{ duration, delay: delayMs / 1000, ease: "linear" }}
      style={{ zIndex: isTurn ? 30 : 20 + seat, borderColor: color, background: "#fff" }}
    >
      <span className="mono-token-emoji" aria-hidden>
        {ed.tokens[seat % ed.tokens.length]}
      </span>
      {jailed && (
        <span className="mono-token-lock">
          <Lock className="h-full w-full" />
        </span>
      )}
      {isTurn && <span className="mono-token-ring" style={{ borderColor: color }} />}
    </motion.div>
  );
}

export function Board({
  view,
  onSquare,
  tokenDelayMs,
  children,
}: {
  view: MonoView;
  onSquare: (idx: number) => void;
  /** Espera antes de a peça andar (os dados ainda estão rolando). */
  tokenDelayMs: number;
  children: ReactNode;
}) {
  const ed = getEdition(view.edition);
  const ui = EDITION_UI[view.edition];
  const current = view.players[view.turn];
  const activeSq = view.phase === "playing" && (view.step === "buy" || view.step === "auction") && current ? (view.auction?.sq ?? current.pos) : -1;

  // Peças em jogo, na ordem da mesa (a ficha de cada um vem do lugar dele).
  const alive = view.players.map((p, seat) => ({ p, seat })).filter(({ p }) => !p.bankrupt);

  return (
    <div className="mono-board" style={{ background: ui.line, ["--cell" as string]: ui.cell, ["--ink" as string]: ui.ink }} data-mono-board="" data-edition={view.edition}>
      <div className="mono-grid">
        {ed.squares.map((_, i) => (
          <Square key={i} view={view} idx={i} onClick={onSquare} active={i === activeSq} />
        ))}
        <div className="mono-center" style={{ background: ui.center, color: ui.ink }}>
          {children}
        </div>
      </div>
      <div className="mono-tokens" aria-hidden={false}>
        {alive.map(({ p, seat }) => {
          // quem divide a casa com outras peças se espalha nela
          const mates = alive.filter((x) => x.p.pos === p.pos);
          const slot = mates.findIndex((x) => x.p.id === p.id);
          return <Token key={p.id} player={p} seat={seat} view={view} color={playerColor(view.players, p.id)} total={mates.length} slot={slot} delayMs={tokenDelayMs} />;
        })}
      </div>
    </div>
  );
}
