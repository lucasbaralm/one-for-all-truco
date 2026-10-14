import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { manualClock } from "@/lib/testing/clock";
import { DECK_SIZE, cardOf, isWild } from "./cards";
import { chooseBotAction } from "./bot";
import { UnoController } from "./controller";
import { BotLevel, UnoState, addBot, callUno, catchUno, createLobby, currentPlayer, drawCard, joinLobby, passTurn, playCard, startGame, toView } from "./engine";
import { allCards, must } from "./testKit";

// Partidas INTEIRAS jogadas ao acaso (2 a 8 mesas, os três níveis de bot) conferindo as
// invariantes a cada passo. `ensure` em vez de `expect` nos laços quentes: milhões de
// expects deixam o teste lento.

function ensure(cond: boolean, msg: () => string) {
  if (!cond) throw new Error(msg());
}

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];

function lobbyOf(n: number, rng: () => number): UnoState {
  let s = must(joinLobby(createLobby(), { id: "h", name: "H" })).state;
  for (let i = 1; i < n; i++) s = must(addBot(s, LEVELS[Math.floor(rng() * 3)])).state;
  return s;
}

/** Confere tudo que nunca pode mudar: as 108 cartas, a vez, a cor, o UNO. */
function checkInvariants(s: UnoState, step: number) {
  const all = allCards(s);
  ensure(all.length === DECK_SIZE, () => `passo ${step}: ${all.length} cartas (devia ser ${DECK_SIZE})`);
  ensure(new Set(all).size === DECK_SIZE, () => `passo ${step}: carta repetida`);
  ensure(s.turn >= 0 && s.turn < s.players.length, () => `passo ${step}: vez fora da mesa`);
  const top = cardOf(s.discard[s.discard.length - 1]);
  ensure(isWild(top) || top.color === s.color, () => `passo ${step}: cor valendo (${s.color}) ≠ cor do topo (${top.color})`);
  if (s.pendingDrawn !== null) {
    ensure(currentPlayer(s)!.hand.includes(s.pendingDrawn), () => `passo ${step}: carta comprada não está na mão`);
  }
  if (s.exposed) {
    const p = s.players.find((x) => x.id === s.exposed);
    ensure(!!p && p.hand.length === 1 && !p.unoCalled, () => `passo ${step}: exposto sem 1 carta ou já gritou UNO`);
  }
  for (const p of s.players) ensure(s.phase === "game_over" || p.hand.length > 0, () => `passo ${step}: ${p.id} com a mão vazia e o jogo não acabou`);
}

/** Joga a partida até o fim com as decisões dos bots (todos, mesmo o "humano" h) e pegadas ao acaso. */
function playOut(seed: number, n: number): { final: UnoState; steps: number } {
  const rng = mulberry32(seed);
  let s = must(startGame(lobbyOf(n, rng), rng)).state;
  let steps = 0;
  while (s.phase === "playing") {
    steps++;
    ensure(steps < 30000, () => `seed ${seed}: partida não terminou em 30000 passos`);
    const me = currentPlayer(s)!;
    // às vezes alguém pega o exposto
    if (s.exposed && rng() < 0.5) {
      const catcher = s.players.find((p) => p.id !== s.exposed)!;
      s = must(catchUno(s, catcher.id, rng)).state;
      checkInvariants(s, steps);
      continue;
    }
    const a = chooseBotAction(s, me.id, me.bot ?? LEVELS[Math.floor(rng() * 3)], rng);
    const r = a.type === "play" ? playCard(s, me.id, a.card, a.color, a.uno, rng) : a.type === "draw" ? drawCard(s, me.id, rng) : passTurn(s, me.id);
    ensure(r.ok, () => `seed ${seed}: ação do bot recusada: ${JSON.stringify(a)} → ${JSON.stringify(r)}`);
    if (r.ok) s = r.state;
    checkInvariants(s, steps);
  }
  return { final: s, steps };
}

describe("partidas inteiras ao acaso", () => {
  it("60 partidas (2–8 jogadores): sempre terminam, com as 108 cartas intactas a cada passo e toda ação aceita", () => {
    const lengths: number[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const n = 2 + (seed % 7);
      const { final, steps } = playOut(seed, n);
      lengths.push(steps);
      ensure(final.phase === "game_over", () => `seed ${seed}: não acabou`);
      const winner = final.players.find((p) => p.id === final.winnerId)!;
      ensure(winner.hand.length === 0, () => `seed ${seed}: o vencedor ainda tem cartas`);
      ensure(final.players.filter((p) => p.hand.length === 0).length === 1, () => `seed ${seed}: mais de um com a mão vazia`);
      ensure(final.standings![0].playerId === winner.id && final.standings!.length === n, () => `seed ${seed}: classificação errada`);
      const sorted = final.standings!.slice(1);
      for (let i = 1; i < sorted.length; i++) ensure(sorted[i - 1].cards <= sorted[i].cards, () => `seed ${seed}: classificação fora de ordem`);
    }
    // partidas de verdade: nem relâmpago nem eterna
    expect(Math.min(...lengths)).toBeGreaterThan(8);
    expect(Math.max(...lengths)).toBeLessThan(5000);
  });

  it("mesma semente, mesma partida; sementes diferentes, partidas diferentes", () => {
    const a = playOut(7, 4).final;
    const b = playOut(7, 4).final;
    expect(b.winnerId).toBe(a.winnerId);
    expect(b.discard).toEqual(a.discard);
    expect(playOut(8, 4).final.discard).not.toEqual(a.discard);
  });

  it("a visão de CADA jogador, em TODOS os passos, nunca traz a mão de outro", () => {
    const rng = mulberry32(21);
    let s = must(startGame(lobbyOf(4, rng), rng)).state;
    for (let step = 0; step < 400 && s.phase === "playing"; step++) {
      const me = currentPlayer(s)!;
      for (const viewer of s.players) {
        const v = toView(s, viewer.id);
        ensure(JSON.stringify(v.hand) === JSON.stringify(viewer.hand), () => "a visão não tem a mão do próprio jogador");
        for (const other of s.players) {
          if (other.id === viewer.id) continue;
          ensure(v.players.find((p) => p.id === other.id)!.cards === other.hand.length, () => "contagem de cartas errada");
        }
        ensure(v.legal.every((c) => v.hand.includes(c)), () => "jogável que não está na mão");
      }
      const a = chooseBotAction(s, me.id, "hard", rng);
      const r = a.type === "play" ? playCard(s, me.id, a.card, a.color, a.uno, rng) : a.type === "draw" ? drawCard(s, me.id, rng) : passTurn(s, me.id);
      if (r.ok) s = r.state;
    }
    expect(s.eventSeq).toBeGreaterThan(50);
  });

  it("gritar UNO nunca quebra nada: a qualquer hora, com qualquer mão, é aceito ou recusado limpo", () => {
    const rng = mulberry32(5);
    let s = must(startGame(lobbyOf(3, rng), rng)).state;
    for (let step = 0; step < 300 && s.phase === "playing"; step++) {
      for (const p of s.players) {
        const r = callUno(s, p.id);
        if (r.ok) s = r.state;
        else ensure(r.error === "cannot_uno", () => `erro inesperado: ${r.error}`);
      }
      const me = currentPlayer(s)!;
      const a = chooseBotAction(s, me.id, "medium", rng);
      const r = a.type === "play" ? playCard(s, me.id, a.card, a.color, false, rng) : a.type === "draw" ? drawCard(s, me.id, rng) : passTurn(s, me.id);
      if (r.ok) s = r.state;
      checkInvariants(s, step);
    }
  });
});

describe("pelo controlador, com o relógio manual", () => {
  it("20 partidas completas de sala com bots (nenhum humano conectado) terminam e gravam a classificação", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const clock = manualClock();
      const ctl = new UnoController(createLobby(), { rng: mulberry32(seed), setTimer: clock.setTimer, clearTimer: clock.clearTimer });
      ctl.dispatch("h", { type: "join", name: "H" });
      const bots = 1 + (seed % 6);
      for (let i = 0; i < bots; i++) ctl.dispatch("h", { type: "add_bot", level: LEVELS[i % 3] });
      ctl.dispatch("h", { type: "start" });
      ctl.setConnected("h", false);
      ensure(clock.runAll(400_000), () => `seed ${seed}: o relógio estourou o limite de passos`);
      ensure(ctl.state.phase === "game_over" && !!ctl.state.winnerId, () => `seed ${seed}: não terminou`);
      checkInvariants(ctl.state, seed);
    }
  });
});
