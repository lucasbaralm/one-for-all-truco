// O que vira linha no histórico do Ludo, a partir das mudanças entre dois
// estados MOSTRADOS (os que a animação já tocou). Peça andando casa a casa não
// entra — isso a tela já mostra; entra o que se perde fácil: o que cada um
// rolou, tirar peça da base, capturas, chegadas em casa, quem caiu.

import type { FeedInput } from "@/lib/feed";
import { FINISHED, IN_BASE, LudoColor } from "./board";
import { LudoState, legalMoves } from "./engine";

export interface FeedCtx {
  /** Id de quem está olhando (vira "Você"). */
  me: string | null;
  /** Cor CSS de cada cor do tabuleiro. */
  hex: (color: LudoColor) => string;
}

const who = (s: LudoState, id: string, ctx: FeedCtx) => (id === ctx.me ? "Você" : (s.players.find((p) => p.id === id)?.name ?? "Alguém"));
const colorOf = (s: LudoState, id: string, ctx: FeedCtx) => {
  const p = s.players.find((x) => x.id === id);
  return p ? ctx.hex(p.color) : undefined;
};

/** A rolada que acabou de ser mostrada (state.lastRoll). */
export function describeRoll(state: LudoState, ctx: FeedCtx): FeedInput | null {
  const r = state.lastRoll;
  if (!r) return null;
  const name = who(state, r.playerId, ctx);
  const color = colorOf(state, r.playerId, ctx);
  if (r.forfeited) return { text: `🎲 ${name} tirou três 6 seguidos e perdeu a vez`, tone: "bad", color };
  const stuck = legalMoves(state).length === 0;
  const text = `🎲 ${name} rolou ${r.value}${stuck ? " — sem jogada" : ""}`;
  return { text, tone: r.value === 6 ? "special" : "info", color };
}

/** A jogada que acabou de ser mostrada (state.lastMove): só o que merece registro. */
export function describeMove(state: LudoState, ctx: FeedCtx): FeedInput[] {
  const m = state.lastMove;
  if (!m) return [];
  const name = who(state, m.playerId, ctx);
  const color = colorOf(state, m.playerId, ctx);
  const out: FeedInput[] = [];

  if (m.from === IN_BASE) out.push({ text: `${name} tirou uma peça da base`, tone: "info", color });

  if (m.captures.length > 0) {
    const victims = [...new Set(m.captures.map((c) => c.playerId))];
    const parts = victims.map((id) => (id === ctx.me ? "sua" : `de ${who(state, id, ctx)}`));
    const tone = victims.includes(ctx.me ?? "") ? "bad" : m.playerId === ctx.me ? "good" : "special";
    out.push({ text: `💥 ${name} capturou uma peça ${parts.join(" e ")}!`, tone, color });
  }

  if (m.finished) {
    const home = state.players.find((p) => p.id === m.playerId)?.pieces.filter((x) => x === FINISHED).length ?? 0;
    out.push({ text: `🏠 ${name} colocou uma peça em casa (${home}/4)`, tone: m.playerId === ctx.me ? "good" : "special", color });
  }
  return out;
}

/** Quem caiu e quem voltou (o bot assume enquanto o humano está fora). */
export function describePresence(prev: LudoState, next: LudoState, ctx: FeedCtx): FeedInput[] {
  const out: FeedInput[] = [];
  for (const p of next.players) {
    if (p.bot || p.id === ctx.me) continue;
    const before = prev.players.find((x) => x.id === p.id);
    if (!before) continue;
    const color = ctx.hex(p.color);
    if (before.connected && !p.connected) out.push({ text: `📡 ${p.name} desconectou — um bot assume`, tone: "bad", color });
    else if (!before.connected && p.connected) out.push({ text: `📡 ${p.name} voltou pra partida`, tone: "good", color });
  }
  return out;
}

export interface FeedDiff {
  /** Partida nova (ou lobby): a lista começa do zero. */
  reset: boolean;
  items: FeedInput[];
}

/** O que registrar ao passar do estado mostrado `prev` pro `next`. */
export function diffLudo(prev: LudoState | null, next: LudoState, ctx: FeedCtx): FeedDiff {
  if (next.phase === "lobby") return { reset: true, items: [] };
  // Primeira tela. Partida que ainda nem teve rolada é NOVA (no "contra bots" a tela já nasce com ela rodando,
  // sem passar pelo lobby): anuncia. Já no meio (recarregou): não inventa histórico.
  const fresh = next.moveSeq === 0 && next.rollSeq === 0;
  if (!prev && !fresh) return { reset: true, items: [] };
  if (!prev || prev.phase === "lobby" || next.gameNumber !== prev.gameNumber) {
    const first = next.players[next.turn];
    return {
      reset: true,
      items: first ? [{ text: `▶️ Partida começou — ${first.id === ctx.me ? "você começa" : `${first.name} começa`}`, tone: "info", color: ctx.hex(first.color) }] : [],
    };
  }
  const items: FeedInput[] = [];
  if (next.rollSeq > prev.rollSeq) {
    const r = describeRoll(next, ctx);
    if (r) items.push(r);
  }
  if (next.moveSeq > prev.moveSeq) items.push(...describeMove(next, ctx));
  items.push(...describePresence(prev, next, ctx));
  if (next.phase === "game_over" && prev.phase !== "game_over") {
    const w = next.players.find((p) => p.id === next.winnerId);
    if (w) items.push({ text: `🏆 ${w.id === ctx.me ? "Você venceu" : `${w.name} venceu`}!`, tone: w.id === ctx.me ? "good" : "special", color: ctx.hex(w.color) });
  }
  return { reset: false, items };
}
