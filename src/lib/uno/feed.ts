// O que vira linha no histórico do Uno, a partir de cada visão nova do servidor:
// as jogadas (com a cor escolhida no Coringa), compras, quem foi pulado, o
// sentido que inverteu, UNO gritado, quem foi pego e o início/fim da partida.

import type { FeedInput } from "@/lib/feed";
import { playerColor } from "@/lib/playerColors";
import { cardOf, isWild } from "./cards";
import type { UnoEvent, UnoView } from "./engine";
import { cardName } from "./labels";

export interface FeedCtx {
  /** Id de quem está olhando (vira "Você"). */
  me: string | null;
}

type Players = Pick<UnoView, "players">;

const nameOf = (v: Players, id: string, ctx: FeedCtx) => (id === ctx.me ? "Você" : (v.players.find((p) => p.id === id)?.name ?? "Alguém"));
/** Como objeto da frase ("pegou você" / "pegou Zeca"). */
const objectOf = (v: Players, id: string, ctx: FeedCtx) => (id === ctx.me ? "você" : (v.players.find((p) => p.id === id)?.name ?? "alguém"));
const cards = (n: number) => (n === 1 ? "uma carta" : `${n} cartas`);

/** As linhas de um conjunto de eventos (a visão só serve pra achar os nomes). */
export function describeUnoEvents(view: Players, events: UnoEvent[], ctx: FeedCtx): FeedInput[] {
  const out: FeedInput[] = [];
  const color = (id: string) => playerColor(view.players, id);
  for (const e of events) {
    switch (e.t) {
      case "play": {
        const card = cardOf(e.card);
        out.push({ text: `🃏 ${nameOf(view, e.p, ctx)} jogou ${cardName(card, isWild(card) ? e.color : null)}`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) });
        break;
      }
      case "draw":
        out.push({
          text: `📥 ${nameOf(view, e.p, ctx)} comprou ${cards(e.n)}${e.penalty ? " (castigo)" : ""}`,
          tone: e.penalty && e.p === ctx.me ? "bad" : "info",
          color: color(e.p),
        });
        break;
      case "skip":
        out.push({ text: `⛔ ${nameOf(view, e.p, ctx)} foi pulado`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      case "reverse":
        out.push({ text: "🔄 Sentido invertido", tone: "special" });
        break;
      case "pass":
        out.push({ text: `⏭️ ${nameOf(view, e.p, ctx)} passou a vez`, tone: "info", color: color(e.p) });
        break;
      case "uno":
        out.push({ text: `📢 ${nameOf(view, e.p, ctx)} gritou UNO!`, tone: "special", color: color(e.p) });
        break;
      case "catch":
        out.push({
          text: `🚨 ${nameOf(view, e.by, ctx)} pegou ${objectOf(view, e.target, ctx)} sem UNO`,
          tone: e.target === ctx.me ? "bad" : e.by === ctx.me ? "good" : "special",
          color: color(e.by),
        });
        break;
      case "reshuffle":
        out.push({ text: "♻️ O baralho acabou e foi reembaralhado", tone: "info" });
        break;
    }
  }
  return out;
}

export interface FeedDiff {
  /** Partida nova (ou lobby): a lista começa do zero. */
  reset: boolean;
  items: FeedInput[];
}

/** O que registrar ao passar da visão `prev` pra `next`. */
export function diffUno(prev: UnoView | null, next: UnoView, ctx: FeedCtx): FeedDiff {
  if (next.phase === "lobby") return { reset: true, items: [] };
  const announce = (): FeedInput[] => {
    const first = next.players[next.turn];
    const text = first ? `▶️ Partida começou — ${first.id === ctx.me ? "você começa" : `${first.name} começa`}` : "▶️ Partida começou";
    return [{ text, tone: "info" as const, color: first ? playerColor(next.players, first.id) : undefined }, ...describeUnoEvents(next, next.events, ctx)];
  };
  // Primeira tela: partida que ainda nem teve jogada ('contra bots', sem lobby) é nova → anuncia;
  // já no meio (recarregou) não inventa histórico.
  if (!prev) return next.discardCount <= 1 ? { reset: true, items: announce() } : { reset: true, items: [] };
  if (prev.phase === "lobby" || next.gameNumber !== prev.gameNumber) return { reset: true, items: announce() };

  const items: FeedInput[] = [];
  if (next.eventSeq > prev.eventSeq) items.push(...describeUnoEvents(next, next.events, ctx));

  for (const p of next.players) {
    if (p.bot || p.id === ctx.me) continue;
    const before = prev.players.find((x) => x.id === p.id);
    if (!before) continue;
    const c = playerColor(next.players, p.id);
    if (before.connected && !p.connected) items.push({ text: `📡 ${p.name} desconectou — um bot assume`, tone: "bad", color: c });
    else if (!before.connected && p.connected) items.push({ text: `📡 ${p.name} voltou pra partida`, tone: "good", color: c });
  }

  if (next.phase === "game_over" && prev.phase !== "game_over") {
    const w = next.players.find((p) => p.id === next.winnerId);
    if (w) items.push({ text: `🏆 ${w.id === ctx.me ? "Você venceu" : `${w.name} venceu`}!`, tone: w.id === ctx.me ? "good" : "special", color: playerColor(next.players, w.id) });
  }
  return { reset: false, items };
}
