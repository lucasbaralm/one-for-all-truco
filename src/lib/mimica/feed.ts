// O que vira linha no histórico da Mímica, a partir de cada visão nova do servidor:
// quem faz a mímica, de onde é a música (e o tamanho do título), a dica, cada chute errado,
// quem acertou e quanto ganhou, o tempo esgotado e a vez pulada.

import type { FeedInput } from "@/lib/feed";
import { playerColor } from "@/lib/playerColors";
import type { MimicaEvent, MimicaView } from "./engine";
import { KIND_ICON, KIND_LABEL } from "./labels";

export interface FeedCtx {
  /** Id de quem está olhando (vira "Você"). */
  me: string | null;
}

type Scene = Pick<MimicaView, "players">;

const nameOf = (v: Scene, id: string, ctx: FeedCtx) => (id === ctx.me ? "Você" : (v.players.find((p) => p.id === id)?.name ?? "Alguém"));
const clip = (text: string, max = 28) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describeMimicaEvents(view: Scene, events: MimicaEvent[], ctx: FeedCtx): FeedInput[] {
  const out: FeedInput[] = [];
  const color = (id: string) => playerColor(view.players, id);
  for (const e of events) {
    switch (e.t) {
      case "turn":
        out.push({
          text: e.mimer === ctx.me ? `🎭 Mímica ${e.n}: sua vez de fazer` : `🎭 Mímica ${e.n}: ${nameOf(view, e.mimer, ctx)} vai fazer`,
          tone: "special",
          color: color(e.mimer),
        });
        break;
      case "picked": {
        const auto = e.auto ? " (o tempo acabou, o jogo escolheu)" : "";
        out.push({
          text: `${KIND_ICON[e.kind]} ${nameOf(view, e.p, ctx)} escolheu uma música ${KIND_LABEL[e.kind].toLowerCase()}: ${plural(e.words, "palavra", "palavras")}, ${plural(e.letters, "letra", "letras")}${auto}`,
          tone: "special",
          color: color(e.p),
        });
        break;
      }
      case "hint":
        out.push({ text: "💡 Dica: a primeira letra de cada palavra apareceu", tone: "info" });
        break;
      case "wrong":
        out.push({ text: `❌ ${nameOf(view, e.p, ctx)} chutou “${clip(e.text)}”`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      case "solved": {
        const who = nameOf(view, e.p, ctx);
        out.push({
          text: `🎉 ${who} acertou${e.title ? ` “${e.title}”` : ""}: +${e.points} pontos`,
          tone: e.p === ctx.me ? "good" : "special",
          color: color(e.p),
        });
        if (e.mimer !== e.p) {
          out.push({
            text: `🎭 ${nameOf(view, e.mimer, ctx)} ganhou +${e.mimerPoints} pela mímica`,
            tone: e.mimer === ctx.me ? "good" : "info",
            color: color(e.mimer),
          });
        }
        break;
      }
      case "timeout":
        out.push({ text: `⏰ ${e.gaveUp ? "Desistiram" : "Acabou o tempo"}${e.title ? ` — era “${e.title}”${e.artist ? ` (${e.artist})` : ""}` : ""}`, tone: "bad" });
        break;
      case "skipped":
        out.push({
          text: `📡 ${nameOf(view, e.p, ctx)} está fora — a mímica foi pulada${e.title ? ` (era “${e.title}”)` : ""}`,
          tone: "info",
          color: color(e.p),
        });
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
export function diffMimica(prev: MimicaView | null, next: MimicaView, ctx: FeedCtx): FeedDiff {
  if (next.phase === "lobby") return { reset: true, items: [] };
  const announce = (): FeedInput[] => [
    { text: `▶️ Partida começou — ${plural(next.totalTurns, "mímica", "mímicas")}`, tone: "info" },
    ...describeMimicaEvents(next, next.events, ctx),
  ];
  // Primeira tela: partida na primeira mímica e sem nada ainda é NOVA → anuncia; já no meio (recarregou) não inventa histórico.
  if (!prev) return next.turnNo === 1 && next.phase === "picking" ? { reset: true, items: announce() } : { reset: true, items: [] };
  if (prev.phase === "lobby" || next.gameNumber !== prev.gameNumber) return { reset: true, items: announce() };

  const items: FeedInput[] = [];
  if (next.eventSeq > prev.eventSeq) items.push(...describeMimicaEvents(next, next.events, ctx));

  for (const p of next.players) {
    if (p.id === ctx.me) continue;
    const before = prev.players.find((x) => x.id === p.id);
    if (!before) continue;
    const c = playerColor(next.players, p.id);
    if (before.connected && !p.connected) items.push({ text: `📡 ${p.name} desconectou`, tone: "bad", color: c });
    else if (!before.connected && p.connected) items.push({ text: `📡 ${p.name} voltou pra partida`, tone: "good", color: c });
  }

  if (next.phase === "game_over" && prev.phase !== "game_over") {
    const w = next.players.find((p) => p.id === next.winnerId);
    if (w) items.push({ text: `🏆 ${w.id === ctx.me ? "Você venceu" : `${w.name} venceu`}!`, tone: w.id === ctx.me ? "good" : "special", color: playerColor(next.players, w.id) });
  }
  return { reset: false, items };
}
