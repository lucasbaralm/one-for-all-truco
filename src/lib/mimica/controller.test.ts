import { describe, expect, it } from "vitest";
import { manualClock, mulberry32 } from "@/lib/testing/clock";
import { SONGS } from "./catalog";
import { MimicaController, nextAutoAction } from "./controller";
import { MimicaState, createLobby } from "./engine";
import { miming, picking, songNamed } from "./testKit";
import { TIMING } from "./timing";

function setup(seed = 1, speed?: number) {
  const clock = manualClock();
  const changes: MimicaState[] = [];
  const kicked: string[] = [];
  const ctl = new MimicaController(createLobby(), {
    rng: mulberry32(seed),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: (s) => changes.push(s),
    onKick: (id) => kicked.push(id),
    speed,
  });
  return { ctl, clock, changes, kicked };
}

/** Sala com `names` (o 1º é o host e faz a 1ª mímica), na fase de escolha. */
function started(names = ["ana", "bia", "caio"], rounds = 2, speed?: number) {
  const kit = setup(1, speed);
  for (const n of names) kit.ctl.dispatch(n, { type: "join", name: n.toUpperCase() });
  kit.ctl.dispatch(names[0], { type: "set_rounds", rounds });
  kit.ctl.dispatch(names[0], { type: "start" });
  return kit;
}

/** Igual a `started`, mas a ana já escolheu uma música (a de título dado) e a mímica está rolando. */
function miming_(title = "Lapada Dela", names = ["ana", "bia", "caio"], rounds = 2) {
  const kit = started(names, rounds);
  const song = songNamed(title);
  const turn = kit.ctl.state.turn!;
  if (!turn.card.includes(song.id)) kit.ctl.state = { ...kit.ctl.state, turn: { ...turn, card: [song.id, ...turn.card.slice(1)] } };
  kit.ctl.dispatch(names[0], { type: "pick", songId: song.id });
  return kit;
}

describe("permissões do lobby", () => {
  it("só o host mexe nas voltas, expulsa e começa; começar precisa de 2", () => {
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
    expect(ctl.dispatch("ana", { type: "start" })).toEqual({ ok: false, error: "not_enough_players" });
  });

  it("a sala tem no máximo 8 pessoas", () => {
    const { ctl } = setup();
    for (const n of ["a", "b", "c", "d", "e", "f", "g", "h"]) expect(ctl.dispatch(n, { type: "join", name: n }).ok).toBe(true);
    expect(ctl.dispatch("i", { type: "join", name: "i" })).toEqual({ ok: false, error: "room_full" });
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
  it("escolher: só o mimer, só id inteiro da carta", () => {
    const { ctl } = started();
    const [first] = ctl.state.turn!.card;
    expect(ctl.dispatch("bia", { type: "pick", songId: first })).toEqual({ ok: false, error: "not_mimer" });
    expect(ctl.dispatch("ana", { type: "pick", songId: 1.5 })).toEqual({ ok: false, error: "bad_song" });
    expect(ctl.dispatch("ana", { type: "pick", songId: "x" as unknown as number })).toEqual({ ok: false, error: "bad_song" });
    expect(ctl.dispatch("ana", { type: "pick", songId: first }).ok).toBe(true);
    expect(ctl.state.phase).toBe("miming");
  });

  it("chutar: texto de verdade, e acertar encerra o turno", () => {
    const { ctl } = miming_();
    expect(ctl.dispatch("bia", { type: "guess", text: 42 as unknown as string })).toEqual({ ok: false, error: "bad_guess" });
    expect(ctl.dispatch("ana", { type: "guess", text: "x" })).toEqual({ ok: false, error: "mimer_cannot_guess" });
    expect(ctl.dispatch("bia", { type: "guess", text: "outra coisa" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("miming");
    expect(ctl.dispatch("caio", { type: "guess", text: "Lapada Dela" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("turn_end");
    expect(ctl.state.turn!.solvedBy).toBe("caio");
  });

  it("aceitar e desistir são do mimer", () => {
    const { ctl } = miming_();
    ctl.dispatch("bia", { type: "guess", text: "outra coisa" });
    expect(ctl.dispatch("bia", { type: "accept", guess: 1 })).toEqual({ ok: false, error: "not_mimer" });
    expect(ctl.dispatch("ana", { type: "accept", guess: 1.5 })).toEqual({ ok: false, error: "no_such_guess" });
    expect(ctl.dispatch("bia", { type: "give_up" })).toEqual({ ok: false, error: "not_mimer" });
    expect(ctl.dispatch("ana", { type: "accept", guess: 1 }).ok).toBe(true);
    expect(ctl.state.turn!.solvedBy).toBe("bia");
  });

  it("revanche só depois do fim e só pra quem está na sala", () => {
    const { ctl } = started(["ana", "bia"], 1);
    expect(ctl.dispatch("ana", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    ctl.state = { ...ctl.state, phase: "game_over" };
    expect(ctl.dispatch("intruso", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    expect(ctl.dispatch("ana", { type: "rematch" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("lobby");
  });

  it("emoji não mexe no jogo e mensagem desconhecida é recusada", () => {
    const { ctl, changes } = started();
    const n = changes.length;
    expect(ctl.dispatch("bia", { type: "emoji", emoji: "🎉" }).ok).toBe(true);
    expect(changes.length).toBe(n);
    expect(ctl.dispatch("bia", { type: "voar" } as never)).toEqual({ ok: false, error: "unknown_message" });
  });
});

describe("nextAutoAction", () => {
  it("escolhendo: escolhe sozinho no prazo", () => {
    expect(nextAutoAction(picking({ now: 0 }), 4000)).toEqual({ delayMs: TIMING.PICK_MS - 4000, message: { type: "autopick" } });
  });

  it("mímica: dica na metade, depois fim do tempo", () => {
    const s = miming({ startedAt: 0 });
    expect(nextAutoAction(s, 10_000)).toEqual({ delayMs: 35_000, message: { type: "hint" } });
    const withHint = { ...s, hintAt: 0, turn: { ...s.turn!, hint: 1 as const } };
    expect(nextAutoAction(withHint, 50_000)).toEqual({ delayMs: 40_000, message: { type: "timeout" } });
    expect(nextAutoAction(withHint, 99_000)).toEqual({ delayMs: 0, message: { type: "timeout" } });
  });

  it("turno encerrado: próximo turno depois de um tempinho; lobby e fim: nada", () => {
    const solved = { ...miming(), phase: "turn_end" as const };
    expect(nextAutoAction(solved, 0)).toEqual({ delayMs: TIMING.TURN_END_MS, message: { type: "advance" } });
    expect(nextAutoAction(createLobby(), 0)).toBeNull();
    expect(nextAutoAction({ ...solved, phase: "game_over" }, 0)).toBeNull();
  });

  it("mimer fora da conexão: pula o turno — mas só se sobrou alguém", () => {
    const away = (s: MimicaState): MimicaState => ({ ...s, players: s.players.map((p) => (p.id === "a" ? { ...p, connected: false } : p)) });
    expect(nextAutoAction(away(picking()), 0)).toEqual({ delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip" } });
    expect(nextAutoAction(away(miming()), 0)).toEqual({ delayMs: TIMING.DISCONNECTED_MS, message: { type: "skip" } });
    const alone = away({ ...picking(), players: picking().players.map((p) => ({ ...p, connected: p.id === "a" ? false : false })) });
    expect(nextAutoAction(alone, 0)).toBeNull();
  });
});

describe("relógio", () => {
  it("não escolheu a tempo: o servidor escolhe e a mímica começa", () => {
    const { ctl, clock } = started();
    clock.advance(TIMING.PICK_MS - 1);
    expect(ctl.state.phase).toBe("picking");
    clock.advance(1);
    expect(ctl.state.phase).toBe("miming");
    expect(ctl.state.events[0]).toMatchObject({ t: "picked", auto: true });
    expect(ctl.state.deadline).toBe(TIMING.PICK_MS + TIMING.MIME_MS);
  });

  it("a dica aparece na metade da mímica e o tempo esgotado encerra sem pontos", () => {
    const { ctl, clock } = miming_();
    const t0 = clock.now();
    clock.advance(TIMING.MIME_MS * TIMING.HINT_AT - 1);
    expect(ctl.state.turn!.hint).toBe(0);
    clock.advance(1);
    expect(ctl.state.turn!.hint).toBe(1);
    expect(ctl.state.events).toEqual([{ t: "hint" }]);
    clock.advance(TIMING.MIME_MS / 2 - 1);
    expect(ctl.state.phase).toBe("miming");
    clock.advance(1);
    expect(clock.now() - t0).toBe(TIMING.MIME_MS);
    expect(ctl.state.phase).toBe("turn_end");
    expect(ctl.state.turn!.status).toBe("timeout");
    expect(ctl.state.players.every((p) => p.score === 0)).toBe(true);
  });

  it("depois do turno encerrado vem o próximo mimer", () => {
    const { ctl, clock } = miming_();
    ctl.dispatch("bia", { type: "guess", text: "Lapada Dela" });
    expect(ctl.state.phase).toBe("turn_end");
    clock.advance(TIMING.TURN_END_MS);
    expect(ctl.state.phase).toBe("picking");
    expect(ctl.state.turn!.mimerId).toBe("bia");
    expect(ctl.state.turnNo).toBe(2);
  });

  it("quem faz a mímica cair: o turno é pulado depois da folga e o jogo segue", () => {
    const { ctl, clock } = started();
    ctl.setConnected("ana", false);
    clock.advance(TIMING.DISCONNECTED_MS - 1);
    expect(ctl.state.phase).toBe("picking");
    clock.advance(1);
    expect(ctl.state.phase).toBe("turn_end");
    expect(ctl.state.turn!.status).toBe("skipped");
    clock.advance(TIMING.TURN_END_MS);
    expect(ctl.state.turn!.mimerId).toBe("bia");
  });

  it("se todo mundo caiu, não fica pulando turnos em círculos", () => {
    const { ctl, clock } = started(["ana", "bia"], 1);
    ctl.setConnected("ana", false);
    ctl.setConnected("bia", false);
    clock.advance(60_000);
    expect(ctl.state.phase).toBe("picking");
    expect(ctl.state.turnNo).toBe(1);
  });

  it("uma partida inteira só com os temporizadores chega ao fim", () => {
    const { ctl, clock } = started(["ana", "bia", "caio"], 2);
    expect(clock.runAll()).toBe(true);
    expect(ctl.state.phase).toBe("game_over");
    expect(ctl.state.turnNo).toBe(6);
    expect(ctl.state.standings).toHaveLength(3);
    expect(clock.pending()).toBe(0);
  });

  it("speed divide as esperas e acelera o relógio do jogo", () => {
    const { ctl, clock } = started(["ana", "bia"], 1, 10);
    expect(ctl.clock()).toBe(clock.now() * 10);
    clock.advance(TIMING.PICK_MS / 10);
    expect(ctl.state.phase).toBe("miming");
  });
});

describe("sala vazia", () => {
  it("pausada, nada acontece sozinho; ao voltar, a fase recomeça com o tempo inteiro", () => {
    const { ctl, clock } = miming_();
    clock.advance(30_000);
    ctl.setPaused(true);
    expect(clock.pending()).toBe(0);
    clock.advance(10 * 60_000);
    expect(ctl.state.phase).toBe("miming");
    ctl.setPaused(false);
    expect(ctl.state.deadline).toBe(ctl.clock() + TIMING.MIME_MS);
    expect(ctl.state.hintAt).toBe(ctl.clock() + TIMING.MIME_MS * TIMING.HINT_AT);
    clock.advance(TIMING.MIME_MS - 1);
    expect(ctl.state.phase).toBe("miming");
    clock.advance(1);
    expect(ctl.state.phase).toBe("turn_end");
  });

  it("na escolha também: quem volta acha o prazo cheio", () => {
    const { ctl, clock } = started();
    ctl.setPaused(true);
    clock.advance(5 * 60_000);
    ctl.setPaused(false);
    expect(ctl.state.deadline).toBe(ctl.clock() + TIMING.PICK_MS);
    expect(ctl.state.phase).toBe("picking");
  });

  it("a dica que já saiu não volta a ser agendada", () => {
    const { ctl, clock } = miming_();
    clock.advance(TIMING.MIME_MS * TIMING.HINT_AT);
    expect(ctl.state.turn!.hint).toBe(1);
    ctl.setPaused(true);
    ctl.setPaused(false);
    expect(ctl.state.hintAt).toBe(0);
  });
});

describe("a carta nunca repete numa partida", () => {
  it("as 4 músicas de cada turno são novas", () => {
    const { ctl, clock } = started(["ana", "bia", "caio", "dani"], 5);
    const seen: number[] = [];
    ctl.state.turn!.card.forEach((id) => seen.push(id));
    for (let i = 0; i < 19; i++) {
      clock.advance(TIMING.PICK_MS + TIMING.MIME_MS + TIMING.TURN_END_MS);
      ctl.state.turn!.card.forEach((id) => seen.push(id));
    }
    expect(ctl.state.turnNo).toBe(20);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.every((id) => !!SONGS[id])).toBe(true);
  });
});
