import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForcaRoom from "./forca";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import { FORCA_VERSION, createLobby } from "../src/lib/forca/engine";
import type { ForcaState, ForcaView } from "../src/lib/forca/engine";
import { TIMING } from "../src/lib/forca/timing";

// Room server da Forca de ponta a ponta com conexões de mentira: o que importa aqui é o que a
// base não cobre — a palavra que o escolhedor digitou só chega nele (e em todo mundo quando a
// rodada acaba), cada pessoa recebe a SUA visão, e `now` (relógio do servidor) vai junto.

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
const ctlOf = (h: ReturnType<typeof makeHarness>) => (h.server as unknown as { controller: { state: ForcaState; resume(): void } }).controller;
const allJson = (c: FakeConn) => c.sent.map((m) => JSON.stringify(m)).join("\n");

/** Alice (host, escolhe a 1ª palavra), Bob e Carol na mesa, partida iniciada. */
async function threeHumans(rounds = 3) {
  const h = makeHarness(ForcaRoom);
  const alice = await h.connect("Alice");
  const bob = await h.connect("Bob");
  const carol = await h.connect("Carol");
  await h.say(alice, { type: "join", name: "x" });
  await h.say(bob, { type: "join", name: "Bob" });
  await h.say(carol, { type: "join", name: "Carol" });
  await h.say(alice, { type: "set_rounds", rounds });
  await h.say(alice, { type: "start" });
  return { ...h, alice, bob, carol };
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
  it("o nome vem da identidade verificada; só o host define as palavras e começa; precisa de 2", async () => {
    const h = makeHarness(ForcaRoom);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Rei da Forca" });
    await h.say(alice, { type: "start" });
    expect(alice.sent.pop()).toEqual({ type: "error", error: "not_enough_players" });
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(alice)!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    await h.say(bob, { type: "start" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(bob, { type: "set_rounds", rounds: 5 });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(alice, { type: "set_rounds", rounds: 9 });
    expect(alice.sent.pop()).toEqual({ type: "error", error: "bad_rounds" });
    await h.say(alice, { type: "set_rounds", rounds: 1 });
    expect(view(bob)!.rounds).toBe(1);
    await h.say(alice, { type: "start" });
    expect(view(bob)!.phase).toBe("choosing");
    expect(view(bob)!.chooserId).toBe("Alice");
  });

  it("a sala é de 4 pessoas: a 5ª chega como espectadora", async () => {
    const h = makeHarness(ForcaRoom);
    const conns: FakeConn[] = [];
    for (const n of ["Alice", "Bob", "Carol", "Dani", "Eva"]) {
      const c = await h.connect(n);
      await h.say(c, { type: "join", name: n });
      conns.push(c);
    }
    expect(conns[4].sent.pop()).toEqual({ type: "error", error: "room_full" });
    expect(view(conns[0])!.players).toHaveLength(4);
    expect(view(conns[4])!.players.map((p) => p.name)).not.toContain("Eva");
  });
});

describe("a palavra escolhida fica no servidor", () => {
  it("antes de escolherem, ninguém tem palavra nenhuma (nem padrão)", async () => {
    const h = await threeHumans();
    for (const c of [h.alice, h.bob, h.carol]) {
      const v = view(c)!;
      expect(v.phase).toBe("choosing");
      expect(v.pattern).toEqual([]);
      expect(v.word).toBeNull();
    }
  });

  it("só o escolhedor recebe a palavra; os outros e o espectador recebem só o que foi revelado — em NENHUMA mensagem", async () => {
    const h = await threeHumans();
    const dani = await h.connect("Dani"); // quarta pessoa: ainda dá pra entrar? a partida já começou → vira espectador
    await h.say(dani, { type: "join", name: "Dani" });
    expect(dani.sent.pop()).toEqual({ type: "error", error: "game_in_progress" });
    await h.say(h.alice, { type: "choose_word", word: "casa de papel" });
    const word = "CASA DE PAPEL";
    expect(view(h.alice)!.word).toBe(word);
    for (const c of [h.bob, h.carol, dani]) {
      expect(view(c)!.word).toBeNull();
      expect(view(c)!.phase).toBe("playing");
      expect(view(c)!.pattern).toHaveLength(word.length);
      expect(view(c)!.pattern.filter((ch) => ch === null)).toHaveLength(11); // as letras; os 2 espaços já aparecem
      expect(view(c)!.pattern.filter((ch) => ch === " ")).toHaveLength(2);
    }
    // algumas jogadas: Bob acerta o A, Carol erra o Z
    await h.say(h.bob, { type: "guess", letter: "a" });
    await h.say(h.carol, { type: "guess", letter: "z" });
    for (const c of [h.bob, h.carol, dani]) {
      const raw = allJson(c);
      expect(raw).not.toContain("PAPEL");
      expect(raw).not.toContain("CASA DE");
      expect(raw).not.toContain('"norm"');
      expect(view(c)!.pattern[1]).toBe("A"); // o A foi chutado: aparece
      expect(view(c)!.pattern[0]).toBeNull(); // o C não
    }
    // o servidor guarda tudo (o storage nunca é lido por cliente)
    await vi.waitFor(() => expect((h.store.get("state") as ForcaState).round?.word).toBe(word));
  });

  it("quando a rodada acaba todo mundo vê a palavra inteira", async () => {
    const h = await threeHumans();
    await h.say(h.alice, { type: "choose_word", word: "avião" });
    await h.say(h.bob, { type: "guess_word", word: "aviao" });
    for (const c of [h.alice, h.bob, h.carol]) {
      expect(view(c)!.phase).toBe("round_end");
      expect(view(c)!.word).toBe("AVIÃO");
      expect(view(c)!.status).toBe("won");
    }
  });

  it("escolher: só o escolhedor, e palavra que presta; o erro vai só pra quem errou", async () => {
    const h = await threeHumans();
    await h.say(h.bob, { type: "choose_word", word: "gato" });
    expect(h.bob.sent.pop()).toEqual({ type: "error", error: "not_chooser" });
    expect(h.carol.sent.filter((m) => m.type === "error")).toEqual([]);
    await h.say(h.alice, { type: "choose_word", word: "gato 2" });
    expect(h.alice.sent.pop()).toEqual({ type: "error", error: "bad_word" });
    expect(view(h.alice)!.phase).toBe("choosing");
    await h.say(h.alice, { type: "choose_word", word: "gato" });
    expect(view(h.alice)!.phase).toBe("playing");
  });
});

describe("partida", () => {
  it("o escolhedor não chuta; chute válido vai pra todos; fora da vez é recusado só pra quem errou", async () => {
    const h = await threeHumans();
    await h.say(h.alice, { type: "choose_word", word: "xícara" });
    await h.say(h.alice, { type: "guess", letter: "A" });
    expect(h.alice.sent.pop()).toEqual({ type: "error", error: "not_your_turn" });
    await h.say(h.carol, { type: "guess", letter: "A" }); // a vez é do Bob
    expect(h.carol.sent.pop()).toEqual({ type: "error", error: "not_your_turn" });
    const before = view(h.bob)!.eventSeq;
    await h.say(h.bob, { type: "guess", letter: "A" });
    expect(view(h.bob)!.eventSeq).toBeGreaterThan(before);
    expect(view(h.carol)!.eventSeq).toBe(view(h.bob)!.eventSeq);
    expect(view(h.alice)!.guesses.map((g) => g.letter)).toEqual(["A"]);
    expect(view(h.carol)!.players[view(h.carol)!.turn].id).toBe("Carol");
  });

  it("o relógio do servidor vai junto: o prazo de escolher e o de chutar", async () => {
    const h = await threeHumans();
    const m = msg(h.alice)!;
    expect(typeof m.now).toBe("number");
    expect(m.state.turnDeadline - m.now).toBeLessThanOrEqual(TIMING.CHOOSE_MS);
    expect(m.state.turnDeadline).toBeGreaterThan(m.now);
    await h.say(h.alice, { type: "choose_word", word: "gato" });
    const p = msg(h.bob)!;
    expect(p.state.turnDeadline - p.now).toBeLessThanOrEqual(TIMING.TURN_MS);
    expect(p.state.turnDeadline).toBeGreaterThan(p.now);
  });

  it("sem ninguém conectado o servidor pausa; quem volta recebe o tempo inteiro de novo", async () => {
    vi.useFakeTimers();
    const h = await threeHumans();
    const ctl = ctlOf(h);
    h.drop(h.alice);
    h.drop(h.bob);
    h.drop(h.carol);
    const seq = ctl.state.eventSeq;
    vi.advanceTimersByTime(10 * TIMING.CHOOSE_MS);
    expect(ctl.state.eventSeq).toBe(seq); // pausado: ninguém foi pulado
    const back = await h.connect("Alice");
    await h.say(back, { type: "join", name: "Alice" });
    expect(ctl.state.phase).toBe("choosing");
    expect(ctl.state.roundNo).toBe(1);
    expect(ctl.state.turnDeadline).toBeGreaterThan(Date.now());
  });

  it("escolhedor que cai: a rodada é pulada e o próximo escolhe", async () => {
    vi.useFakeTimers();
    const h = await threeHumans();
    h.drop(h.alice);
    vi.advanceTimersByTime(TIMING.DISCONNECTED_MS + 100);
    expect(view(h.bob)!.roundNo).toBe(2);
    expect(view(h.bob)!.chooserId).toBe("Bob");
  });
});

describe("salas salvas por uma versão antiga", () => {
  it("formato antigo (palavra sorteada, bots) volta pro lobby em vez de quebrar", async () => {
    const old = { phase: "playing", players: [{ id: "x", name: "X", connected: true, score: 0, bot: "easy" }], round: { word: "GATO", category: "Animal" }, usedWords: ["GATO"] };
    const h = makeHarness(ForcaRoom, { storage: { state: old } });
    await h.server.onStart!();
    const alice = await h.connect("Alice");
    expect(view(alice)!.phase).toBe("lobby");
    expect(view(alice)!.players).toEqual([]);
  });

  it("estado salvo na versão atual é restaurado, com todo mundo desconectado até reentrar", async () => {
    const saved = createLobby();
    expect(saved.version).toBe(FORCA_VERSION);
    const h0 = await threeHumans();
    await h0.say(h0.alice, { type: "choose_word", word: "gato" });
    await vi.waitFor(() => expect((h0.store.get("state") as ForcaState).phase).toBe("playing"));
    const persisted = h0.store.get("state") as ForcaState;
    const h = makeHarness(ForcaRoom, { storage: { state: persisted } });
    await h.server.onStart!();
    const alice = await h.connect("Alice");
    expect(view(alice)!.phase).toBe("playing");
    expect(view(alice)!.word).toBe("GATO"); // é a escolhedora
    expect(view(alice)!.players.every((p) => !p.connected)).toBe(true);
  });
});

describe("fim de partida", () => {
  it("grava o histórico (prefixo FORCA:) com os pontos de cada um", async () => {
    const h = await threeHumans(1);
    await h.say(h.alice, { type: "choose_word", word: "gato" });
    await h.say(h.bob, { type: "guess_word", word: "gato" });
    expect(view(h.bob)!.phase).toBe("round_end");
    // a rodada fica na mesa e o jogo acaba sozinho
    vi.useFakeTimers();
    ctlOf(h).resume();
    vi.advanceTimersByTime(TIMING.ROUND_END_MS + TIMING.LETTER_SETTLE_MS + 50);
    vi.useRealTimers();
    expect(view(h.carol)!.phase).toBe("game_over");
    expect(view(h.carol)!.winnerId).toBe("Bob");
    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0]).toMatchObject({ room_id: "FORCA:ABCD", winner_name: "Bob" });
    expect(history[0].players_summary).toEqual([
      { name: "Bob", score: 70 },
      { name: "Alice", score: 0 },
      { name: "Carol", score: 0 },
    ]);
  });
});
