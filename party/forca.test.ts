import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForcaRoom from "./forca";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import type { ForcaState, ForcaView } from "../src/lib/forca/engine";
import { TIMING } from "../src/lib/forca/timing";

// Room server da Forca de ponta a ponta com conexões de mentira: o que importa
// aqui é o que a base não cobre — a palavra secreta nunca chega no cliente
// enquanto a rodada está aberta, e `now` (relógio do servidor) vai junto.

let history: { room_id: string; winner_name: string; players_summary: { name: string; score: number }[] }[] = [];

beforeEach(() => {
  history = [];
  stubSupabase(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type StateMsg = { type: string; state: ForcaView; now: number };
const msg = (c: FakeConn) => c.last<StateMsg>("state");
const view = (c: FakeConn) => msg(c)?.state;
const secret = (h: ReturnType<typeof makeHarness>) =>
  (h.server as unknown as { controller: { state: ForcaState; resume(): void } }).controller;

/** Alice (host) + Bob, partida iniciada. */
async function twoHumans() {
  const h = makeHarness(ForcaRoom);
  const alice = await h.connect("Alice");
  const bob = await h.connect("Bob");
  await h.say(alice, { type: "join", name: "x" });
  await h.say(bob, { type: "join", name: "Bob" });
  await h.say(alice, { type: "start" });
  return { ...h, alice, bob };
}

describe("autenticação (a mesma da base dos jogos)", () => {
  it("recusa token que não bate (4001) e avisa quando o Supabase está fora (4002)", async () => {
    const { connect } = makeHarness(ForcaRoom);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "unauthorized"]]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4002, "auth_unavailable"]]);
  });
});

describe("sala", () => {
  it("o nome vem da identidade verificada; host adiciona bot, escolhe as palavras e inicia; só o host", async () => {
    const h = makeHarness(ForcaRoom);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Rei da Forca" });
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(alice)!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    await h.say(bob, { type: "start" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(bob, { type: "set_rounds", rounds: 8 });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(alice, { type: "set_rounds", rounds: 3 });
    await h.say(alice, { type: "add_bot", level: "hard" });
    expect(view(bob)!.players).toHaveLength(3);
    expect(view(bob)!.rounds).toBe(3);
    await h.say(alice, { type: "start" });
    expect(view(bob)!.phase).toBe("playing");
  });
});

describe("a palavra secreta fica no servidor", () => {
  it("todo mundo recebe o mesmo padrão (traços), a categoria e o tamanho; nunca a palavra", async () => {
    const h = await twoHumans();
    const srv = secret(h).state;
    const word = srv.round!.word;
    const va = view(h.alice)!;
    const vb = view(h.bob)!;
    expect(va.pattern).toEqual(vb.pattern);
    expect(va.pattern).toHaveLength([...word].length);
    expect(va.pattern.every((c) => c === null)).toBe(true);
    expect(va.category).toBe(srv.round!.category);
    expect(va.word).toBeNull();
    for (const c of [h.alice, h.bob]) {
      const raw = c.sent.map((m) => JSON.stringify(m)).join("\n");
      expect(raw).not.toContain(word);
      expect(raw).not.toContain(srv.round!.norm);
    }
  });

  it("depois de cada chute nenhuma mensagem tem a palavra até a rodada acabar; só o que foi chutado aparece", async () => {
    const h = await twoHumans();
    const srv = secret(h).state;
    const word = srv.round!.word;
    const norm = srv.round!.norm;
    // joga letras que NÃO estão na palavra até quase fechar a forca (sobra 1 vida)
    const wrong = [..."ZXKWYJQVHFB"].filter((l) => !norm.includes(l));
    for (let i = 0; i < 5; i++) {
      const s = secret(h).state;
      const conn = s.players[s.turn].id === "Alice" ? h.alice : h.bob;
      await h.say(conn, { type: "guess", letter: wrong[i] });
    }
    expect(view(h.alice)!.lives).toBe(1);
    expect(view(h.alice)!.word).toBeNull();
    for (const c of [h.alice, h.bob]) {
      const raw = c.sent.map((m) => JSON.stringify(m)).join("\n");
      expect(raw).not.toContain(`"${word}"`);
      expect(raw).not.toContain(norm);
      expect(raw).not.toContain('"norm"');
    }
    // a última vida: a forca fecha e AÍ a palavra é revelada pra todos
    const s = secret(h).state;
    const conn = s.players[s.turn].id === "Alice" ? h.alice : h.bob;
    await h.say(conn, { type: "guess", letter: wrong[5] });
    expect(view(h.alice)!.status).toBe("lost");
    expect(view(h.alice)!.word).toBe(word);
    expect(view(h.bob)!.word).toBe(word);
  });

  it("o estado completo (com a palavra) vai pro storage, nunca pro cliente", async () => {
    const h = await twoHumans();
    await vi.waitFor(() => expect((h.store.get("state") as ForcaState).round?.word).toBeTruthy());
  });

  it("espectador (sem assento) vê o mesmo que os jogadores, sem a palavra", async () => {
    const h = await twoHumans();
    const carol = await h.connect("Carol");
    await h.say(carol, { type: "join", name: "Carol" });
    expect(carol.sent.pop()).toEqual({ type: "error", error: "game_in_progress" });
    expect(view(carol)!.pattern).toEqual(view(h.alice)!.pattern);
    expect(JSON.stringify(carol.sent)).not.toContain(secret(h).state.round!.norm);
  });
});

describe("relógio do servidor", () => {
  it("a mensagem de estado leva `now` e o prazo da vez no mesmo relógio", async () => {
    const h = await twoHumans();
    const m = msg(h.alice)!;
    expect(typeof m.now).toBe("number");
    expect(m.state.turnDeadline).toBeGreaterThan(m.now);
    expect(m.state.turnDeadline - m.now).toBeLessThanOrEqual(TIMING.INTRO_MS + TIMING.TURN_MS);
  });
});

describe("partida", () => {
  it("chute válido é transmitido pra todos; fora da vez é recusado só pra quem errou", async () => {
    const h = await twoHumans();
    const s = secret(h).state;
    const [cur, other] = s.players[s.turn].id === "Alice" ? [h.alice, h.bob] : [h.bob, h.alice];
    await h.say(other, { type: "guess", letter: "A" });
    expect(other.sent.pop()).toEqual({ type: "error", error: "not_your_turn" });
    const before = view(cur)!.eventSeq;
    await h.say(cur, { type: "guess", letter: "A" });
    expect(view(cur)!.eventSeq).toBeGreaterThan(before);
    expect(view(other)!.eventSeq).toBe(view(cur)!.eventSeq);
    expect(view(other)!.guesses.map((g) => g.letter)).toEqual(["A"]);
  });

  it("repetir a letra é recusado; chutar a palavra certa fecha a rodada pra todos", async () => {
    const h = await twoHumans();
    const word = secret(h).state.round!.word;
    const conn = () => (secret(h).state.players[secret(h).state.turn].id === "Alice" ? h.alice : h.bob);
    await h.say(conn(), { type: "guess", letter: "E" });
    // acertando ou errando a vez passou — de qualquer forma E é repetição pra quem chutar agora
    await h.say(conn(), { type: "guess", letter: "E" });
    expect(h.alice.sent.concat(h.bob.sent).some((m) => (m as { error?: string }).error === "already_guessed")).toBe(true);
    await h.say(conn(), { type: "guess_word", word });
    expect(view(h.alice)!.phase).toBe("round_end");
    expect(view(h.bob)!.word).toBe(word);
  });

  it("contra bot: o bot chuta sozinho; sem ninguém conectado o servidor pausa", async () => {
    vi.useFakeTimers();
    const h = makeHarness(ForcaRoom);
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(alice, { type: "add_bot", level: "hard" });
    await h.say(alice, { type: "start" });
    // põe a vez no bot pra não depender do sorteio
    const ctl = secret(h);
    ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.bot) };
    ctl.resume();
    const seq = ctl.state.eventSeq;
    vi.advanceTimersByTime(TIMING.INTRO_MS + TIMING.BOT_THINK_MAX_MS + 100);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
    h.drop(alice);
    const frozen = ctl.state.eventSeq;
    vi.advanceTimersByTime(120_000);
    expect(ctl.state.eventSeq).toBe(frozen);
  });
});

describe("fim de partida", () => {
  it("grava o histórico (prefixo FORCA:) com os pontos de cada um", async () => {
    const h = await twoHumans();
    const ctl = secret(h);
    // última rodada, palavra a uma letra de fechar, vez da Alice
    ctl.state = {
      ...ctl.state,
      rounds: 1,
      roundNo: 1,
      turn: 0,
      round: { ...ctl.state.round!, word: "GATO", norm: "GATO", guesses: [{ letter: "G", by: "Alice", hits: 1 }, { letter: "A", by: "Alice", hits: 1 }, { letter: "T", by: "Alice", hits: 1 }], lives: 6, status: "playing", solvedBy: null },
    };
    await h.say(h.alice, { type: "guess", letter: "O" });
    expect(view(h.alice)!.phase).toBe("round_end");
    vi.useFakeTimers();
    ctl.resume();
    vi.advanceTimersByTime(TIMING.ROUND_END_MS + TIMING.LETTER_SETTLE_MS + 50);
    vi.useRealTimers();
    expect(view(h.bob)!.phase).toBe("game_over");
    expect(view(h.bob)!.winnerId).toBe("Alice");
    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0]).toMatchObject({ room_id: "FORCA:ABCD", winner_name: "Alice" });
    expect(history[0].players_summary).toEqual([
      { name: "Alice", score: 40 },
      { name: "Bob", score: 0 },
    ]);
  });
});
