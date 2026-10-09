import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DobbleRoom from "./dobble";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import { commonSymbol } from "../src/lib/dobble/cards";
import type { DobbleState, DobbleView } from "../src/lib/dobble/engine";
import { TIMING } from "../src/lib/dobble/timing";

let history: { room_id: string; winner_name: string; players_summary: { name: string; score: number; mode: string }[] }[] = [];

beforeEach(() => {
  history = [];
  stubSupabase(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const view = (c: FakeConn) => c.last<{ type: string; state: DobbleView; now: number }>("state")?.state;
const secret = (h: ReturnType<typeof makeHarness>) => (h.server as unknown as { controller: { state: DobbleState } }).controller;

/**
 * Alice (host) + um oponente, partida iniciada e já na primeira rodada (relógio falso).
 * Com bot, a rodada pode ser ganha sozinha durante o teste; com um humano, nada acontece sem clique.
 */
async function playingRoom(opponent: "bot" | "human" = "bot") {
  vi.useFakeTimers();
  const h = makeHarness(DobbleRoom);
  const alice = await h.connect("Alice");
  await h.say(alice, { type: "join", name: "x" });
  if (opponent === "bot") {
    await h.say(alice, { type: "add_bot", level: "hard" });
  } else {
    const bob = await h.connect("Bob");
    await h.say(bob, { type: "join", name: "Bob" });
  }
  await h.say(alice, { type: "start" });
  vi.advanceTimersByTime(TIMING.COUNTDOWN_MS + 10);
  return { ...h, alice };
}

describe("autenticação (mesma da base dos jogos)", () => {
  it("recusa token que não bate (4001) e avisa quando o Supabase está fora (4002)", async () => {
    const { connect } = makeHarness(DobbleRoom);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "unauthorized"]]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4002, "auth_unavailable"]]);
  });
});

describe("sala", () => {
  it("o nome vem da identidade verificada; host adiciona bot, muda modo e inicia", async () => {
    const h = makeHarness(DobbleRoom);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Rei do Dobble" });
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(alice)!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);

    await h.say(bob, { type: "set_mode", mode: "well" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(alice, { type: "set_mode", mode: "well" });
    expect(view(bob)!.mode).toBe("well");
    await h.say(alice, { type: "start" });
    expect(view(bob)!.phase).toBe("countdown");
  });

  it("a visão pública nunca tem o monte nem as cartas viradas pra baixo", async () => {
    const h = makeHarness(DobbleRoom);
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(alice, { type: "add_bot", level: "easy" });
    await h.say(alice, { type: "start" });
    const raw = JSON.stringify(alice.last("state"));
    expect(raw).not.toContain('"draw"');
    expect(raw).not.toContain('"pile"');
    // contagem: nada virado ainda
    expect(view(alice)!.center).toBeNull();
    expect(view(alice)!.players.every((p) => p.hand === null)).toBe(true);
    // mas o servidor tem tudo
    expect(secret(h).state.draw.length).toBeGreaterThan(0);
  });

  it("estado completo (com o monte) vai pro storage; o cliente só recebe a visão", async () => {
    const h = makeHarness(DobbleRoom);
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(alice, { type: "add_bot", level: "easy" });
    await h.say(alice, { type: "start" });
    await vi.waitFor(() => expect((h.store.get("state") as DobbleState).draw.length).toBeGreaterThan(0));
  });
});

describe("partida", () => {
  it("cartas aparecem depois da contagem e a mensagem traz o relógio do servidor", async () => {
    const h = await playingRoom();
    const v = view(h.alice)!;
    expect(v.phase).toBe("playing");
    expect(v.center).not.toBeNull();
    expect(v.players.every((p) => p.hand !== null)).toBe(true);
    expect(typeof h.alice.last<{ now: number }>("state")!.now).toBe("number");
  });

  it("clicar o símbolo certo vence a rodada, segura a mesa e depois avança; clicar errado dá castigo", async () => {
    const h = await playingRoom("human");
    const v = view(h.alice)!;
    const me = v.players.find((p) => p.id === "Alice")!;
    const right = commonSymbol(me.hand!, v.center!);

    await h.say(h.alice, { type: "claim", symbol: 9999, round: v.round }); // símbolo que não existe nas cartas
    expect(view(h.alice)!.lastWrong).toMatchObject({ playerId: "Alice", symbol: 9999 });
    expect(view(h.alice)!.lockedUntil.Alice).toBeGreaterThan(0);
    await h.say(h.alice, { type: "claim", symbol: right, round: v.round }); // ainda de castigo
    expect(h.alice.sent.pop()).toEqual({ type: "error", error: "locked" });

    vi.advanceTimersByTime(2100);
    await h.say(h.alice, { type: "claim", symbol: right, round: v.round });
    expect(view(h.alice)!.phase).toBe("round_end");
    expect(view(h.alice)!.lastClaim).toMatchObject({ playerId: "Alice", symbol: right });

    vi.advanceTimersByTime(TIMING.ROUND_END_MS + 10);
    expect(view(h.alice)!.phase).toBe("playing");
    expect(view(h.alice)!.round).toBe(2);
  });

  it("o bot acha sozinho; sem ninguém conectado o servidor pausa", async () => {
    const h = await playingRoom();
    vi.advanceTimersByTime(4000);
    expect(view(h.alice)!.lastClaim?.playerId).toBe("bot:1");
    // todo mundo sai: nada mais acontece
    h.drop(h.alice);
    const round = secret(h).state.round;
    vi.advanceTimersByTime(60_000);
    expect(secret(h).state.round).toBe(round);
  });
});

describe("fim de partida", () => {
  it("grava o histórico (prefixo DOBBLE:) quando o último centro é levado", async () => {
    const h = await playingRoom();
    const ctl = secret(h);
    // última carta do centro: sem monte, qualquer acerto encerra a partida
    ctl.state = { ...ctl.state, draw: [] };
    const v = view(h.alice)!;
    const me = v.players.find((p) => p.id === "Alice")!;
    await h.say(h.alice, { type: "claim", symbol: commonSymbol(me.hand!, v.center!), round: v.round });
    vi.advanceTimersByTime(TIMING.ROUND_END_MS + 10);
    expect(view(h.alice)!.phase).toBe("game_over");
    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0]).toMatchObject({ room_id: "DOBBLE:ABCD", winner_name: "Alice" });
    expect(history[0].players_summary[0]).toMatchObject({ name: "Alice", mode: "tower" });
    expect(history[0].players_summary[0].score).toBeGreaterThan(history[0].players_summary[1].score);
  });
});
