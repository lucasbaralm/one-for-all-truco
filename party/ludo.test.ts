import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LudoRoom from "./ludo";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import type { LudoState } from "../src/lib/ludo/engine";
import { KICKED_CLOSE_CODE } from "../src/lib/ludo/protocol";

// Sala e Supabase "de mentira" vêm de party/test-utils.ts (compartilhado com o Dobble).
type Conn = FakeConn;
const lastState = (c: Conn) => c.last<{ type: string; state: LudoState }>("state")?.state;

function makeServer(initialStorage?: Record<string, unknown>) {
  return makeHarness(LudoRoom, { storage: initialStorage });
}

let historyPosts: unknown[] = [];

beforeEach(() => {
  historyPosts = [];
  stubSupabase(historyPosts);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("autenticação", () => {
  it("fecha a conexão quando o playerId não é o dono do token", async () => {
    const { connect } = makeServer();
    const bad = await connect("Mallory", "user:Alice");
    expect(bad.closed).toEqual([[4001, "unauthorized"]]);
    const noToken = await connect("Eve", "");
    expect(noToken.closed[0][0]).toBe(4001);
  });

  it("Supabase inalcançável (erro de rede ou 5xx) fecha com 4002 — diferente de login recusado (4001)", async () => {
    const { connect } = makeServer();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const down = await connect("Alice");
    expect(down.closed).toEqual([[4002, "auth_unavailable"]]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const flaky = await connect("Bob");
    expect(flaky.closed).toEqual([[4002, "auth_unavailable"]]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const rejected = await connect("Carol");
    expect(rejected.closed).toEqual([[4001, "unauthorized"]]);
  });

  it("Supabase que não responde não prende a conexão: desiste em 3s e avisa com 4002", async () => {
    vi.useFakeTimers();
    const { connect } = makeServer();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      )
    );
    const pending = connect("Alice");
    await vi.advanceTimersByTimeAsync(2900);
    await vi.advanceTimersByTimeAsync(200);
    const conn = await pending;
    expect(conn.closed).toEqual([[4002, "auth_unavailable"]]);
  });

  it("aceita o dono do token e já manda o estado atual", async () => {
    const { connect } = makeServer();
    const alice = await connect("Alice");
    expect(alice.closed).toEqual([]);
    expect(lastState(alice)?.phase).toBe("lobby");
  });
});

describe("lobby e partida", () => {
  it("o nome vem da identidade verificada, não do que o cliente manda", async () => {
    const { connect, say } = makeServer();
    const alice = await connect("Alice");
    await say(alice, { type: "join", name: "Rei do Ludo", avatarUrl: "https://x/y.png" });
    const p = lastState(alice)!.players[0];
    expect(p).toMatchObject({ id: "Alice", name: "Alice", avatarUrl: "https://x/y.png" });
  });

  it("host adiciona bot e inicia; outros jogadores não conseguem", async () => {
    const { connect, say } = makeServer();
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(alice, { type: "join", name: "Alice" });
    await say(bob, { type: "join", name: "Bob" });

    await say(bob, { type: "start" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });

    await say(alice, { type: "add_bot", level: "easy" });
    await say(alice, { type: "start" });
    expect(lastState(bob)?.phase).toBe("rolling");
    expect(lastState(bob)?.players).toHaveLength(3);
  });

  it("emoji é repassado pros outros (sem alterar o jogo) e só aceita os da lista", async () => {
    const { connect, say } = makeServer();
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(alice, { type: "emoji", emoji: "🎉" });
    expect(bob.sent.pop()).toEqual({ type: "emoji", emoji: "🎉", fromPlayerId: "Alice" });
    const before = bob.sent.length;
    await say(alice, { type: "emoji", emoji: "<script>" });
    expect(bob.sent.length).toBe(before);
  });

  it("expulsar fecha a conexão do alvo com o código de expulsão", async () => {
    const { connect, say } = makeServer();
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(alice, { type: "join", name: "Alice" });
    await say(bob, { type: "join", name: "Bob" });
    await say(alice, { type: "kick", playerId: "Bob" });
    expect(bob.closed).toEqual([[KICKED_CLOSE_CODE, "kicked"]]);
    expect(lastState(alice)?.players.map((p) => p.id)).toEqual(["Alice"]);
  });

  it("quem some do lobby perde a vaga só depois do prazo de graça (refresh não custa a cor)", async () => {
    vi.useFakeTimers();
    const { connect, say, drop } = makeServer();
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(alice, { type: "join", name: "Alice" });
    await say(bob, { type: "join", name: "Bob" });

    drop(bob);
    expect(lastState(alice)?.players.find((p) => p.id === "Bob")?.connected).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(lastState(alice)?.players.map((p) => p.id)).toEqual(["Alice", "Bob"]);

    // volta antes do prazo: mantém a mesma cor
    const bob2 = await connect("Bob");
    await say(bob2, { type: "join", name: "Bob" });
    vi.advanceTimersByTime(60_000);
    const bobSeat = lastState(alice)?.players.find((p) => p.id === "Bob");
    expect(bobSeat).toMatchObject({ connected: true, color: "blue" });

    // some de vez: perde a vaga
    drop(bob2);
    vi.advanceTimersByTime(16_000);
    expect(lastState(alice)?.players.map((p) => p.id)).toEqual(["Alice"]);
  });

  it("outra aba do mesmo jogador aberta: fechar uma não derruba a presença", async () => {
    const { connect, say, drop } = makeServer();
    const alice = await connect("Alice");
    const bob1 = await connect("Bob");
    const bob2 = await connect("Bob");
    await say(alice, { type: "join", name: "Alice" });
    await say(bob1, { type: "join", name: "Bob" });
    drop(bob1);
    expect(lastState(alice)?.players.find((p) => p.id === "Bob")?.connected).toBe(true);
    drop(bob2);
    expect(lastState(alice)?.players.find((p) => p.id === "Bob")?.connected).toBe(false);
  });
});

describe("fim de partida e persistência", () => {
  async function nearlyWon() {
    const ctx = makeServer();
    const alice = await ctx.connect("Alice");
    await ctx.say(alice, { type: "join", name: "Alice" });
    await ctx.say(alice, { type: "add_bot", level: "easy" });
    await ctx.say(alice, { type: "start" });
    // posiciona a partida: vez da Alice, dado 2, última peça a 2 casas de casa
    const ctl = (ctx.server as unknown as { controller: { state: LudoState } }).controller;
    const aliceIdx = ctl.state.players.findIndex((p) => p.id === "Alice");
    ctl.state = {
      ...ctl.state,
      phase: "moving",
      turn: aliceIdx,
      dice: 2,
      players: ctl.state.players.map((p) => (p.id === "Alice" ? { ...p, pieces: [56, 56, 56, 54] } : p)),
    };
    return { ...ctx, alice };
  }

  it("grava o histórico (prefixo LUDO:) uma única vez quando alguém vence", async () => {
    const { say, alice } = await nearlyWon();
    await say(alice, { type: "move", piece: 3 });
    await vi.waitFor(() => expect(historyPosts).toHaveLength(1));
    expect(historyPosts[0]).toMatchObject({
      room_id: "LUDO:ABCD",
      winner_name: "Alice",
    });
    const summary = (historyPosts[0] as { players_summary: { name: string; score: number }[] }).players_summary;
    expect(summary[0]).toMatchObject({ name: "Alice", score: 4 });
    expect(lastState(alice)?.phase).toBe("game_over");
  });

  it("salva o estado no storage a cada mudança e restaura (com humanos desconectados) ao reiniciar", async () => {
    const { store, connect, say } = makeServer();
    const alice = await connect("Alice");
    await say(alice, { type: "join", name: "Alice" });
    await say(alice, { type: "add_bot", level: "hard" });
    await vi.waitFor(() => expect((store.get("state") as LudoState).players).toHaveLength(2));

    const saved = store.get("state") as LudoState;
    const { server: restarted, connect: connect2 } = makeServer({ state: saved });
    await restarted.onStart();
    const again = await connect2("Alice");
    // antes do join, a sala restaurada ainda enxerga a Alice como desconectada
    expect(lastState(again)?.players.find((p) => p.id === "Alice")?.connected).toBe(false);
    expect(lastState(again)?.players.find((p) => p.bot)?.connected).toBe(true);
  });
});
