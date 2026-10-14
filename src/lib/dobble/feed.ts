// O que vira linha no histórico do Dobble, a partir das mudanças entre duas
// visões do servidor: quem achou o símbolo (e em quanto tempo), quem errou,
// quem caiu, início e fim da partida.

import type { FeedInput } from "@/lib/feed";
import { SYMBOLS } from "./cards";
import { LOCK_MS } from "./engine";
import type { DobbleView } from "./engine";
import { playerColor } from "./colors";
import { MODE_LABEL } from "./labels";
import { fmtSeconds } from "./summary";

export interface FeedCtx {
  /** Id de quem está olhando (vira "Você"). */
  me: string | null;
}

const who = (v: DobbleView, id: string, ctx: FeedCtx) => (id === ctx.me ? "Você" : (v.players.find((p) => p.id === id)?.name ?? "Alguém"));

/** O que registrar ao passar da visão `prev` pra `next`. */
export function diffDobble(prev: DobbleView | null, next: DobbleView, ctx: FeedCtx): { reset: boolean; items: FeedInput[] } {
  if (next.phase === "lobby") return { reset: true, items: [] };
  // Primeira tela. Partida na contagem é NOVA (no "contra bots" a tela já nasce com ela rodando, sem lobby): anuncia.
  // Já no meio (recarregou): não inventa histórico.
  if (!prev && next.phase !== "countdown") return { reset: true, items: [] };
  if (!prev || prev.phase === "lobby" || next.gameNumber !== prev.gameNumber) {
    return { reset: true, items: [{ text: `▶️ Partida começou — modo ${MODE_LABEL[next.mode]}`, tone: "info" }] };
  }

  const items: FeedInput[] = [];

  const claim = next.lastClaim;
  if (claim && claim.seq > (prev.lastClaim?.seq ?? 0)) {
    const time = claim.reactionMs != null ? ` em ${fmtSeconds(claim.reactionMs)}` : "";
    items.push({
      text: `✅ ${who(next, claim.playerId, ctx)} achou ${SYMBOLS[claim.symbol]}${time}`,
      tone: claim.playerId === ctx.me ? "good" : "info",
      color: playerColor(next.players, claim.playerId),
    });
  }

  const wrong = next.lastWrong;
  if (wrong && wrong.seq > (prev.lastWrong?.seq ?? 0)) {
    items.push({
      text: `❌ ${who(next, wrong.playerId, ctx)} errou ${SYMBOLS[wrong.symbol]} — ${LOCK_MS / 1000} s de castigo`,
      tone: wrong.playerId === ctx.me ? "bad" : "info",
      color: playerColor(next.players, wrong.playerId),
    });
  }

  for (const p of next.players) {
    if (p.bot || p.id === ctx.me) continue;
    const before = prev.players.find((x) => x.id === p.id);
    if (!before) continue;
    const color = playerColor(next.players, p.id);
    if (before.connected && !p.connected) items.push({ text: `📡 ${p.name} desconectou`, tone: "bad", color });
    else if (!before.connected && p.connected) items.push({ text: `📡 ${p.name} voltou pra partida`, tone: "good", color });
  }

  if (next.phase === "game_over" && prev.phase !== "game_over") {
    const w = next.players.find((p) => p.id === next.winnerId);
    if (w) items.push({ text: `🏆 ${w.id === ctx.me ? "Você venceu" : `${w.name} venceu`}!`, tone: w.id === ctx.me ? "good" : "special", color: playerColor(next.players, w.id) });
  }
  return { reset: false, items };
}
