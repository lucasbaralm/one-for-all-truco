import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControllerHooks, GameRoom, RoomController } from "./game-room";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";

// Contrato do GameRoom (a base de todos os room servers com salas), testado com
// um "jogo" mínimo inventado aqui — assim estes testes valem pra qualquer jogo
// que herde dele e continuam certos mesmo se Ludo/Dobble mudarem.

interface Seat {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bot?: boolean;
  connected: boolean;
}
interface CounterState {
  phase: "lobby" | "playing" | "over";
  players: Seat[];
  hostId: string | null;
  count: number;
}

class CounterController implements RoomController<CounterState> {
  state: CounterState = { phase: "lobby", players: [], hostId: null, count: 0 };
  pauseLog: boolean[] = [];
  constructor(private hooks: ControllerHooks<CounterState>) {}

  private commit(next: CounterState) {
    this.state = next;
    this.hooks.onChange(next);
  }

  dispatch(actor: string, message: { type: string; [k: string]: unknown }) {
    const s = this.state;
    const ok = (next: CounterState) => {
      this.commit(next);
      return { ok: true as const, state: next };
    };
    switch (message.type) {
      case "join": {
        const existing = s.players.find((p) => p.id === actor);
        if (existing) {
          return ok({ ...s, players: s.players.map((p) => (p.id === actor ? { ...p, name: String(message.name), avatarUrl: message.avatarUrl as string | null, connected: true } : p)) });
        }
        if (s.phase !== "lobby") return { ok: false as const, error: "in_progress" };
        const seat: Seat = { id: actor, name: String(message.name), avatarUrl: message.avatarUrl as string | null, connected: true };
        return ok({ ...s, players: [...s.players, seat], hostId: s.hostId ?? actor });
      }
      case "start":
        if (s.hostId !== actor) return { ok: false as const, error: "not_host" };
        return ok({ ...s, phase: "playing" });
      case "inc":
        if (s.phase !== "playing" || !s.players.some((p) => p.id === actor)) return { ok: false as const, error: "cannot" };
        return ok({ ...s, count: s.count + 1 });
      case "finish":
        return s.phase === "playing" ? ok({ ...s, phase: "over" }) : { ok: false as const, error: "cannot" };
      case "kick": {
        if (s.hostId !== actor) return { ok: false as const, error: "not_host" };
        this.hooks.onKick(String(message.playerId));
        return ok({ ...s, players: s.players.filter((p) => p.id !== message.playerId) });
      }
      default:
        return { ok: false as const, error: "unknown" };
    }
  }

  setConnected(id: string, connected: boolean) {
    this.commit({ ...this.state, players: this.state.players.map((p) => (p.id === id && !p.bot ? { ...p, connected } : p)) });
  }
  leave(id: string) {
    if (this.state.phase !== "lobby") return this.setConnected(id, false);
    const players = this.state.players.filter((p) => p.id !== id);
    this.commit({ ...this.state, players, hostId: players[0]?.id ?? null });
  }
  setPaused(paused: boolean) {
    this.pauseLog.push(paused);
  }
}

class CounterRoom extends GameRoom<CounterState> {
  protected createController(hooks: ControllerHooks<CounterState>): RoomController<CounterState> {
    return new CounterController(hooks);
  }
  protected emojis() {
    return ["👍", "🎉"];
  }
  protected stateMessage(state: CounterState) {
    return JSON.stringify({ type: "state", state });
  }
  protected isLobby(s: CounterState) {
    return s.phase === "lobby";
  }
  protected isGameOver(s: CounterState) {
    return s.phase === "over";
  }
  protected findPlayer(s: CounterState, id: string) {
    return s.players.find((p) => p.id === id);
  }
  protected markHumansDisconnected(s: CounterState): CounterState {
    return { ...s, players: s.players.map((p) => (p.bot ? p : { ...p, connected: false })) };
  }
  protected historyPrefix() {
    return "COUNTER:";
  }
  protected historyRow(s: CounterState) {
    return s.phase === "over" ? { winner_name: "ninguém", players_summary: [{ count: s.count }] } : null;
  }
}

let history: { room_id: string; winner_name: string; players_summary: unknown[] }[] = [];

beforeEach(() => {
  history = [];
  stubSupabase(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = (storage?: Record<string, unknown>) => makeHarness(CounterRoom, { storage });
const ctlOf = (h: ReturnType<typeof setup>) => (h.server as unknown as { controller: CounterController }).controller;
const stateOf = (c: FakeConn) => c.last<{ state: CounterState }>("state")?.state;
const types = (c: FakeConn) => c.sent.map((m) => m.type);

describe("autenticação", () => {
  it("recusa sem token, token inválido e nome que não é o dono do token (4001)", async () => {
    const { connect } = setup();
    expect((await connect("Alice", "")).closed).toEqual([[4001, "unauthorized"]]);
    expect((await connect("Alice", "token-qualquer")).closed).toEqual([[4001, "unauthorized"]]);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "unauthorized"]]);
  });

  it("Supabase com erro de rede ou 5xx = 4002, diferente de login recusado", async () => {
    const { connect } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4002, "auth_unavailable"]]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    expect((await connect("Bob")).closed).toEqual([[4002, "auth_unavailable"]]);
  });

  it("Supabase que não responde: desiste em 3s (antes do 4s que o navegador espera)", async () => {
    vi.useFakeTimers();
    const { connect } = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))))
    );
    const pending = connect("Alice");
    await vi.advanceTimersByTimeAsync(2999);
    let done = false;
    void pending.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect((await pending).closed).toEqual([[4002, "auth_unavailable"]]);
  });

  it("login ok: já recebe o estado atual", async () => {
    const { connect } = setup();
    const alice = await connect("Alice");
    expect(alice.closed).toEqual([]);
    expect(stateOf(alice)?.phase).toBe("lobby");
  });

  it("mensagem que chega ANTES de a checagem do login terminar espera por ela (não é descartada)", async () => {
    const h = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ user_metadata: { username: "Alice" } }), { status: 200 });
    }));
    const conn = new FakeConn("c-early");
    h.conns.set(conn.id, conn);
    const ctx = { request: { url: "http://x/parties/t/ABCD?token=user:Alice&playerId=Alice" } };
    const connecting = h.server.onConnect!(conn as never, ctx as never);
    const messaging = h.server.onMessage!(JSON.stringify({ type: "join", name: "x" }), conn as never);
    release();
    await Promise.all([connecting, messaging]);
    expect(stateOf(conn)!.players.map((p) => p.id)).toEqual(["Alice"]);
  });
});

describe("mensagens", () => {
  it("lixo (JSON quebrado, binário, sem type) e conexão sem identidade são ignorados em silêncio", async () => {
    const h = setup();
    const alice = await h.connect("Alice");
    const before = alice.sent.length;
    await h.server.onMessage!("isso não é json", alice as never);
    await h.server.onMessage!(new ArrayBuffer(8), alice as never);
    await h.say(alice, { nada: "de type" });
    await h.say(alice, { type: 42 });
    const mallory = await h.connect("Mallory", "user:Alice"); // recusada
    await h.say(mallory, { type: "join", name: "Mallory" });
    expect(alice.sent).toHaveLength(before);
    expect(ctlOf(h).state.players).toEqual([]);
  });

  it("join usa o nome da identidade verificada e só aceita foto curta e em texto", async () => {
    const h = setup();
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Rei do Pedaço", avatarUrl: "https://x/ok.png" });
    expect(ctlOf(h).state.players[0]).toMatchObject({ id: "Alice", name: "Alice", avatarUrl: "https://x/ok.png" });
    await h.say(alice, { type: "join", name: "Alice", avatarUrl: "x".repeat(601) });
    expect(ctlOf(h).state.players[0].avatarUrl).toBeNull();
    await h.say(alice, { type: "join", name: "Alice", avatarUrl: { evil: true } });
    expect(ctlOf(h).state.players[0].avatarUrl).toBeNull();
  });

  it("erro do controlador volta só pra quem mandou", async () => {
    const h = setup();
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(bob, { type: "join", name: "Bob" });
    const bobSent = bob.sent.length;
    await h.say(bob, { type: "start" }); // Bob não é o host
    expect(bob.sent.at(-1)).toEqual({ type: "error", error: "not_host" });
    expect(types(alice).filter((t) => t === "error")).toEqual([]);
    expect(bob.sent.length).toBe(bobSent + 1);
  });

  it("emoji: só os permitidos, repassados aos outros (nunca a quem mandou), sem mexer no jogo", async () => {
    const h = setup();
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    const stateBefore = ctlOf(h).state;
    await h.say(alice, { type: "emoji", emoji: "👍" });
    expect(bob.sent.at(-1)).toEqual({ type: "emoji", emoji: "👍", fromPlayerId: "Alice" });
    expect(types(alice)).not.toContain("emoji");
    const received = bob.sent.length;
    await h.say(alice, { type: "emoji", emoji: "💣" }); // fora da lista
    await h.say(alice, { type: "emoji", emoji: 5 });
    expect(bob.sent).toHaveLength(received);
    expect(ctlOf(h).state).toBe(stateBefore); // o jogo não mudou
  });
});

describe("expulsar e presença", () => {
  async function table() {
    vi.useFakeTimers();
    const h = setup();
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(bob, { type: "join", name: "Bob" });
    return { ...h, alice, bob };
  }

  it("expulsar fecha TODAS as abas do alvo com 4003, sem tocar nas dos outros", async () => {
    const h = await table();
    const bobTab2 = await h.connect("Bob");
    await h.say(h.alice, { type: "kick", playerId: "Bob" });
    expect(h.bob.closed).toEqual([[4003, "kicked"]]);
    expect(bobTab2.closed).toEqual([[4003, "kicked"]]);
    expect(h.alice.closed).toEqual([]);
  });

  it("duas abas do mesmo jogador: fechar uma não o derruba; fechar a última, sim", async () => {
    const h = await table();
    const bobTab2 = await h.connect("Bob");
    h.drop(h.bob);
    expect(ctlOf(h).state.players.find((p) => p.id === "Bob")!.connected).toBe(true);
    h.drop(bobTab2);
    expect(ctlOf(h).state.players.find((p) => p.id === "Bob")!.connected).toBe(false);
  });

  it("no lobby o assento some só depois de 15s de graça; voltar antes cancela a remoção", async () => {
    const h = await table();
    h.drop(h.bob);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(ctlOf(h).state.players.map((p) => p.id)).toEqual(["Alice", "Bob"]);
    const back = await h.connect("Bob");
    await h.say(back, { type: "join", name: "Bob" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ctlOf(h).state.players.find((p) => p.id === "Bob")!.connected).toBe(true);

    h.drop(back);
    await vi.advanceTimersByTimeAsync(15_100);
    expect(ctlOf(h).state.players.map((p) => p.id)).toEqual(["Alice"]);
  });

  it("com a partida rolando, quem cai fica 'desconectado' no assento (nunca é removido)", async () => {
    const h = await table();
    await h.say(h.alice, { type: "start" });
    h.drop(h.bob);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctlOf(h).state.players.map((p) => [p.id, p.connected])).toEqual([["Alice", true], ["Bob", false]]);
  });
});

describe("pausa", () => {
  it("nasce pausada, acorda com o primeiro join, e pausa de novo quando a última conexão cai", async () => {
    const h = setup();
    expect(ctlOf(h).pauseLog).toEqual([true]);
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    expect(ctlOf(h).pauseLog.at(-1)).toBe(false);
    h.drop(alice);
    expect(ctlOf(h).pauseLog.at(-1)).toBe(true);
  });

  it("até um join recusado acorda a sala (espectador conta como conexão viva)", async () => {
    const h = setup();
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(alice, { type: "start" });
    h.drop(alice);
    expect(ctlOf(h).pauseLog.at(-1)).toBe(true);

    const watcher = await h.connect("Carol");
    await h.say(watcher, { type: "join", name: "Carol" }); // recusado: partida em andamento
    expect(watcher.sent.at(-1)).toEqual({ type: "error", error: "in_progress" });
    expect(ctlOf(h).pauseLog.at(-1)).toBe(false);
  });
});

describe("persistência e histórico", () => {
  async function playToTheEnd() {
    const h = setup();
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(bob, { type: "join", name: "Bob" });
    await h.say(alice, { type: "start" });
    await h.say(alice, { type: "inc" });
    await h.say(bob, { type: "inc" });
    await h.say(alice, { type: "finish" });
    return { ...h, alice, bob };
  }

  it("cada mudança é transmitida pra todos e salva no storage da sala", async () => {
    const h = await playToTheEnd();
    expect(stateOf(h.bob)).toMatchObject({ phase: "over", count: 2 });
    await vi.waitFor(() => expect((h.store.get("state") as CounterState).phase).toBe("over"));
  });

  it("o fim da partida grava UMA linha de histórico, com o prefixo do jogo e o código da sala", async () => {
    const h = await playToTheEnd();
    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0]).toMatchObject({ room_id: "COUNTER:ABCD", winner_name: "ninguém", players_summary: [{ count: 2 }] });
    // mudanças depois do fim (ex.: alguém reconecta) não regravam
    await h.say(h.alice, { type: "join", name: "Alice" });
    await new Promise((r) => setTimeout(r, 10));
    expect(history).toHaveLength(1);
  });

  it("reiniciar o servidor restaura a sala com os humanos desconectados — e uma partida já encerrada não grava histórico de novo", async () => {
    const h = await playToTheEnd();
    const saved = h.store.get("state") as CounterState;
    const restarted = setup({ state: saved });
    await restarted.server.onStart!();
    expect(ctlOf(restarted).state.phase).toBe("over");
    expect(ctlOf(restarted).state.players.every((p) => !p.connected)).toBe(true);
    history.length = 0;
    const carol = await restarted.connect("Carol");
    await restarted.say(carol, { type: "join", name: "Carol" }); // outra mudança de estado
    await new Promise((r) => setTimeout(r, 10));
    expect(history).toHaveLength(0);
  });
});
