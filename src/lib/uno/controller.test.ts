import { describe, expect, it } from "vitest";
import { manualClock, mulberry32 } from "@/lib/testing/clock";
import { UnoController, catchActions, nextAutoAction, settleMs } from "./controller";
import { UnoState, createLobby } from "./engine";
import { TIMING } from "./timing";
import { find, game, must } from "./testKit";

const R5 = find("red", "number", 5);
const R9 = find("red", "number", 9);
const B7 = find("blue", "number", 7);
const G3 = find("green", "number", 3);
const Y2 = find("yellow", "number", 2);

function setup(seed = 1) {
  const clock = manualClock();
  const changes: UnoState[] = [];
  const kicked: string[] = [];
  const ctl = new UnoController(createLobby(), {
    rng: mulberry32(seed),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: (s) => changes.push(s),
    onKick: (id) => kicked.push(id),
  });
  return { ctl, clock, changes, kicked };
}

/** Sala com Ana (host) + `bots` bots, partida iniciada. */
function started(bots: number, level: "easy" | "medium" | "hard" = "hard", seed = 1) {
  const kit = setup(seed);
  kit.ctl.dispatch("ana", { type: "join", name: "Ana" });
  for (let i = 0; i < bots; i++) kit.ctl.dispatch("ana", { type: "add_bot", level });
  kit.ctl.dispatch("ana", { type: "start" });
  return kit;
}

describe("permissões do lobby", () => {
  it("só o host mexe nos bots, expulsa e começa; começar precisa de 2", () => {
    const { ctl, kicked } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bob", { type: "join", name: "Bob" });
    expect(ctl.dispatch("bob", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "start" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_in_room" });
    ctl.dispatch("ana", { type: "kick", playerId: "bob" });
    expect(kicked).toEqual(["bob"]);
    expect(ctl.dispatch("ana", { type: "start" })).toEqual({ ok: false, error: "not_enough_players" });
  });

  it("host adiciona/remove bot e muda o nível", () => {
    const { ctl } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    expect(ctl.state.players[1].bot).toBe("easy");
    ctl.dispatch("ana", { type: "set_bot_level", botId: "bot:1", level: "hard" });
    expect(ctl.state.players[1].bot).toBe("hard");
    ctl.dispatch("ana", { type: "remove_bot", botId: "bot:1" });
    expect(ctl.state.players).toHaveLength(1);
    expect(ctl.dispatch("ana", { type: "remove_bot", botId: "ana" })).toEqual({ ok: false, error: "not_a_bot" });
  });
});

describe("mensagens de jogo", () => {
  it("valida carta e cor antes de chegar nas regras", () => {
    const { ctl } = started(1);
    expect(ctl.dispatch("ana", { type: "play", card: 1.5, color: undefined })).toEqual({ ok: false, error: "bad_card" });
    expect(ctl.dispatch("ana", { type: "play", card: 3, color: "purple" as never })).toEqual({ ok: false, error: "bad_color" });
    expect(ctl.dispatch("ana", { type: "bogus" } as never)).toEqual({ ok: false, error: "unknown_message" });
  });

  it("fora da vez: recusado; emoji não muda nada", () => {
    const { ctl, changes } = started(1);
    const before = changes.length;
    const notTurn = ctl.state.players[ctl.state.turn].id === "ana" ? "bot:1" : "ana";
    expect(ctl.dispatch(notTurn, { type: "draw" })).toEqual({ ok: false, error: "not_your_turn" });
    expect(ctl.dispatch("ana", { type: "emoji", emoji: "😂" }).ok).toBe(true);
    expect(changes.length).toBe(before);
  });
});

describe("bots", () => {
  it("o bot joga sozinho depois do tempo de 'pensar'", () => {
    const { ctl, clock } = setup(5);
    const base = game({ hands: { a: [R9, B7], b: [G3, Y2, find("red", "number", 2)] }, top: R5, turn: 1 });
    ctl.state = { ...base, hostId: "a", players: base.players.map((p) => (p.id === "b" ? { ...p, bot: "hard" as const } : p)) };
    ctl.resume();
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.BOT_THINK_MIN_MS - 1);
    expect(ctl.state.eventSeq).toBe(seq); // ainda pensando
    clock.advance(TIMING.BOT_THINK_MAX_MS);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
  });

  it("o humano da vez espera: nada acontece sem ele, por mais que passe tempo", () => {
    const { ctl, clock } = setup(5);
    const base = game({ hands: { a: [R9, B7], b: [G3, Y2] }, top: R5, turn: 0 });
    ctl.state = { ...base, hostId: "a" };
    ctl.resume();
    const seq = ctl.state.eventSeq;
    clock.advance(10 * 60_000);
    expect(ctl.state.eventSeq).toBe(seq);
    expect(clock.pending()).toBe(0);
  });

  it("partida só de bots/ausentes vai até o fim com o relógio manual (toda ação é aceita)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { ctl, clock } = started(3, "medium", seed);
      ctl.setConnected("ana", false); // ninguém humano: o servidor joga por todos
      expect(clock.runAll(200_000)).toBe(true);
      expect(ctl.state.phase).toBe("game_over");
      expect(ctl.state.standings![0].playerId).toBe(ctl.state.winnerId);
      expect(ctl.state.standings![0].cards).toBe(0);
    }
  });

  it("pausa: nada acontece; despausar retoma", () => {
    const { ctl, clock } = started(2, "hard", 3);
    ctl.setConnected("ana", false);
    ctl.setPaused(true);
    const seq = ctl.state.eventSeq;
    clock.advance(120_000);
    expect(ctl.state.eventSeq).toBe(seq);
    ctl.setPaused(false);
    clock.advance(30_000);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
  });
});

describe("humano desconectado", () => {
  it("só depois de DISCONNECTED_MS um bot joga por ele", () => {
    const kit = setup(4);
    const { ctl, clock } = kit;
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bob", { type: "join", name: "Bob" });
    ctl.dispatch("ana", { type: "start" });
    clock.advance(TIMING.INTRO_MS + 10);
    const who = ctl.state.players[ctl.state.turn].id;
    ctl.setConnected(who, false);
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.DISCONNECTED_MS - 100);
    expect(ctl.state.eventSeq).toBe(seq);
    clock.advance(TIMING.DISCONNECTED_MS + 1000);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
  });
});

describe("pegar quem esqueceu o UNO", () => {
  /** a (humano) tem [R9, B7]; b (humano) é o próximo; c é bot do nível dado. */
  function exposedRoom(level: "easy" | "medium" | "hard") {
    const { ctl, clock } = setup(9);
    const base = game({ hands: { a: [R9, B7], b: [find("red", "number", 1), Y2], c: [G3, find("red", "number", 2)] }, top: R5 });
    ctl.state = { ...base, players: base.players.map((p) => (p.id === "c" ? { ...p, bot: level } : p)), hostId: "a" };
    ctl.resume();
    expect(ctl.dispatch("a", { type: "play", card: R9 }).ok).toBe(true);
    expect(ctl.state.exposed).toBe("a");
    return { ctl, clock };
  }

  it("bot difícil pega o humano exposto (o próximo humano demora)", () => {
    const { ctl, clock } = exposedRoom("hard");
    clock.advance(3000);
    expect(ctl.state.exposed).toBeNull();
    expect(ctl.state.players[0].hand).toHaveLength(3);
    expect(ctl.state.events.map((e) => e.t)).toContain("catch");
    expect(ctl.state.stats!.c.caught).toBe(1);
  });

  it("bot fácil nunca pega", () => {
    const { ctl, clock } = exposedRoom("easy");
    clock.advance(60_000);
    expect(ctl.state.exposed).toBe("a");
    expect(ctl.state.players[0].hand).toHaveLength(1);
  });

  it("se o próximo a jogar é um bot, ele joga ANTES da reação do pegador: o humano escapa", () => {
    const { ctl, clock } = setup(11);
    const base = game({ hands: { a: [R9, B7], b: [find("red", "number", 1), Y2, G3], c: [find("red", "number", 2), find("green", "number", 5), find("blue", "number", 1)] }, top: R5 });
    ctl.state = { ...base, players: base.players.map((p) => (p.id === "b" ? { ...p, bot: "hard" as const } : p.id === "c" ? { ...p, bot: "hard" as const } : p)), hostId: "a" };
    ctl.resume();
    ctl.dispatch("a", { type: "play", card: R9 });
    expect(ctl.state.exposed).toBe("a");
    clock.advance(TIMING.PLAY_SETTLE_MS + TIMING.BOT_THINK_MAX_MS + 10);
    expect(ctl.state.exposed).not.toBe("a"); // b já jogou: acabou a chance
    expect(ctl.state.players[0].hand).toHaveLength(1);
  });

  it("catchActions: só bots que têm reação, nunca o próprio exposto", () => {
    const base = game({ hands: { a: [R9], b: [Y2, G3], c: [find("red", "number", 2), B7] }, top: R5 });
    const withBots = {
      ...base,
      exposed: "c",
      players: base.players.map((p) => (p.id === "a" ? { ...p, bot: "hard" as const } : p.id === "b" ? { ...p, bot: "easy" as const } : p.id === "c" ? { ...p, bot: "medium" as const } : p)),
    };
    const acts = catchActions(withBots, mulberry32(1));
    expect(acts.map((a) => a.actorId)).toEqual(["a"]); // b é fácil (não pega), c é o exposto
    expect(acts[0].message).toEqual({ type: "catch" });
    expect(catchActions({ ...withBots, exposed: null }, mulberry32(1))).toEqual([]);
  });
});

describe("nextAutoAction / settleMs", () => {
  it("humano conectado: nada; bot: jogada com atraso; humano desconectado: bot médio com atraso fixo", () => {
    const base = game({ hands: { a: [R9, B7], b: [Y2, G3] }, top: R5 });
    expect(nextAutoAction(base, mulberry32(1))).toBeNull();
    const bot = { ...base, players: base.players.map((p) => (p.id === "a" ? { ...p, bot: "hard" as const } : p)) };
    const a = nextAutoAction(bot, mulberry32(1))!;
    expect(a.actorId).toBe("a");
    expect(a.delayMs).toBeGreaterThanOrEqual(TIMING.BOT_THINK_MIN_MS);
    expect(a.delayMs).toBeLessThanOrEqual(TIMING.BOT_THINK_MAX_MS);
    const away = { ...base, players: base.players.map((p) => (p.id === "a" ? { ...p, connected: false } : p)) };
    expect(nextAutoAction(away, mulberry32(1))!.delayMs).toBe(TIMING.DISCONNECTED_MS);
    expect(nextAutoAction({ ...base, phase: "lobby" }, mulberry32(1))).toBeNull();
  });

  it("tempo de animação cresce com jogada e compra (castigo pesa mais)", () => {
    expect(settleMs([])).toBe(0);
    expect(settleMs([{ t: "play", p: "a", card: 0, color: "red" }])).toBe(TIMING.PLAY_SETTLE_MS);
    expect(settleMs([{ t: "draw", p: "a", n: 1 }])).toBe(TIMING.DRAW_SETTLE_MS);
    expect(settleMs([{ t: "draw", p: "a", n: 2, penalty: true }])).toBeGreaterThan(TIMING.DRAW_SETTLE_MS);
  });
});

describe("revanche e saída", () => {
  it("revanche só depois do fim, por quem jogou; sair no lobby tira da sala", () => {
    const { ctl } = started(1);
    expect(ctl.dispatch("ana", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    ctl.state = { ...ctl.state, phase: "game_over" };
    expect(ctl.dispatch("zed", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    expect(must(ctl.dispatch("ana", { type: "rematch" })).state.phase).toBe("lobby");
    ctl.dispatch("ana", { type: "leave" });
    expect(ctl.state.players.map((p) => p.id)).toEqual(["bot:1"]);
  });
});
