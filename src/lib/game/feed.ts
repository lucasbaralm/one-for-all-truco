// O que vira linha no histórico da Fodinha — e som — a partir das mudanças entre
// dois estados da mesa: rodada nova, vira e manilha, apostas, cartas jogadas,
// quem levou a vaza, quem acertou/errou a aposta e quanto levou de pontos.

import type { FeedInput } from "@/lib/feed";
import { Card, getManilhaValue } from "./rules";
import type { GameState } from "./state-machine";

export interface FeedCtx {
  /** Nome de quem está olhando (vira "Você"). */
  me: string;
}

/** Sons que acompanham as mudanças (a tela decide como tocar). */
export type FodinhaCue = "deal" | "bet" | "play" | "trick" | "trickMine" | "hit" | "miss" | "over";

export interface FodinhaDiff {
  /** Partida nova (ou ainda nem começou): a lista começa do zero. */
  reset: boolean;
  items: FeedInput[];
  cues: FodinhaCue[];
  /** Preenchido na hora em que a rodada acaba: quem acertou a aposta. */
  roundResults: { name: string; hit: boolean }[] | null;
}

const SUIT_SYMBOL = { hearts: "♥", spades: "♠", diamonds: "♦", clubs: "♣" } as const;
export const fmtCard = (c: Card) => `${c.value}${SUIT_SYMBOL[c.suit]}`;

const cardKey = (c: Card) => `${c.suit}-${c.value}`;
const pts = (n: number) => `${n} ${n === 1 ? "ponto" : "pontos"}`;

export function diffFodinha(prev: GameState | null, next: GameState, ctx: FeedCtx): FodinhaDiff {
  const none: FodinhaDiff = { reset: false, items: [], cues: [], roundResults: null };
  // Mesa ainda vazia: nada a registrar.
  if (next.phase === "waiting") return { ...none, reset: true };
  // Primeira tela (abriu ou recarregou): só diz em que rodada estamos, se ainda estão embaralhando; o resto não se inventa.
  if (!prev) {
    const n = next.currentRoundCards;
    const dealer = next.players[next.dealerIndex]?.name;
    return next.phase === "shuffling" && dealer
      ? { ...none, reset: true, items: [{ text: `🃏 Rodada de ${n} ${n === 1 ? "carta" : "cartas"} — ${dealer === ctx.me ? "você dá" : `${dealer} dá`} as cartas`, tone: "special" }] }
      : { ...none, reset: true };
  }

  const who = (name: string) => (name === ctx.me ? "Você" : name);
  const items: FeedInput[] = [];
  const cues: FodinhaCue[] = [];
  let roundResults: FodinhaDiff["roundResults"] = null;

  // Partida nova: voltou a 1 carta, ou saiu do fim de jogo.
  const newGame = (prev.phase === "game_over" && next.phase !== "game_over") || next.currentRoundCards < prev.currentRoundCards;
  const sameRound = !newGame && next.currentRoundCards === prev.currentRoundCards;

  // ── rodada nova: quem dá as cartas
  if (next.phase === "shuffling" && (newGame || prev.phase !== "shuffling" || !sameRound)) {
    const n = next.currentRoundCards;
    const dealer = next.players[next.dealerIndex]?.name ?? "Alguém";
    items.push({
      text: `🃏 Rodada de ${n} ${n === 1 ? "carta" : "cartas"} — ${dealer === ctx.me ? "você dá" : `${dealer} dá`} as cartas`,
      tone: "special",
    });
  }

  // ── cartas dadas: vira e manilha
  if (prev.phase === "shuffling" && next.phase === "betting" && next.vira) {
    items.push({ text: `🂠 Vira ${fmtCard(next.vira)} — a manilha é o ${getManilhaValue(next.vira)}`, tone: "special" });
    cues.push("deal");
  }

  // ── apostas
  if (sameRound && prev.phase === "betting") {
    for (const p of next.players) {
      const before = prev.players.find((x) => x.id === p.id);
      if (before && before.bet === null && p.bet !== null) {
        items.push({ text: `💭 ${who(p.name)} apostou ${p.bet}`, tone: "info" });
        if (!cues.includes("bet")) cues.push("bet");
      }
    }
  }

  // ── cartas jogadas e vaza ganha
  if (sameRound && prev.phase === "playing") {
    for (const p of next.players) {
      const before = prev.players.find((x) => x.id === p.id);
      if (!before) continue;
      const still = new Set(p.cards.map(cardKey));
      for (const c of before.cards.filter((c) => !still.has(cardKey(c)))) {
        items.push({ text: `🎴 ${who(p.name)} jogou ${fmtCard(c)}`, tone: "info" });
        if (!cues.includes("play")) cues.push("play");
      }
    }
    for (const p of next.players) {
      const before = prev.players.find((x) => x.id === p.id);
      if (before && p.tricks > before.tricks) {
        items.push({ text: `🏆 ${who(p.name)} levou a vaza`, tone: p.name === ctx.me ? "good" : "info" });
        cues.push(p.name === ctx.me ? "trickMine" : "trick");
      }
    }
  }

  // ── fim da rodada: acertou ou errou a aposta
  if (next.phase === "round_end" && prev.phase !== "round_end") {
    roundResults = next.players.map((p) => ({ name: p.name, hit: p.bet === p.tricks }));
    const hits = roundResults.filter((r) => r.hit).map((r) => who(r.name));
    if (hits.length > 0) {
      items.push({ text: `✅ ${hits.length > 1 ? "Acertaram" : "Acertou"}: ${hits.join(", ")}`, tone: hits.includes("Você") ? "good" : "info" });
    }
    for (const p of next.players) {
      if (p.bet === p.tricks) continue;
      const before = prev.players.find((x) => x.id === p.id);
      const damage = p.score - (before?.score ?? p.score);
      items.push({
        text: `❌ ${who(p.name)} errou: apostou ${p.bet}, fez ${p.tricks}${damage > 0 ? ` (+${pts(damage)} 💀)` : ""}`,
        tone: p.name === ctx.me ? "bad" : "info",
      });
    }
    const mine = roundResults.find((r) => r.name === ctx.me);
    if (mine) cues.push(mine.hit ? "hit" : "miss");
  }

  // ── votos pra encerrar
  const votedBefore = new Set(prev.endVote?.votes ?? []);
  for (const id of next.endVote?.votes ?? []) {
    if (votedBefore.has(id)) continue;
    const name = next.players.find((p) => p.id === id)?.name;
    if (name) items.push({ text: `🚩 ${who(name)} votou pra encerrar a partida`, tone: "special" });
  }

  // ── fim de jogo: menos pontos vence
  if (next.phase === "game_over" && prev.phase !== "game_over") {
    const winner = [...next.players].sort((a, b) => a.score - b.score)[0];
    if (winner) items.push({ text: `🏁 Fim de jogo — ${winner.name === ctx.me ? "você venceu" : `${winner.name} venceu`}!`, tone: winner.name === ctx.me ? "good" : "special" });
    cues.push("over");
  }

  return { reset: newGame, items, cues, roundResults };
}
