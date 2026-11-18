import { describe, expect, it } from "vitest";
import { manualClock, mulberry32 } from "@/lib/testing/clock";
import { ForcaController, nextAutoAction } from "./controller";
import { ForcaState, MAX_LIVES, createLobby, currentPlayer } from "./engine";
import { choosing, game } from "./testKit";
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

/** Sala com `names` (o 1º é o host e escolhe a 1ª palavra), na fase de escolha. */
function started(names = ["ana", "bia", "caio"], rounds = 3) {
  const kit = setup();
  for (const n of names) kit.ctl.dispatch(n, { type: "join", name: n.toUpperCase() });
  kit.ctl.dispatch(names[0], { type: "set_rounds", rounds });
  kit.ctl.dispatch(names[0], { type: "start" });
  return kit;
}

/** Igual a `started`, mas a ana já escolheu a palavra (padrão: GATO) e a vez é da bia. */
function playing(word = "GATO", names = ["ana", "bia", "caio"], rounds = 3) {
  const kit = started(names, rounds);
  kit.ctl.dispatch(names[0], { type: "choose_word", word });
  return kit;
}

describe("permissões do lobby", () => {
  it("só o host mexe nas palavras, expulsa e começa; começar precisa de 2", () => {
    const { ctl, kicked } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bia", { type: "join", name: "Bia" });
    expect(ctl.dispatch("bia", { type: "set_rounds", rounds: 5 })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bia", { type: "start" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bia", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_in_room" });
    expect(ctl.dispatch("ana", { type: "set_rounds", rounds: 9 })).toEqual({ ok: false, error: "bad_rounds" });
    ctl.dispatch("ana", { type: "kick", playerId: "bia" });
    expect(kicked).toEqual(["bia"]);
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana"]);
    expect(ctl.dispatch("ana", { type: "start" })).toEqual({ ok: false, error: "not_enough_players" });
  });

  it("a sala tem no máximo 4 pessoas", () => {
    const { ctl } = setup();
    for (const n of ["a", "b", "c", "d"]) expect(ctl.dispatch(n, { type: "join", name: n }).ok).toBe(true);
    expect(ctl.dispatch("e", { type: "join", name: "e" })).toEqual({ ok: false, error: "room_full" });
  });

  it("sala que acabou e ficou vazia recomeça no lobby pra quem chega depois", () => {
    const { ctl } = started(["ana", "bia"], 1);
    ctl.state = { ...ctl.state, phase: "game_over", players: ctl.state.players.map((p) => ({ ...p, connected: false })) };
    expect(ctl.dispatch("novo", { type: "join", name: "Novo" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("lobby");
    expect(ctl.state.players.map((p) => p.id)).toEqual(["novo"]);
  });
});

describe("mensagens de jogo", () => {
  it("valida o tipo dos campos antes de chegar nas regras", () => {
    const { ctl } = playing();
    expect(ctl.dispatch("bia", { type: "guess", letter: 5 as never })).toEqual({ ok: false, error: "bad_letter" });
    expect(ctl.dispatch("bia", { type: "guess_word", word: null as never })).toEqual({ ok: false, error: "bad_word" });
    expect(ctl.dispatch("ana", { type: "choose_word", word: 7 as never })).toEqual({ ok: false, error: "bad_word" });
    expect(ctl.dispatch("bia", { type: "bogus" } as never)).toEqual({ ok: false, error: "unknown_message" });
  });

  it("emoji não mexe no jogo", () => {
    const { ctl, changes } = playing();
    const n = changes.length;
    expect(ctl.dispatch("ana", { type: "emoji", emoji: "😀" })).toMatchObject({ ok: true });
    expect(changes).toHaveLength(n);
  });

  it("escolher a palavra: só o escolhedor; depois dela a rodada começa na vez da bia", () => {
    const { ctl } = started();
    expect(ctl.state.phase).toBe("choosing");
    expect(ctl.dispatch("bia", { type: "choose_word", word: "gato" })).toEqual({ ok: false, error: "not_chooser" });
    expect(ctl.dispatch("ana", { type: "choose_word", word: "gato!" })).toEqual({ ok: false, error: "bad_word" });
    expect(ctl.dispatch("ana", { type: "choose_word", word: "gato" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("playing");
    expect(ctl.state.round!.word).toBe("GATO");
    expect(currentPlayer(ctl.state)!.id).toBe("bia");
    // o escolhedor não chuta
    expect(ctl.dispatch("ana", { type: "guess", letter: "A" })).toEqual({ ok: false, error: "not_your_turn" });
    expect(ctl.dispatch("bia", { type: "guess", letter: "A" }).ok).toBe(true);
  });
});

describe("tempo de escolher a palavra", () => {
  it("passou do prazo: a rodada é pulada e o próximo escolhe", () => {
    const { ctl, clock } = started();
    clock.advance(TIMING.CHOOSE_MS - 1000);
    expect(ctl.state.roundNo).toBe(1);
    clock.advance(1100);
    expect(ctl.state.roundNo).toBe(2);
    expect(ctl.state.phase).toBe("choosing");
    expect(ctl.state.chooserId).toBe("bia");
    expect(ctl.state.events[0]).toEqual({ t: "skipped", p: "ana" });
  });

  it("escolher a tempo cancela o pulo", () => {
    const { ctl, clock } = started();
    clock.advance(5000);
    ctl.dispatch("ana", { type: "choose_word", word: "gato" });
    clock.advance(TIMING.CHOOSE_MS); // passaria do prazo da escolha — mas já escolheu
    expect(ctl.state.roundNo).toBe(1);
    expect(ctl.state.phase).toBe("playing");
  });

  it("escolhedor desconectado: não espera os 90 s — pula depois de uma folga curta", () => {
    const { ctl, clock } = started();
    ctl.setConnected("ana", false);
    clock.advance(TIMING.DISCONNECTED_MS - 100);
    expect(ctl.state.roundNo).toBe(1);
    clock.advance(200);
    expect(ctl.state.roundNo).toBe(2);
    expect(ctl.state.chooserId).toBe("bia");
  });

  it("se NINGUÉM escolhe, as rodadas passam sozinhas e o jogo acaba", () => {
    const { ctl, clock } = started(["ana", "bia"], 2);
    expect(clock.runAll(1000)).toBe(true);
    expect(ctl.state.phase).toBe("game_over");
    expect(ctl.state.standings).toHaveLength(2);
    expect(ctl.state.standings!.every((s) => s.score === 0)).toBe(true);
  });
});

describe("tempo da vez de chutar", () => {
  it("estourou: o servidor chuta uma letra por quem estava na vez, marcada como automática", () => {
    const { ctl, clock } = playing();
    clock.advance(TIMING.TURN_MS - 1);
    expect(ctl.state.round!.guesses).toHaveLength(0);
    clock.advance(10);
    const g = ctl.state.round!.guesses[0];
    expect(g).toBeDefined();
    expect(g.by).toBe("bia");
    expect(g.auto).toBe(true);
  });

  it("jogar a tempo reinicia a contagem pro próximo", () => {
    const { ctl, clock } = playing("XYLOPHONE");
    clock.advance(2000);
    ctl.dispatch("bia", { type: "guess", letter: "Z" });
    expect(currentPlayer(ctl.state)!.id).toBe("caio");
    clock.advance(TIMING.TURN_MS - 1000); // antes do prazo do caio (que começou aos 2 s)
    expect(ctl.state.round!.guesses.filter((g) => g.auto)).toHaveLength(0);
    clock.advance(1500);
    expect(ctl.state.round!.guesses.filter((g) => g.auto && g.by === "caio")).toHaveLength(1);
  });
});

describe("quem caiu da conexão", () => {
  it("o chutador da vez caiu: a vez passa pro próximo depois de uma folga, sem castigo", () => {
    const { ctl, clock } = playing();
    ctl.setConnected("bia", false);
    clock.advance(TIMING.DISCONNECTED_MS - 100);
    expect(currentPlayer(ctl.state)!.id).toBe("bia");
    clock.advance(200);
    expect(currentPlayer(ctl.state)!.id).toBe("caio");
    expect(ctl.state.round!.lives).toBe(MAX_LIVES);
    expect(ctl.state.events).toEqual([{ t: "away", p: "bia" }]);
  });

  it("todos os chutadores fora: a sala espera (não fica passando a vez em círculos) até alguém voltar", () => {
    const { ctl, clock, changes } = playing();
    ctl.setConnected("bia", false);
    ctl.setConnected("caio", false);
    clock.advance(60_000);
    const settled = changes.length;
    clock.advance(600_000);
    expect(changes.length).toBe(settled);
    expect(clock.pending()).toBe(0);
    ctl.setConnected("caio", true);
    clock.advance(TIMING.DISCONNECTED_MS + 600);
    // a vez foi parar numa pessoa conectada
    expect(currentPlayer(ctl.state)!.connected).toBe(true);
    expect(currentPlayer(ctl.state)!.id).toBe("caio");
  });

  it("o escolhedor cair no meio da rodada não para os chutadores", () => {
    const { ctl, clock } = playing("XYLOPHONE");
    ctl.setConnected("ana", false);
    ctl.dispatch("bia", { type: "guess", letter: "Z" });
    clock.advance(TIMING.TURN_MS + 10);
    expect(ctl.state.round!.guesses.some((g) => g.by === "caio" && g.auto)).toBe(true);
    expect(ctl.state.phase).toBe("playing");
  });
});

describe("palavra seguinte", () => {
  it("rodada acabou: a palavra fica na mesa um tempo e a próxima escolha começa sozinha, com outro escolhedor", () => {
    const { ctl, clock } = playing("GATO");
    ctl.dispatch("bia", { type: "guess_word", word: "gato" });
    expect(ctl.state.phase).toBe("round_end");
    clock.advance(TIMING.LETTER_SETTLE_MS + TIMING.ROUND_END_MS - 100);
    expect(ctl.state.phase).toBe("round_end");
    clock.advance(200);
    expect(ctl.state.phase).toBe("choosing");
    expect(ctl.state.roundNo).toBe(2);
    expect(ctl.state.chooserId).toBe("bia");
  });

  it("depois da última palavra o jogo acaba sozinho", () => {
    const { ctl, clock } = playing("GATO", ["ana", "bia"], 1);
    ctl.dispatch("bia", { type: "guess_word", word: "gato" });
    clock.advance(TIMING.LETTER_SETTLE_MS + TIMING.ROUND_END_MS + 10);
    expect(ctl.state.phase).toBe("game_over");
    expect(ctl.state.winnerId).toBe("bia");
  });
});

describe("revanche", () => {
  it("só depois do fim e só de quem estava na mesa", () => {
    const { ctl, clock } = playing("GATO", ["ana", "bia"], 1);
    expect(ctl.dispatch("bia", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    ctl.dispatch("bia", { type: "guess_word", word: "gato" });
    clock.advance(TIMING.LETTER_SETTLE_MS + TIMING.ROUND_END_MS + 10);
    expect(ctl.dispatch("intruso", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    expect(ctl.dispatch("bia", { type: "rematch" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("lobby");
  });
});

describe("pausa", () => {
  it("pausado nada anda sozinho; ao despausar quem estava na vez ganha o tempo inteiro de novo (a sala vazia não castiga ninguém)", () => {
    const { ctl, clock } = started(["ana", "bia"], 3);
    ctl.setPaused(true);
    clock.advance(10 * TIMING.CHOOSE_MS);
    expect(ctl.state.roundNo).toBe(1);
    ctl.setPaused(false);
    expect(ctl.state.roundNo).toBe(1);
    expect(ctl.state.turnDeadline).toBe(clock.now() + TIMING.CHOOSE_MS);
    clock.advance(TIMING.CHOOSE_MS - 1000);
    expect(ctl.state.roundNo).toBe(1);
    clock.advance(1100);
    expect(ctl.state.roundNo).toBe(2);
  });

  it("a pausa também devolve o tempo de chutar", () => {
    const { ctl, clock } = playing();
    ctl.setPaused(true);
    clock.advance(10 * TIMING.TURN_MS);
    ctl.setPaused(false);
    expect(ctl.state.round!.guesses).toHaveLength(0);
    expect(ctl.state.turnDeadline).toBe(clock.now() + TIMING.TURN_MS);
  });
});

describe("nextAutoAction", () => {
  it("lobby e fim de jogo não têm ação automática", () => {
    expect(nextAutoAction(createLobby(), 0)).toBeNull();
    expect(nextAutoAction({ ...game({ word: "GATO" }), phase: "game_over" }, 0)).toBeNull();
  });

  it("escolha: escolhedor conectado espera até o prazo; desconectado pula logo", () => {
    const s = choosing({ now: 1000 });
    expect(nextAutoAction(s, 1000)).toEqual({ delayMs: TIMING.CHOOSE_MS, message: { type: "skip_chooser" } });
    expect(nextAutoAction(s, 1000 + TIMING.CHOOSE_MS + 5)!.delayMs).toBe(0);
    const away = { ...s, players: s.players.map((p) => (p.id === "a" ? { ...p, connected: false } : p)) };
    expect(nextAutoAction(away, 1000)).toEqual({ delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip_chooser" } });
  });

  it("chutador conectado: espera até o fim do tempo; depois do prazo a espera é zero", () => {
    const s = game({ word: "GATO", now: 1000 });
    expect(nextAutoAction(s, 1000)).toEqual({ delayMs: TIMING.TURN_MS, message: { type: "timeout" } });
    expect(nextAutoAction(s, 1000 + TIMING.TURN_MS + 7)!.delayMs).toBe(0);
  });

  it("chutador fora: pula a vez se tem outro conectado; senão espera", () => {
    const s = game({ word: "GATO" });
    const bAway = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, connected: false } : p)) };
    expect(nextAutoAction(bAway, 0)).toEqual({ delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip_turn" } });
    const bothAway = { ...bAway, players: bAway.players.map((p) => (p.id === "c" ? { ...p, connected: false } : p)) };
    expect(nextAutoAction(bothAway, 0)).toBeNull();
  });

  it("rodada parada agenda o avanço", () => {
    const end = { ...game({ word: "GATO" }), phase: "round_end" as const };
    expect(nextAutoAction(end, 0)).toEqual({ delayMs: TIMING.ROUND_END_MS, message: { type: "advance" } });
  });
});
