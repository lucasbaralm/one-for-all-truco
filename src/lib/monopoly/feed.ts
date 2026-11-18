// O que vira linha no histórico do Monopoly / Banco Imobiliário, a partir de cada visão nova do
// servidor: dados e movimento, compras, aluguéis, cartas, prisão, leilão, construções, hipotecas,
// trocas, dívidas, falências e o fim.

import type { FeedInput } from "@/lib/feed";
import { playerColor } from "@/lib/playerColors";
import { getEdition } from "./editions";
import type { MonoEvent, MonoView } from "./engine";
import { cardText, money, squareLabel } from "./labels";

export interface FeedCtx {
  /** Id de quem está olhando (vira "Você"). */
  me: string | null;
}

type Scene = Pick<MonoView, "players" | "edition" | "settings">;

const nameOf = (v: Scene, id: string, ctx: FeedCtx) => (id === ctx.me ? "Você" : (v.players.find((p) => p.id === id)?.name ?? "Alguém"));
/** Como objeto da frase ("pagou a você" / "pagou a Zeca"). */
const objectOf = (v: Scene, id: string, ctx: FeedCtx) => (id === ctx.me ? "você" : (v.players.find((p) => p.id === id)?.name ?? "alguém"));
/** Quem recebe os bens de um falido: um jogador ou o banco ("para o banco", "para você"). */
const partyOf = (v: Scene, id: string, ctx: FeedCtx) => (id === "bank" ? "o banco" : objectOf(v, id, ctx));
/** Quem recebe uma dívida, já com a preposição ("ao banco", "a cada jogador", "a Zeca"). */
const owedTo = (v: Scene, id: string, ctx: FeedCtx) => (id === "bank" ? "ao banco" : id === "each" ? "a cada jogador" : `a ${objectOf(v, id, ctx)}`);
const houses = (n: number) => (n === 1 ? "1 casa" : `${n} casas`);

/** As linhas de um conjunto de eventos (a visão só serve pra achar nomes, moeda e tabuleiro). */
export function describeMonoEvents(view: Scene, events: MonoEvent[], ctx: FeedCtx): FeedInput[] {
  const out: FeedInput[] = [];
  const ed = getEdition(view.edition);
  const $ = (amount: number) => money(view.edition, amount);
  const who = (id: string) => nameOf(view, id, ctx);
  const color = (id: string) => playerColor(view.players, id);
  const sq = (i: number) => squareLabel(view.edition, i);
  const mine = (...ids: string[]) => ids.includes(ctx.me ?? "");

  events.forEach((e, i) => {
    switch (e.t) {
      case "roll": {
        const double = e.d[0] === e.d[1];
        out.push({ text: `🎲 ${who(e.p)} rolou ${e.d[0]} e ${e.d[1]}${double ? " — dupla!" : ""}`, tone: double ? "special" : "info", color: color(e.p) });
        break;
      }
      case "move": {
        // Quem vai preso já tem a própria linha logo depois.
        const next = events[i + 1];
        if (next?.t === "jail" && next.p === e.p) break;
        const steps = (e.to - e.from + 40) % 40;
        out.push({ text: `🚶 ${who(e.p)} ${steps >= 1 && steps <= 12 ? "andou até" : "foi para"} ${sq(e.to)}`, tone: "info", color: color(e.p) });
        break;
      }
      case "go":
        out.push({ text: `💰 ${who(e.p)} recebeu ${$(e.amount)} de salário ao passar por ${ed.words.go}`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) });
        break;
      case "buy":
        out.push({ text: `🏠 ${who(e.p)} comprou ${sq(e.sq)} por ${$(e.price)}`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) });
        break;
      case "rent": {
        const dice = e.dice !== undefined ? ` (dados: ${e.dice})` : "";
        out.push({
          text: `💸 ${who(e.p)} pagou ${$(e.amount)} de aluguel a ${objectOf(view, e.to, ctx)} em ${sq(e.sq)}${dice}`,
          tone: e.p === ctx.me ? "bad" : e.to === ctx.me ? "good" : "info",
          color: color(e.p),
        });
        break;
      }
      case "tax":
        out.push({ text: `🧾 ${who(e.p)} pagou ${$(e.amount)} de ${sq(e.sq)}`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      case "bonus":
        out.push({ text: `🎁 ${who(e.p)} recebeu ${$(e.amount)} em ${sq(e.sq)}`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) });
        break;
      case "card":
        out.push({ text: `🎴 ${who(e.p)} tirou uma carta de ${ed.deckNames[e.deck]}: “${cardText(view.edition, e.deck, e.card)}”`, tone: "special", color: color(e.p) });
        break;
      case "cash":
        out.push(
          e.amount >= 0
            ? { text: `💰 ${who(e.p)} recebeu ${$(e.amount)}`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) }
            : { text: `💸 ${who(e.p)} pagou ${$(-e.amount)}`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) }
        );
        break;
      case "each":
        out.push(
          e.per >= 0
            ? { text: `🎉 ${who(e.p)} recebeu ${$(e.per)} de cada jogador (${$(e.total)} no total)`, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) }
            : { text: `💸 ${who(e.p)} pagou ${$(-e.per)} a cada jogador (${$(e.total)} no total)`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) }
        );
        break;
      case "repairs":
        out.push({ text: `🔧 ${who(e.p)} pagou ${$(e.amount)} em reparos nas construções`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      case "jail": {
        const why = e.why === "card" ? " (carta)" : e.why === "doubles" ? " (3 duplas seguidas)" : "";
        out.push({ text: `🚔 ${who(e.p)} foi para a ${ed.words.jail}${why}`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      }
      case "bail": {
        const text =
          e.how === "paid"
            ? `🔓 ${who(e.p)} pagou ${$(ed.bail)} de fiança e saiu da ${ed.words.jail}`
            : e.how === "card"
              ? `🔓 ${who(e.p)} usou a carta “${ed.jailCardName}” e saiu da ${ed.words.jail}`
              : e.how === "doubles"
                ? `🔓 ${who(e.p)} tirou dupla e saiu da ${ed.words.jail}`
                : `🔓 ${who(e.p)} não tirou dupla 3 vezes: pagou ${$(ed.bail)} de fiança e saiu`;
        out.push({ text, tone: e.p === ctx.me ? "good" : "info", color: color(e.p) });
        break;
      }
      case "jail_fail":
        out.push({ text: `🔒 ${who(e.p)} não tirou dupla (${e.tries}ª tentativa de 3)`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      case "auction":
        out.push({ text: `🔨 Leilão: ${sq(e.sq)}`, tone: "special" });
        break;
      case "bid":
        out.push({ text: `💵 ${who(e.p)} deu um lance de ${$(e.amount)}`, tone: "info", color: color(e.p) });
        break;
      case "auction_pass":
        out.push({ text: `🙅 ${who(e.p)} saiu do leilão`, tone: "info", color: color(e.p) });
        break;
      case "sold":
        out.push(
          e.to
            ? { text: `🔨 ${who(e.to)} arrematou ${sq(e.sq)} por ${$(e.amount)}`, tone: e.to === ctx.me ? "good" : "special", color: color(e.to) }
            : { text: `🔨 Ninguém deu lance por ${sq(e.sq)}`, tone: "info" }
        );
        break;
      case "build":
        out.push({
          text: e.level >= 5 ? `🏨 ${who(e.p)} construiu um hotel em ${sq(e.sq)}` : `🏗️ ${who(e.p)} construiu uma casa em ${sq(e.sq)} (${houses(e.level)})`,
          tone: e.p === ctx.me ? "good" : "info",
          color: color(e.p),
        });
        break;
      case "sell":
        out.push({
          text: `🏚️ ${who(e.p)} vendeu ${e.level === 4 ? "o hotel" : "uma casa"} de ${sq(e.sq)} e recebeu ${$(e.amount)}`,
          tone: "info",
          color: color(e.p),
        });
        break;
      case "mortgage":
        out.push({ text: `🏦 ${who(e.p)} hipotecou ${sq(e.sq)} e recebeu ${$(e.amount)}`, tone: "info", color: color(e.p) });
        break;
      case "unmortgage":
        out.push({ text: `🏦 ${who(e.p)} pagou ${$(e.cost)} pra tirar a hipoteca de ${sq(e.sq)}`, tone: "info", color: color(e.p) });
        break;
      case "trade_offer":
        out.push({ text: `🤝 ${who(e.from)} propôs uma troca a ${objectOf(view, e.to, ctx)}`, tone: e.to === ctx.me ? "special" : "info", color: color(e.from) });
        break;
      case "trade_done":
        out.push({ text: `🤝 ${who(e.from)} e ${objectOf(view, e.to, ctx)} fecharam uma troca`, tone: mine(e.from, e.to) ? "good" : "info", color: color(e.from) });
        break;
      case "trade_no":
        out.push(
          e.cancelled
            ? { text: e.from === ctx.me ? "❌ A sua proposta de troca foi cancelada" : `❌ A proposta de troca de ${who(e.from)} foi cancelada`, tone: "info", color: color(e.from) }
            : { text: `❌ ${who(e.to)} recusou ${e.from === ctx.me ? "a sua troca" : `a troca de ${who(e.from)}`}`, tone: e.from === ctx.me ? "bad" : "info", color: color(e.to) }
        );
        break;
      case "debt":
        out.push({ text: `⚠️ ${who(e.p)} precisa pagar ${$(e.amount)} ${owedTo(view, e.to, ctx)} e está sem dinheiro`, tone: e.p === ctx.me ? "bad" : "info", color: color(e.p) });
        break;
      case "bankrupt":
        out.push({
          text: `💀 ${who(e.p)} faliu — os bens vão para ${partyOf(view, e.to, ctx)}`,
          tone: e.p === ctx.me ? "bad" : e.to === ctx.me ? "good" : "special",
          color: color(e.p),
        });
        break;
      case "turn":
        out.push({ text: e.p === ctx.me ? "👉 É a sua vez" : `👉 Vez de ${who(e.p)}`, tone: e.p === ctx.me ? "special" : "info", color: color(e.p) });
        break;
      case "end":
        out.push({
          text:
            e.mode === "limit"
              ? `🏁 Acabaram as ${view.settings.limit} rodadas — fim de jogo`
              : e.mode === "humans"
                ? "🏁 Só sobraram bots — fim de jogo, vence o maior patrimônio"
                : "🏁 Só sobrou um jogador — fim de jogo",
          tone: "special",
        });
        break;
    }
  });
  return out;
}

export interface FeedDiff {
  /** Partida nova (ou lobby): a lista começa do zero. */
  reset: boolean;
  items: FeedInput[];
}

/** O que registrar ao passar da visão `prev` pra `next`. */
export function diffMono(prev: MonoView | null, next: MonoView, ctx: FeedCtx): FeedDiff {
  if (next.phase === "lobby") return { reset: true, items: [] };
  const announce = (): FeedInput[] => {
    const first = next.players[next.turn];
    const text = first ? `▶️ Partida começou — ${first.id === ctx.me ? "você começa" : `${first.name} começa`}` : "▶️ Partida começou";
    // O aviso de quem começa já cobre o primeiro "turn" do estado inicial.
    const rest = next.events.filter((e) => e.t !== "turn");
    return [{ text, tone: "info" as const, color: first ? playerColor(next.players, first.id) : undefined }, ...describeMonoEvents(next, rest, ctx)];
  };
  // Primeira tela: partida em que ninguém rolou ainda ('contra bots', sem lobby) é nova → anuncia;
  // já no meio (recarregou) não inventa histórico.
  if (!prev) return next.dice === null ? { reset: true, items: announce() } : { reset: true, items: [] };
  if (prev.phase === "lobby" || next.gameNumber !== prev.gameNumber) return { reset: true, items: announce() };

  const items: FeedInput[] = [];
  if (next.eventSeq > prev.eventSeq) items.push(...describeMonoEvents(next, next.events, ctx));

  for (const p of next.players) {
    if (p.bot || p.id === ctx.me || p.bankrupt) continue;
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
