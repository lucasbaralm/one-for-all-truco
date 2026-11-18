import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BancoRoom, MonopolyRoom } from "./monopoly";
import type { RoomHandler, RoomPort } from "./room-types";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import type { MonoController } from "../src/lib/monopoly/controller";
import { MonoState, MonoView, STATE_VERSION, createLobby } from "../src/lib/monopoly/engine";
import { TIMING } from "../src/lib/monopoly/timing";

// Os dois room servers do jogo de compra e venda de propriedades de ponta a ponta com conexões de
// mentira: o que importa aqui é o que a base não cobre — cada jogador recebe a SUA visão (as próprias
// ações possíveis), a ordem dos baralhos nunca sai do servidor e Monopoly e Banco Imobiliário são
// salas diferentes (edição, dinheiro, prefixo do histórico).

let history: { room_id: string; winner_name: string; players_summary: { name: string; score: number }[] }[] = [];

beforeEach(() => {
  history = [];
  stubSupabase(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Room = new (room: RoomPort) => RoomHandler;
const ROOMS: [string, Room, string, number][] = [
  ["Monopoly", MonopolyRoom, "monopoly", 1500],
  ["Banco Imobiliário", BancoRoom, "banco", 2500],
];

const view = (c: FakeConn) => c.last<{ type: string; state: MonoView }>("state")?.state;
const ctlOf = (h: ReturnType<typeof makeHarness>) => (h.server as unknown as { controller: MonoController }).controller;

/** Alice (host) + Bob, partida iniciada com a vez de Alice. */
async function twoHumans(RoomClass: Room = MonopolyRoom) {
  const h = makeHarness(RoomClass);
  const alice = await h.connect("Alice");
  const bob = await h.connect("Bob");
  await h.say(alice, { type: "join", name: "x" });
  await h.say(bob, { type: "join", name: "Bob" });
  await h.say(alice, { type: "start" });
  const ctl = ctlOf(h);
  ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.id === "Alice") };
  ctl.setConnected("Alice", true); // só pra o servidor transmitir de novo o estado (agora com a vez dela)
  return { ...h, alice, bob, ctl };
}

describe.each(ROOMS)("%s: autenticação (a mesma da base dos jogos)", (_name, RoomClass) => {
  it("recusa token que não bate (4001) e avisa quando o Supabase está fora (4002)", async () => {
    const { connect } = makeHarness(RoomClass);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "unauthorized"]]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4002, "auth_unavailable"]]);
  });
});

describe.each(ROOMS)("%s: sala", (_name, RoomClass, edition) => {
  it("o nome vem da identidade verificada; host adiciona bot e inicia; só o host", async () => {
    const h = makeHarness(RoomClass);
    const alice = await h.connect("Alice");
    const bob = await h.connect("Bob");
    await h.say(alice, { type: "join", name: "Rei do Monopólio" });
    await h.say(bob, { type: "join", name: "Bob" });
    expect(view(alice)!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(view(alice)!.edition).toBe(edition);
    await h.say(bob, { type: "start" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(bob, { type: "add_bot", level: "hard" });
    expect(bob.sent.pop()).toEqual({ type: "error", error: "not_host" });
    await h.say(alice, { type: "add_bot", level: "hard" });
    expect(view(bob)!.players).toHaveLength(3);
    await h.say(alice, { type: "set_limit", limit: 20 });
    expect(view(bob)!.settings.limit).toBe(20);
    await h.say(alice, { type: "start" });
    expect(view(bob)!.phase).toBe("playing");
    expect(view(bob)!.gameNumber).toBe(1);
  });

  it("começa com o dinheiro da edição", async () => {
    const h = await twoHumans(RoomClass);
    expect(view(h.alice)!.edition).toBe(edition);
    expect(view(h.alice)!.players.every((p) => p.cash === ROOMS.find((r) => r[2] === edition)![3])).toBe(true);
  });
});

describe("cada jogador recebe só a própria visão", () => {
  it("`me` é diferente pra cada um e nenhuma mensagem leva a ordem dos baralhos", async () => {
    const h = await twoHumans();
    await h.say(h.alice, { type: "roll" });
    const va = view(h.alice)!;
    const vb = view(h.bob)!;
    expect(va.me.resign).toBe(true);
    expect(vb.me.resign).toBe(true);
    // depois de rolar, só Alice tem o que decidir (rolar de novo, comprar, encerrar...); Bob só espera
    const decides = (me: MonoView["me"]) => me.roll || me.buy || me.decline || me.endTurn || me.payDebt || me.bankrupt;
    expect(decides(va.me)).toBe(true);
    expect(decides(vb.me)).toBe(false);
    for (const c of [h.alice, h.bob]) {
      for (const msg of c.sent.filter((m) => m.type === "state")) {
        const raw = JSON.stringify(msg);
        expect(raw).not.toContain('"decks"');
        expect(Object.keys((msg as unknown as { state: object }).state)).not.toContain("decks");
      }
    }
  });

  it("antes de rolar, só quem tem a vez pode rolar (visão da própria pessoa)", async () => {
    const h = await twoHumans();
    expect(view(h.alice)!.me.roll).toBe(true);
    expect(view(h.bob)!.me.roll).toBe(false);
    expect(view(h.alice)!.players.find((p) => p.id === "Alice")).toBeDefined();
  });

  it("espectador (sem assento) recebe uma visão sem ações e continua recebendo as atualizações", async () => {
    const h = await twoHumans();
    const carol = await h.connect("Carol");
    await h.say(carol, { type: "join", name: "Carol" }); // partida em andamento: vira espectadora
    expect(carol.sent.pop()).toEqual({ type: "error", error: "game_in_progress" });
    expect(view(carol)!.me).toMatchObject({ roll: false, resign: false, bid: false, build: [] });
    const before = view(carol)!.eventSeq;
    await h.say(h.alice, { type: "roll" });
    expect(view(carol)!.eventSeq).toBeGreaterThan(before);
    expect(view(carol)!.me.resign).toBe(false);
  });

  it("o estado completo (com os baralhos) vai pro storage, nunca pro cliente", async () => {
    const h = await twoHumans();
    await vi.waitFor(() => expect((h.store.get("state") as MonoState).decks.chance.length).toBeGreaterThan(0));
    expect((h.store.get("state") as MonoState).decks.chest.length).toBeGreaterThan(0);
  });
});

describe("partida", () => {
  it("ninguém age fora da vez; a ação válida é aplicada e transmitida pra todos", async () => {
    const h = await twoHumans();
    await h.say(h.bob, { type: "roll" });
    expect(h.bob.sent.pop()).toEqual({ type: "error", error: "not_your_turn" });
    await h.say(h.bob, { type: "end_turn" });
    expect(h.bob.sent.pop()).toEqual({ type: "error", error: "not_your_turn" });
    const before = view(h.alice)!.eventSeq;
    await h.say(h.alice, { type: "roll" });
    expect(view(h.alice)!.eventSeq).toBe(before + 1);
    expect(view(h.bob)!.eventSeq).toBe(before + 1);
    expect(view(h.bob)!.dice).toEqual(view(h.alice)!.dice);
    expect(view(h.bob)!.events[0]).toMatchObject({ t: "roll", p: "Alice" });
  });

  it("contra bot: o bot joga sozinho; sem ninguém conectado o servidor pausa", async () => {
    vi.useFakeTimers();
    const h = makeHarness(MonopolyRoom);
    const alice = await h.connect("Alice");
    await h.say(alice, { type: "join", name: "Alice" });
    await h.say(alice, { type: "add_bot", level: "hard" });
    await h.say(alice, { type: "start" });
    // põe a vez no bot pra não depender do sorteio
    const ctl = ctlOf(h);
    ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.bot) };
    ctl.resume();
    const seq = ctl.state.eventSeq;
    vi.advanceTimersByTime(TIMING.BOT_ROLL_MS + 100);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
    h.drop(alice);
    const frozen = ctl.state.eventSeq;
    vi.advanceTimersByTime(60_000);
    expect(ctl.state.eventSeq).toBe(frozen);
  });

  it("desistir tira a pessoa da partida e todos veem (sobrou só a Alice: ela vence)", async () => {
    const h = await twoHumans();
    await h.say(h.bob, { type: "resign" });
    expect(view(h.bob)!.phase).toBe("game_over");
    expect(view(h.alice)!.winnerId).toBe("Alice");
    expect(view(h.alice)!.standings!.map((s) => s.name)).toEqual(["Alice", "Bob"]);
  });
});

describe.each(ROOMS)("%s: fim de partida", (_name, RoomClass, edition, startCash) => {
  it("grava o histórico com o prefixo da sala e o patrimônio de cada um", async () => {
    const h = await twoHumans(RoomClass);
    await h.say(h.bob, { type: "resign" });
    expect(view(h.alice)!.phase).toBe("game_over");
    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0]).toMatchObject({ room_id: `${edition === "banco" ? "BANCO" : "MONOPOLY"}:ABCD`, winner_name: "Alice" });
    expect(history[0].players_summary).toEqual([
      { name: "Alice", score: startCash },
      { name: "Bob", score: 0 },
    ]);
  });

  it("a revanche volta pro lobby sem gravar o histórico de novo", async () => {
    const h = await twoHumans(RoomClass);
    await h.say(h.bob, { type: "resign" });
    await vi.waitFor(() => expect(history).toHaveLength(1));
    await h.say(h.alice, { type: "rematch" });
    expect(view(h.alice)!.phase).toBe("lobby");
    expect(history).toHaveLength(1);
  });
});

describe.each(ROOMS)("%s: estado salvo", (_name, RoomClass, edition) => {
  it("volta do storage com todos os humanos desconectados (bots continuam)", async () => {
    const live = makeHarness(RoomClass);
    const alice = await live.connect("Alice");
    await live.say(alice, { type: "join", name: "Alice" });
    await live.say(alice, { type: "add_bot", level: "easy" });
    await live.say(alice, { type: "start" });
    const saved = JSON.parse(JSON.stringify(ctlOf(live).state)) as MonoState;
    expect(saved.phase).toBe("playing");
    const restored = makeHarness(RoomClass, { storage: { state: saved } });
    await restored.server.onStart!();
    const s = ctlOf(restored).state;
    expect(s.phase).toBe("playing");
    expect(s.edition).toBe(edition);
    expect(s.players.filter((p) => !p.bot).every((p) => !p.connected)).toBe(true);
    expect(s.players.filter((p) => p.bot).every((p) => p.connected)).toBe(true);
    expect(s.decks.chance.length + s.decks.chest.length).toBeGreaterThan(0); // o baralho volta inteiro
  });

  it("estado de outra versão ou de outra edição vira um lobby limpo", async () => {
    const live = await twoHumans(RoomClass);
    const saved = JSON.parse(JSON.stringify(live.ctl.state)) as MonoState;
    const wrongVersion = makeHarness(RoomClass, { storage: { state: { ...saved, version: STATE_VERSION + 1 } } });
    await wrongVersion.server.onStart!();
    expect(ctlOf(wrongVersion).state).toEqual(createLobby(edition as "monopoly" | "banco"));
    const other = edition === "banco" ? "monopoly" : "banco";
    const wrongEdition = makeHarness(RoomClass, { storage: { state: { ...saved, edition: other } } });
    await wrongEdition.server.onStart!();
    expect(ctlOf(wrongEdition).state).toEqual(createLobby(edition as "monopoly" | "banco"));
  });
});

describe("Monopoly e Banco Imobiliário são salas diferentes", () => {
  it("edição, dinheiro e prefixo do histórico próprios; a variável de velocidade do Banco cai na do Monopoly", async () => {
    const mono = await twoHumans(MonopolyRoom);
    const banco = await twoHumans(BancoRoom);
    expect(mono.ctl.state.edition).toBe("monopoly");
    expect(banco.ctl.state.edition).toBe("banco");
    expect(mono.ctl.state.players[0].cash).toBe(1500);
    expect(banco.ctl.state.players[0].cash).toBe(2500);
    await mono.say(mono.bob, { type: "resign" });
    await banco.say(banco.bob, { type: "resign" });
    await vi.waitFor(() => expect(history).toHaveLength(2));
    expect(history.map((r) => r.room_id).sort()).toEqual(["BANCO:ABCD", "MONOPOLY:ABCD"]);
  });

  it("MONOPOLY_SPEED acelera os bots do Monopoly; o Banco lê BANCO_SPEED e, sem ele, MONOPOLY_SPEED", async () => {
    vi.useFakeTimers();
    const botTurn = async (RoomClass: Room, env: Record<string, string>) => {
      const h = makeHarness(RoomClass, { env });
      const alice = await h.connect("Alice");
      await h.say(alice, { type: "join", name: "Alice" });
      await h.say(alice, { type: "add_bot", level: "hard" });
      await h.say(alice, { type: "start" });
      const ctl = ctlOf(h);
      ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.bot) };
      ctl.resume();
      return ctl;
    };
    // a rolagem do bot leva BOT_ROLL_MS (900 ms); a 20× leva 45 ms
    for (const [RoomClass, env] of [
      [MonopolyRoom, { MONOPOLY_SPEED: "20" }],
      [BancoRoom, { BANCO_SPEED: "20" }],
      [BancoRoom, { MONOPOLY_SPEED: "20" }],
    ] as [Room, Record<string, string>][]) {
      const ctl = await botTurn(RoomClass, env);
      const seq = ctl.state.eventSeq;
      vi.advanceTimersByTime(100);
      expect(ctl.state.eventSeq, JSON.stringify(env)).toBeGreaterThan(seq);
    }
    // sem a variável, 100 ms não bastam
    const slow = await botTurn(BancoRoom, {});
    const seq = slow.state.eventSeq;
    vi.advanceTimersByTime(100);
    expect(slow.state.eventSeq).toBe(seq);
    // BANCO_SPEED vence MONOPOLY_SPEED no Banco
    const mixed = await botTurn(BancoRoom, { BANCO_SPEED: "1", MONOPOLY_SPEED: "50" });
    const s2 = mixed.state.eventSeq;
    vi.advanceTimersByTime(100);
    expect(mixed.state.eventSeq).toBe(s2);
  });
});
