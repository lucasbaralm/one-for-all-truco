import { describe, expect, it } from "vitest";
import { manualClock, mulberry32 } from "@/lib/testing/clock";
import { ForcaController, nextAutoAction } from "./controller";
import { ForcaState, MAX_LIVES, createLobby, currentPlayer, guessLetter } from "./engine";
import { game, must } from "./testKit";
import { TIMING } from "./timing";

function setup(seed = 1) {
  const clock = manualClock();
  const changes: ForcaState[] = [];
  const kicked: string[] = [];
  const ctl = new ForcaController(createLobby(), {
    rng: mulberry32(seed),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: (s) => changes.push(s),
    onKick: (id) => kicked.push(id),
  });
  return { ctl, clock, changes, kicked };
}

/** Sala com Ana (host) + `bots` bots, partida iniciada. */
function started(bots: number, level: "easy" | "medium" | "hard" = "hard", seed = 1, rounds = 3) {
  const kit = setup(seed);
  kit.ctl.dispatch("ana", { type: "join", name: "Ana" });
  kit.ctl.dispatch("ana", { type: "set_rounds", rounds });
  for (let i = 0; i < bots; i++) kit.ctl.dispatch("ana", { type: "add_bot", level });
  kit.ctl.dispatch("ana", { type: "start" });
  return kit;
}

describe("permissões do lobby", () => {
  it("só o host mexe nos bots, nas palavras, expulsa e começa; começar precisa de 2", () => {
    const { ctl, kicked } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bob", { type: "join", name: "Bob" });
    expect(ctl.dispatch("bob", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "set_rounds", rounds: 8 })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "start" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_in_room" });
    ctl.dispatch("ana", { type: "kick", playerId: "bob" });
    expect(kicked).toEqual(["bob"]);
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana"]);
    expect(ctl.dispatch("ana", { type: "start" })).toEqual({ ok: false, error: "not_enough_players" });
  });

  it("host adiciona/remove bot e muda o nível; só remove bot no lobby", () => {
    const { ctl } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    expect(ctl.state.players[1].bot).toBe("easy");
    ctl.dispatch("ana", { type: "set_bot_level", botId: "bot:1", level: "hard" });
    expect(ctl.state.players[1].bot).toBe("hard");
    expect(ctl.dispatch("ana", { type: "remove_bot", botId: "ana" })).toEqual({ ok: false, error: "not_a_bot" });
    ctl.dispatch("ana", { type: "remove_bot", botId: "bot:1" });
    expect(ctl.state.players).toHaveLength(1);
  });
});

describe("mensagens de jogo", () => {
  it("valida o tipo dos campos antes de chegar nas regras", () => {
    const { ctl } = started(1);
    expect(ctl.dispatch("ana", { type: "guess", letter: 5 as never })).toEqual({ ok: false, error: "bad_letter" });
    expect(ctl.dispatch("ana", { type: "guess_word", word: null as never })).toEqual({ ok: false, error: "bad_word" });
    expect(ctl.dispatch("ana", { type: "bogus" } as never)).toEqual({ ok: false, error: "unknown_message" });
  });

  it("emoji não mexe no jogo", () => {
    const { ctl, changes } = started(1);
    const n = changes.length;
    expect(ctl.dispatch("ana", { type: "emoji", emoji: "😀" })).toMatchObject({ ok: true });
    expect(changes).toHaveLength(n);
  });

  it("a primeira vez só começa a contar depois da apresentação da palavra", () => {
    const { ctl, clock } = started(1);
    expect(ctl.state.turnDeadline).toBe(clock.now() + TIMING.INTRO_MS + TIMING.TURN_MS);
  });
});

describe("bots jogam sozinhos", () => {
  it("quando é a vez do bot, ele chuta depois do tempo de pensar; humano nunca é forçado antes do tempo", () => {
    const { ctl, clock } = started(1);
    // a vez inicial é da Ana (humana): nada acontece sozinho até o tempo estourar
    expect(currentPlayer(ctl.state)!.id).toBe("ana");
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.TURN_MS - 1000);
    expect(ctl.state.eventSeq).toBe(seq);
    // Ana erra de propósito → passa pro bot
    const wrong = [..."ZXKWYJQ"].find((l) => !ctl.state.round!.norm.includes(l))!;
    ctl.dispatch("ana", { type: "guess", letter: wrong });
    expect(currentPlayer(ctl.state)!.id).toBe("bot:1");
    const after = ctl.state.eventSeq;
    clock.advance(TIMING.LETTER_SETTLE_MS + TIMING.BOT_THINK_MAX_MS + 10);
    expect(ctl.state.eventSeq).toBeGreaterThan(after);
    expect(ctl.state.round!.guesses.some((g) => g.by === "bot:1")).toBe(true);
  });

  it("um jogo só de bots + um humano parado termina sozinho, rodada por rodada", () => {
    const { ctl, clock } = started(2, "hard", 4, 3);
    expect(clock.runAll(20000)).toBe(true);
    expect(ctl.state.phase).toBe("game_over");
    expect(ctl.state.standings).toHaveLength(3);
    expect(ctl.state.roundNo).toBe(3);
  });
});

describe("tempo da vez (humano)", () => {
  it("estourou: o servidor chuta uma letra por ele e a vez segue; o chute é marcado como automático", () => {
    const { ctl, clock } = started(1);
    clock.advance(TIMING.INTRO_MS + TIMING.TURN_MS + 5);
    const g = ctl.state.round!.guesses[0];
    expect(g).toBeDefined();
    expect(g.by).toBe("ana");
    expect(g.auto).toBe(true);
  });

  it("jogar a tempo cancela o chute automático", () => {
    const { ctl, clock } = started(1);
    clock.advance(TIMING.INTRO_MS + 2000);
    const letter = [..."ZXKWYJQ"].find((l) => !ctl.state.round!.norm.includes(l))!;
    ctl.dispatch("ana", { type: "guess", letter });
    // passa pro bot; mesmo depois de muito tempo, nada vem com o "auto" da Ana
    clock.advance(TIMING.LETTER_SETTLE_MS + TIMING.BOT_THINK_MAX_MS + 5);
    expect(ctl.state.round!.guesses.filter((g) => g.by === "ana" && g.auto)).toHaveLength(0);
  });
});

describe("humano desconectado", () => {
  it("um bot joga por ele depois de um tempinho; ao voltar ele retoma a vez", () => {
    const { ctl, clock } = started(1);
    ctl.setConnected("ana", false);
    clock.advance(TIMING.DISCONNECTED_MS + 50);
    expect(ctl.state.round!.guesses.filter((g) => g.by === "ana").length).toBeGreaterThan(0);
    ctl.setConnected("ana", true);
    expect(ctl.state.players[0].connected).toBe(true);
  });
});

describe("palavra seguinte", () => {
  it("rodada acabou: a palavra fica na mesa um tempo e a próxima entra sozinha", () => {
    const { ctl, clock } = started(1);
    // põe uma palavra a 1 letra de ser completada e a vez na Ana
    const s = game({ word: "GATO", guessed: ["G", "A", "T"], players: ["ana", "bot:1"], rounds: 3 });
    ctl.state = { ...s, hostId: "ana", players: s.players.map((p) => (p.id === "bot:1" ? { ...p, bot: "hard" as const } : p)) };
    ctl.dispatch("ana", { type: "guess", letter: "O" });
    expect(ctl.state.phase).toBe("round_end");
    clock.advance(TIMING.LETTER_SETTLE_MS + TIMING.ROUND_END_MS - 100);
    expect(ctl.state.phase).toBe("round_end");
    clock.advance(200);
    expect(ctl.state.phase).toBe("playing");
    expect(ctl.state.roundNo).toBe(2);
  });
});

describe("pausa", () => {
  it("pausado nada anda sozinho; ao despausar o jogo retoma", () => {
    const { ctl, clock } = started(1);
    const letter = [..."ZXKWYJQ"].find((l) => !ctl.state.round!.norm.includes(l))!;
    ctl.dispatch("ana", { type: "guess", letter }); // vez do bot
    ctl.setPaused(true);
    const seq = ctl.state.eventSeq;
    clock.advance(120_000);
    expect(ctl.state.eventSeq).toBe(seq);
    ctl.setPaused(false);
    clock.advance(TIMING.BOT_THINK_MAX_MS + 10);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
  });
});

describe("nextAutoAction", () => {
  it("lobby e fim de jogo não têm ação automática", () => {
    expect(nextAutoAction(createLobby(), Math.random, 0)).toBeNull();
    expect(nextAutoAction({ ...game({ word: "GATO" }), phase: "game_over" }, Math.random, 0)).toBeNull();
  });

  it("humano conectado: espera até o fim do tempo; depois do prazo a espera é zero", () => {
    const s = game({ word: "GATO", now: 1000 });
    expect(nextAutoAction(s, Math.random, 1000)).toMatchObject({ actorId: "a", message: { type: "timeout" }, delayMs: TIMING.TURN_MS });
    expect(nextAutoAction(s, Math.random, 1000 + TIMING.TURN_MS + 7)!.delayMs).toBe(0);
  });

  it("rodada parada agenda o avanço", () => {
    const end = must(guessLetter(game({ word: "GATO", guessed: ["G", "A", "T"] }), "a", "O", 0)).state;
    expect(nextAutoAction(end, Math.random, 0)).toMatchObject({ message: { type: "advance" }, delayMs: TIMING.ROUND_END_MS });
  });
});

describe("início da rodada", () => {
  it("a mesa começa com todas as vidas", () => {
    const { ctl } = started(1);
    expect(ctl.state.round!.lives).toBe(MAX_LIVES);
  });
});
