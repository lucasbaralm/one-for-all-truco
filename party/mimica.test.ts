import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForcaRoom from "./forca";
import MimicaRoom from "./mimica";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import { SONGS } from "../src/lib/mimica/catalog";
import { MIMICA_VERSION, createLobby } from "../src/lib/mimica/engine";
import type { MimicaState, MimicaView } from "../src/lib/mimica/engine";
import { TIMING } from "../src/lib/mimica/timing";

// Room server da Mímica de ponta a ponta com conexões de mentira: o que importa aqui é o que a base não cobre —
// a carta e a música só chegam a quem pode ver (cada pessoa recebe a SUA visão), `now` (relógio do servidor) vai
// junto com o estado, e a sinalização da videochamada é repassada só entre quem está na mesa.

let history: { room_id: string; winner_name: string; players_summary: { name: string; score: number }[] }[] = [];

beforeEach(() => {
  history = [];
  stubSupabase(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type StateMsg = { type: string; state: MimicaView; now: number };
const msg = (c: FakeConn) => c.last<StateMsg>("state");
const view = (c: FakeConn) => msg(c)?.state;
const ctlOf = (h: ReturnType<typeof makeHarness>) => (h.server as unknown as { controller: { state: MimicaState } }).controller;
const allJson = (c: FakeConn) => c.sent.map((m) => JSON.stringify(m)).join("\n");
const rtcOf = (c: FakeConn) => c.sent.filter((m) => m.type === "rtc");

/** Alice (host, faz a 1ª mímica) e Bob na mesa, partida iniciada. */
async function twoHumans(rounds = 1) {
  const h = makeHarness(MimicaRoom);
  const alice = await h.connect("Alice");
  const bob = await h.connect("Bob");
  await h.say(alice, { type: "join", name: "x" });
  await h.say(bob, { type: "join", name: "Bob" });
  await h.say(alice, { type: "set_rounds", rounds });
  await h.say(alice, { type: "start" });
  return { ...h, alice, bob };
}

describe("autenticação (a mesma da base dos jogos)", () => {
  it("recusa token que não bate (4001) e avisa quando o Supabase está fora (4002)", async () => {
    const { connect } = makeHarness(MimicaRoom);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "unauthorized"]]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4002, "auth_unavailable"]]);
  });
});

describe("sala", () => {
  it("o nome vem da identidade verificada; só o host define as voltas e começa; precisa de 2", async () => {
    const h = makeHarness(MimicaRoom);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Rei da Mímica" });
    await h.say(alice, { type: "start" });
    expect(alice.sent.pop()).toEqual({ type: "error", error: "not_enough_players" });
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(alice)!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    await h.say(bob, { type: "start" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(alice, { type: "set_rounds", rounds: 9 });
    expect(alice.sent.pop()).toEqual({ type: "error", error: "bad_rounds" });
    await h.say(alice, { type: "set_rounds", rounds: 3 });
    expect(view(bob)!.rounds).toBe(3);
    await h.say(alice, { type: "start" });
    expect(view(bob)!.phase).toBe("picking");
    expect(view(bob)!.mimerId).toBe("Alice");
    expect(view(bob)!.totalTurns).toBe(6);
  });

  it("a sala é de 8 pessoas: a 9ª chega como espectadora", async () => {
    const h = makeHarness(MimicaRoom);
    const conns: FakeConn[] = [];
    for (const n of ["Alice", "Bob", "Carol", "Dani", "Eva", "Fabi", "Gil", "Hugo", "Iris"]) {
      const c = await h.connect(n);
      await h.say(c, { type: "join", name: n });
      conns.push(c);
    }
    expect(conns[8].sent.pop()).toEqual({ type: "error", error: "room_full" });
    expect(view(conns[0])!.players).toHaveLength(8);
    expect(view(conns[8])!.players.map((p) => p.name)).not.toContain("Iris");
  });
});

describe("a carta e a música ficam no servidor", () => {
  it("escolhendo: só o mimer recebe a carta; ninguém mais vê título nenhum, em NENHUMA mensagem", async () => {
    const h = await twoHumans();
    const eve = await h.connect("Eve");
    await h.say(eve, { type: "join", name: "Eve" });
    expect(eve.sent.pop()).toEqual({ type: "error", error: "game_in_progress" });

    const card = view(h.alice)!.card!;
    expect(card).toHaveLength(4);
    expect(card.filter((c) => c.kind === "br")).toHaveLength(3);
    expect(card.filter((c) => c.kind === "world")).toHaveLength(1);
    for (const c of [h.bob, eve]) {
      expect(view(c)!.card).toBeNull();
      expect(view(c)!.song).toBeNull();
      for (const song of card) {
        expect(allJson(c)).not.toContain(JSON.stringify(song.title));
        expect(allJson(c)).not.toContain(JSON.stringify(song.artist));
      }
    }
  });

  it("na mímica: o mimer vê a música; os outros só o lado, o valor e as casinhas; `now` é o relógio do servidor", async () => {
    const h = await twoHumans();
    const pick = view(h.alice)!.card![0];
    await h.say(h.alice, { type: "pick", songId: pick.id });
    expect(view(h.alice)!.song).toMatchObject({ id: pick.id, title: pick.title });
    const mine = view(h.bob)!;
    expect(mine.phase).toBe("miming");
    expect(mine.song).toBeNull();
    expect(mine.kind).toBe(pick.kind);
    expect(mine.worth).toBe(pick.points);
    expect(mine.pattern.filter((c) => c === null).length).toBeGreaterThan(0);
    expect(allJson(h.bob)).not.toContain(JSON.stringify(pick.title));
    expect(allJson(h.bob)).not.toContain(JSON.stringify(pick.artist));
    expect(typeof msg(h.bob)!.now).toBe("number");
    expect(mine.deadline).toBeGreaterThan(0);
  });

  it("chute errado aparece pra todos; o certo encerra o turno e revela o título pra todo mundo", async () => {
    vi.useFakeTimers(); // antes de montar a sala: o relógio do controlador é o Date.now de quando ele nasce
    const h = await twoHumans();
    const pick = view(h.alice)!.card![0];
    await h.say(h.alice, { type: "pick", songId: pick.id });
    await h.say(h.bob, { type: "guess", text: "nada a ver" });
    expect(view(h.alice)!.guesses).toEqual([{ n: 1, by: "Bob", text: "nada a ver", ok: false }]);
    expect(view(h.bob)!.guesses).toHaveLength(1);

    await h.say(h.alice, { type: "guess", text: pick.title });
    expect(h.alice.sent.pop()).toEqual({ type: "error", error: "mimer_cannot_guess" });
    vi.advanceTimersByTime(1000);
    await h.say(h.bob, { type: "guess", text: pick.title });
    expect(view(h.bob)!.phase).toBe("turn_end");
    for (const c of [h.alice, h.bob]) {
      expect(view(c)!.song).toMatchObject({ title: pick.title, artist: pick.artist });
      expect(view(c)!.solvedBy).toBe("Bob");
    }
    expect(view(h.alice)!.players.find((p) => p.id === "Alice")!.score).toBe(pick.points);
    expect(view(h.alice)!.players.find((p) => p.id === "Bob")!.score).toBeGreaterThan(pick.points);
  });

  it("só o mimer aceita um chute na mão", async () => {
    const h = await twoHumans();
    const pick = view(h.alice)!.card![0];
    await h.say(h.alice, { type: "pick", songId: pick.id });
    await h.say(h.bob, { type: "guess", text: "quase mas não" });
    await h.say(h.bob, { type: "accept", guess: 1 });
    expect(h.bob.sent.pop()).toEqual({ type: "error", error: "not_mimer" });
    await h.say(h.alice, { type: "accept", guess: 1 });
    expect(view(h.bob)!.phase).toBe("turn_end");
    expect(view(h.bob)!.solvedBy).toBe("Bob");
  });
});

describe("videochamada: sinalização", () => {
  const signal = { kind: "offer", sdp: "v=0..." };

  it("repassa pra pessoa certa, com o remetente verdadeiro, e só pra ela", async () => {
    const h = makeHarness(MimicaRoom);
    const [alice, bob, carol] = [await h.connect("Alice"), await h.connect("Bob"), await h.connect("Carol")];
    for (const [c, n] of [[alice, "Alice"], [bob, "Bob"], [carol, "Carol"]] as const) await h.say(c, { type: "join", name: n });

    await h.say(alice, { type: "rtc", to: "Bob", from: "Carol", signal }); // `from` do cliente não conta
    expect(rtcOf(bob)).toEqual([{ type: "rtc", from: "Alice", signal }]);
    expect(rtcOf(carol)).toEqual([]);
    expect(rtcOf(alice)).toEqual([]);
  });

  it("vale no lobby e na partida", async () => {
    const h = await twoHumans();
    await h.say(h.alice, { type: "rtc", to: "Bob", signal: { kind: "hello" } });
    await h.say(h.bob, { type: "rtc", to: "Alice", signal: { kind: "ice", candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host" } } });
    expect(rtcOf(h.bob)).toHaveLength(1);
    expect(rtcOf(h.alice)).toHaveLength(1);
  });

  it("espectador não entra na chamada, nem como remetente nem como destino", async () => {
    const h = await twoHumans();
    const eve = await h.connect("Eve");
    await h.say(eve, { type: "join", name: "Eve" }); // partida em andamento: vira espectadora
    await h.say(eve, { type: "rtc", to: "Alice", signal: { kind: "hello" } });
    await h.say(h.alice, { type: "rtc", to: "Eve", signal: { kind: "hello" } });
    expect(rtcOf(h.alice)).toEqual([]);
    expect(rtcOf(eve)).toEqual([]);
  });

  it("ignora destino inexistente, o próprio remetente, sinal desconhecido, texto solto e mensagem enorme", async () => {
    const h = await twoHumans();
    const before = rtcOf(h.bob).length;
    await h.say(h.alice, { type: "rtc", to: "Ninguém", signal });
    await h.say(h.alice, { type: "rtc", to: "Alice", signal });
    await h.say(h.alice, { type: "rtc", to: "Bob", signal: { kind: "formatar-disco" } });
    await h.say(h.alice, { type: "rtc", to: "Bob", signal: "oi" });
    await h.say(h.alice, { type: "rtc", to: "Bob" });
    await h.say(h.alice, { type: "rtc", to: 7, signal });
    await h.say(h.alice, { type: "rtc", to: "Bob", signal: { kind: "offer", sdp: "x".repeat(40_000) } });
    expect(rtcOf(h.bob)).toHaveLength(before);
    expect(h.alice.sent.some((m) => m.type === "error")).toBe(false); // sinalização ruim não vira erro de jogo
  });

  it("outros jogos não repassam (só quem declara videochamada)", async () => {
    const h = makeHarness(ForcaRoom);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(bob, { type: "join", name: "Bob" });
    await h.say(alice, { type: "rtc", to: "Bob", signal });
    expect(rtcOf(bob)).toEqual([]);
  });

  it("a sinalização não muda o jogo nem acorda o estado", async () => {
    const h = await twoHumans();
    const seq = view(h.alice)!.eventSeq;
    await h.say(h.alice, { type: "rtc", to: "Bob", signal });
    expect(view(h.alice)!.eventSeq).toBe(seq);
    expect(view(h.alice)!.phase).toBe("picking");
  });
});

describe("histórico e restauração", () => {
  it("grava o resultado com o prefixo MIMICA: quando a partida acaba", async () => {
    vi.useFakeTimers();
    const h = await twoHumans(1);
    // turno 1: Alice faz, Bob acerta
    const pick = view(h.alice)!.card![0];
    await h.say(h.alice, { type: "pick", songId: pick.id });
    vi.advanceTimersByTime(1000);
    await h.say(h.bob, { type: "guess", text: pick.title });
    await vi.advanceTimersByTimeAsync(TIMING.TURN_END_MS);
    expect(view(h.bob)!.turnNo).toBe(2);
    expect(view(h.bob)!.mimerId).toBe("Bob");
    // turno 2: Bob faz, ninguém acerta (o tempo esgota)
    await h.say(h.bob, { type: "pick", songId: view(h.bob)!.card![0].id });
    await vi.advanceTimersByTimeAsync(TIMING.MIME_MS + TIMING.TURN_END_MS + 50);
    expect(view(h.alice)!.phase).toBe("game_over");
    expect(view(h.alice)!.winnerId).toBe("Bob");
    expect(history).toHaveLength(1);
    expect(history[0].room_id).toBe("MIMICA:ABCD");
    expect(history[0].winner_name).toBe("Bob");
    expect(history[0].players_summary.map((p) => p.name)).toEqual(["Bob", "Alice"]);
    expect(history[0].players_summary[0].score).toBeGreaterThan(history[0].players_summary[1].score);
  });

  it("a partida volta do storage com todo mundo desconectado, e o formato antigo vira lobby", async () => {
    const live = await twoHumans();
    const saved = JSON.parse(JSON.stringify(ctlOf(live).state)) as MimicaState;
    expect(saved.phase).toBe("picking");

    const restored = makeHarness(MimicaRoom, { storage: { state: saved } });
    await restored.server.onStart!();
    const s = ctlOf(restored).state;
    expect(s.phase).toBe("picking");
    expect(s.players.every((p) => !p.connected)).toBe(true);

    const old = makeHarness(MimicaRoom, { storage: { state: { ...saved, version: MIMICA_VERSION + 1 } } });
    await old.server.onStart!();
    expect(ctlOf(old).state).toEqual(createLobby());
  });

  it("sem ninguém conectado nada acontece sozinho; quem volta encontra o tempo inteiro", async () => {
    vi.useFakeTimers();
    const h = await twoHumans();
    h.drop(h.alice);
    h.drop(h.bob);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(ctlOf(h).state.phase).toBe("picking");
    expect(ctlOf(h).state.turnNo).toBe(1);
    const bob = await h.connect("Bob");
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(bob)!.deadline - msg(bob)!.now).toBe(TIMING.PICK_MS);
  });

  it("todas as músicas do catálogo cabem numa carta (ids existem)", async () => {
    const h = await twoHumans();
    for (const c of view(h.alice)!.card!) expect(SONGS[c.id].title).toBe(c.title);
  });
});
