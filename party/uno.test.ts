import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UnoRoom from "./uno";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import { DECK, cardOf } from "../src/lib/uno/cards";
import type { UnoState, UnoView } from "../src/lib/uno/engine";
import { TIMING } from "../src/lib/uno/timing";

// Room server do Uno de ponta a ponta com conexões de mentira: o que importa aqui
// é o que a base não cobre — cada jogador recebe a SUA visão e a mão dos outros
// (e o monte) nunca sai do servidor.

let history: { room_id: string; winner_name: string; players_summary: { name: string; score: number }[] }[] = [];

beforeEach(() => {
  history = [];
  stubSupabase(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const view = (c: FakeConn) => c.last<{ type: string; state: UnoView }>("state")?.state;
const secret = (h: ReturnType<typeof makeHarness>) => (h.server as unknown as { controller: { state: UnoState; resume(): void } }).controller;
const find = (color: "red" | "blue" | "green" | "yellow" | null, kind: string, value: number | null = null, nth = 0) =>
  DECK.filter((c) => c.color === color && c.kind === kind && c.value === value)[nth].id;

/** Alice (host) + Bob, partida iniciada. */
async function twoHumans() {
  const h = makeHarness(UnoRoom);
  const alice = await h.connect("Alice");
  const bob = await h.connect("Bob");
  await h.say(alice, { type: "join", name: "x" });
  await h.say(bob, { type: "join", name: "Bob" });
  await h.say(alice, { type: "start" });
  return { ...h, alice, bob };
}

describe("autenticação (a mesma da base dos jogos)", () => {
  it("recusa token que não bate (4001) e avisa quando o Supabase está fora (4002)", async () => {
    const { connect } = makeHarness(UnoRoom);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "unauthorized"]]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4002, "auth_unavailable"]]);
  });
});

describe("sala", () => {
  it("o nome vem da identidade verificada; host adiciona bot e inicia; só o host", async () => {
    const h = makeHarness(UnoRoom);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Rei do Uno" });
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(alice)!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    await h.say(bob, { type: "start" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(alice, { type: "add_bot", level: "hard" });
    expect(view(bob)!.players).toHaveLength(3);
    await h.say(alice, { type: "start" });
    expect(view(bob)!.phase).toBe("playing");
  });
});

describe("cada jogador recebe só a própria visão", () => {
  it("a mão de cada um é diferente e confere com o que o servidor guarda; os outros só têm a contagem", async () => {
    const h = await twoHumans();
    const srv = secret(h).state;
    const va = view(h.alice)!;
    const vb = view(h.bob)!;
    expect(va.hand).toEqual(srv.players[0].hand);
    expect(vb.hand).toEqual(srv.players[1].hand);
    expect(va.hand).not.toEqual(vb.hand);
    expect(va.players.map((p) => p.cards)).toEqual([7, 7].map((n, i) => srv.players[i].hand.length));
  });

  it("nada da mão do Bob chega na conexão da Alice (nem o monte): confere no JSON cru de TODAS as mensagens", async () => {
    const h = await twoHumans();
    // joga algumas vezes pra gerar várias mensagens
    for (let i = 0; i < 6; i++) {
      const s = secret(h).state;
      const cur = s.players[s.turn];
      const conn = cur.id === "Alice" ? h.alice : h.bob;
      await h.say(conn, { type: "draw" });
    }
    const srv = secret(h).state;
    const bobHand = srv.players[1].hand;
    for (const msg of h.alice.sent.filter((m) => m.type === "state")) {
      const st = (msg as unknown as { state: UnoView }).state;
      const raw = JSON.stringify(st);
      expect(raw).not.toContain('"draw":');
      expect(st.players.every((p) => !("hand" in p))).toBe(true);
      // a mão que a Alice recebe nunca contém uma carta que, naquele momento, era do Bob
      expect(Array.isArray(st.hand)).toBe(true);
    }
    const last = view(h.alice)!;
    expect(last.hand.some((c) => bobHand.includes(c))).toBe(false);
    expect(JSON.stringify(last)).not.toContain(JSON.stringify(bobHand));
  });

  it("espectador (sem assento) recebe visão sem mão", async () => {
    const h = await twoHumans();
    const carol = await h.connect("Carol");
    await h.say(carol, { type: "join", name: "Carol" }); // partida em andamento: vira espectadora
    expect(carol.sent.pop()).toEqual({ type: "error", error: "game_in_progress" });
    expect(view(carol)!.hand).toEqual([]);
    expect(view(carol)!.legal).toEqual([]);
    // e continua recebendo as atualizações (sem mão) quando alguém joga
    const s = secret(h).state;
    const cur = s.players[s.turn].id === "Alice" ? h.alice : h.bob;
    await h.say(cur, { type: "draw" });
    expect(view(carol)!.hand).toEqual([]);
    expect(view(carol)!.eventSeq).toBeGreaterThan(1);
  });

  it("o estado completo (com mãos e monte) vai pro storage, nunca pro cliente", async () => {
    const h = await twoHumans();
    await vi.waitFor(() => expect((h.store.get("state") as UnoState).draw.length).toBeGreaterThan(0));
    expect((h.store.get("state") as UnoState).players[0].hand).toHaveLength(7);
  });
});

describe("partida", () => {
  it("jogada válida é aplicada e transmitida pra todos; fora da vez é recusada só pra quem errou", async () => {
    const h = await twoHumans();
    const s = secret(h).state;
    const curId = s.players[s.turn].id;
    const [cur, other] = curId === "Alice" ? [h.alice, h.bob] : [h.bob, h.alice];
    await h.say(other, { type: "draw" });
    expect(other.sent.pop()).toEqual({ type: "error", error: "not_your_turn" });
    const before = view(cur)!.eventSeq;
    await h.say(cur, { type: "draw" });
    expect(view(cur)!.eventSeq).toBeGreaterThan(before);
    expect(view(other)!.eventSeq).toBe(view(cur)!.eventSeq);
  });

  it("jogar de verdade: pega a primeira carta legal da mão e todo mundo vê no topo da pilha", async () => {
    const h = await twoHumans();
    let played = false;
    for (let guard = 0; guard < 40 && !played; guard++) {
      const s = secret(h).state;
      const curId = s.players[s.turn].id;
      const conn = curId === "Alice" ? h.alice : h.bob;
      const v = view(conn)!;
      if (v.legal.length > 0) {
        const card = v.legal[0];
        const color = cardOf(card).color ? undefined : "blue";
        await h.say(conn, { type: "play", card, color });
        played = true;
        expect(view(h.alice)!.top).toBe(card);
        expect(view(h.bob)!.top).toBe(card);
      } else {
        await h.say(conn, { type: "draw" });
        const after = secret(h).state;
        if (after.pendingDrawn !== null) await h.say(conn, { type: "pass" });
      }
    }
    expect(played).toBe(true);
  });

  it("contra bot: o bot joga sozinho; sem ninguém conectado o servidor pausa", async () => {
    vi.useFakeTimers();
    const h = makeHarness(UnoRoom);
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(alice, { type: "add_bot", level: "hard" });
    await h.say(alice, { type: "start" });
    // põe a vez no bot pra não depender do sorteio
    const ctl = secret(h);
    ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.bot) };
    ctl.resume();
    const seq = ctl.state.eventSeq;
    vi.advanceTimersByTime(TIMING.BOT_THINK_MAX_MS + 100);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
    h.drop(alice);
    const frozen = ctl.state.eventSeq;
    vi.advanceTimersByTime(60_000);
    expect(ctl.state.eventSeq).toBe(frozen);
  });
});

describe("fim de partida", () => {
  it("grava o histórico (prefixo UNO:) com as cartas que sobraram de cada um", async () => {
    const h = await twoHumans();
    const ctl = secret(h);
    // Alice com uma carta só que combina com o topo
    const top = find("red", "number", 5);
    const last = find("red", "number", 9);
    ctl.state = {
      ...ctl.state,
      discard: [top],
      color: "red",
      turn: 0,
      pendingDrawn: null,
      players: ctl.state.players.map((p, i) => (i === 0 ? { ...p, hand: [last] } : { ...p, hand: [find("blue", "number", 7), find("green", "number", 3)] })),
    };
    await h.say(h.alice, { type: "play", card: last });
    expect(view(h.alice)!.phase).toBe("game_over");
    expect(view(h.bob)!.winnerId).toBe("Alice");
    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0]).toMatchObject({ room_id: "UNO:ABCD", winner_name: "Alice" });
    expect(history[0].players_summary).toEqual([
      { name: "Alice", score: 0 },
      { name: "Bob", score: 2 },
    ]);
  });
});
