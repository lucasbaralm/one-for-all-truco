// O que vira linha no histórico da Forca, a partir de cada visão nova do servidor:
// a palavra nova (categoria e tamanho), cada letra chutada (acertou/errou, quem),
// chute de palavra, tempo esgotado, quem completou e quanto ganhou, e o fim.

import type { FeedInput } from "@/lib/feed";
import { playerColor } from "@/lib/playerColors";
import type { ForcaEvent, ForcaView } from "./engine";

export interface FeedCtx {
  /** Id de quem está olhando (vira "Você"). */
  me: string | null;
}

type Players = Pick<ForcaView, "players">;

const nameOf = (v: Players, id: string, ctx: FeedCtx) => (id === ctx.me ? "Você" : (v.players.find((p) => p.id === id)?.name ?? "Alguém"));
const times = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);

export function describeForcaEvents(view: Players, word: string | null, events: ForcaEvent[], ctx: FeedCtx): FeedInput[] {
  const out: FeedInput[] = [];
  const color = (id: string) => playerColor(view.players, id);
  for (const e of events) {
    switch (e.t) {
      case "round":
        out.push({ text: `🔤 Palavra ${e.n}: ${e.category}, ${e.length} letras`, tone: "special" });
        break;
      case "letter": {
        const who = nameOf(view, e.p, ctx);
        const timeout = e.auto ? " (tempo esgotado)" : "";
        out.push(
          e.hits > 0
            ? { text: `✅ ${who} chutou ${e.letter}${timeout} — aparece ${times(e.hits)}`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) }
            : { text: `❌ ${who} chutou ${e.letter}${timeout} — não tem`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) }
        );
        break;
      }
      case "word":
        out.push(
          e.ok
            ? { text: `🎯 ${nameOf(view, e.p, ctx)} acertou a palavra!`, tone: e.p === ctx.me ? "good" : "special", color: color(e.p) }
            : { text: `💥 ${nameOf(view, e.p, ctx)} errou a palavra (−2 vidas)`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) }
        );
        break;
      case "won":
        out.push({ text: `🏅 ${nameOf(view, e.p, ctx)} completou a palavra: +${e.points} pontos`, tone: e.p === ctx.me ? "good" : "special", color: color(e.p) });
        break;
      case "lost":
        out.push({ text: `☠️ A forca fechou${word ? ` — era ${word}` : ""}`, tone: "bad" });
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
export function diffForca(prev: ForcaView | null, next: ForcaView, ctx: FeedCtx): FeedDiff {
  if (next.phase === "lobby") return { reset: true, items: [] };
  const announce = (): FeedInput[] => [{ text: `▶️ Partida começou — ${next.rounds} palavras`, tone: "info" }, ...describeForcaEvents(next, next.word, next.events, ctx)];
  // Primeira tela: partida na primeira palavra e sem chute ainda é NOVA ('contra bots', sem lobby) → anuncia;
  // já no meio (recarregou) não inventa histórico.
  if (!prev) return next.roundNo === 1 && next.guesses.length === 0 ? { reset: true, items: announce() } : { reset: true, items: [] };
  if (prev.phase === "lobby" || next.gameNumber !== prev.gameNumber) return { reset: true, items: announce() };

  const items: FeedInput[] = [];
  if (next.eventSeq > prev.eventSeq) items.push(...describeForcaEvents(next, next.word, next.events, ctx));

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
