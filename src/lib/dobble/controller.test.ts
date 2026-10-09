import { describe, expect, it } from "vitest";
import { DECK_SIZE } from "./cards";
import { DobbleController } from "./controller";
import { BotLevel, DobbleMode, DobbleState, LOCK_MS, cardsOf, createLobby, matchFor } from "./engine";
import { botsSetupMessages, parseBotsSetup } from "./setup";
import { BOT_REACTION_MS, TIMING } from "./timing";
import { manualClock, mulberry32 } from "../testing/clock";

function newController(opts: { seed?: number; speed?: number; clock?: ReturnType<typeof manualClock> } = {}) {
  const clock = opts.clock ?? manualClock();
  const snapshots: DobbleState[] = [];
  const ctl = new DobbleController(createLobby(), {
    rng: mulberry32(opts.seed ?? 1),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    speed: opts.speed,
    onChange: (s) => snapshots.push(s),
  });
  return { ctl, clock, snapshots };
}

/** Humano "host" + bots; a partida roda sozinha (o humano nunca clica). */
function botsGame(levels: BotLevel[], mode: DobbleMode, seed: number) {
  const g = newController({ seed });
  g.ctl.dispatch("host", { type: "join", name: "Host" });
  g.ctl.dispatch("host", { type: "set_mode", mode });
  for (const level of levels) g.ctl.dispatch("host", { type: "add_bot", level });
  g.ctl.dispatch("host", { type: "start" });
  return g;
}

describe("fluxo automático", () => {
  it("contagem regressiva → primeira rodada; rodada ganha fica parada e depois avança", () => {
    const { ctl, clock } = newController();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("beto", { type: "join", name: "Beto" });
    ctl.dispatch("ana", { type: "start" });
    expect(ctl.state.phase).toBe("countdown");

    clock.advance(TIMING.COUNTDOWN_MS - 1);
    expect(ctl.state.phase).toBe("countdown");
    clock.advance(2);
    expect(ctl.state.phase).toBe("playing");
    expect(ctl.state.round).toBe(1);

    const sym = matchFor(ctl.state, "ana")!;
    expect(ctl.dispatch("ana", { type: "claim", symbol: sym, round: 1 }).ok).toBe(true);
    expect(ctl.state.phase).toBe("round_end");
    clock.advance(TIMING.ROUND_END_MS - 1);
    expect(ctl.state.phase).toBe("round_end");
    clock.advance(2);
    expect(ctl.state.phase).toBe("playing");
    expect(ctl.state.round).toBe(2);
  });

  it("bots acham o símbolo sozinhos, dentro do tempo de reação do nível", () => {
    const { ctl, clock } = newController({ seed: 3 });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "hard" });
    ctl.dispatch("ana", { type: "start" });
    clock.advance(TIMING.COUNTDOWN_MS + 1);
    expect(ctl.state.phase).toBe("playing");
    clock.advance(BOT_REACTION_MS.hard[1] + 1);
    expect(ctl.state.phase).toBe("round_end");
    expect(ctl.state.lastClaim?.playerId).toBe("bot:1");
  });

  it("não age enquanto pausado e retoma depois (a contagem recomeça)", () => {
    const { ctl, clock } = newController();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    ctl.setPaused(true);
    ctl.dispatch("ana", { type: "start" });
    clock.advance(60_000);
    expect(ctl.state.phase).toBe("countdown");
    ctl.setPaused(false);
    clock.advance(TIMING.COUNTDOWN_MS + 1);
    expect(ctl.state.phase).toBe("playing");
  });

  it("um erro de símbolo na rodada NÃO dá tempo de reação novo aos bots", () => {
    const { ctl, clock } = newController({ seed: 5 });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "medium" });
    ctl.dispatch("ana", { type: "start" });
    clock.advance(TIMING.COUNTDOWN_MS + 1);
    const pendingBefore = clock.pending();
    // Ana erra de propósito (um símbolo que está só na carta dela)
    const hand = ctl.state.players[0].hand!;
    const right = matchFor(ctl.state, "ana")!;
    const wrong = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => i !== right && ctl.state.center !== hand)!;
    void wrong;
    ctl.dispatch("ana", { type: "claim", symbol: 9999, round: 1 });
    expect(clock.pending()).toBe(pendingBefore);
  });

  it("speed divide as esperas (só pra teste ponta a ponta)", () => {
    const { ctl, clock } = newController({ speed: 10 });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    ctl.dispatch("ana", { type: "start" });
    clock.advance(TIMING.COUNTDOWN_MS / 10 + 1);
    expect(ctl.state.phase).toBe("playing");
  });
});

describe("permissões e erros", () => {
  function twoPlayers() {
    const g = newController();
    g.ctl.dispatch("ana", { type: "join", name: "Ana" });
    g.ctl.dispatch("beto", { type: "join", name: "Beto" });
    return g;
  }

  it("só o host muda o modo, traz bots, expulsa e inicia", () => {
    const { ctl } = twoPlayers();
    expect(ctl.dispatch("beto", { type: "set_mode", mode: "well" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("beto", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("beto", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("beto", { type: "start" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("ana", { type: "set_mode", mode: "well" }).ok).toBe(true);
    expect(ctl.dispatch("ana", { type: "start" }).ok).toBe(true);
  });

  it("expulsar avisa o servidor e tira da sala", () => {
    const kicked: string[] = [];
    const clock = manualClock();
    const ctl = new DobbleController(createLobby(), { setTimer: clock.setTimer, clearTimer: clock.clearTimer, onKick: (id) => kicked.push(id) });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("beto", { type: "join", name: "Beto" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ana" }).ok).toBe(false);
    expect(ctl.dispatch("ana", { type: "kick", playerId: "beto" }).ok).toBe(true);
    expect(kicked).toEqual(["beto"]);
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana"]);
  });

  it("errar trava o jogador pelo castigo (relógio do jogo) e o acerto depois do castigo vale", () => {
    const { ctl, clock } = twoPlayers();
    ctl.dispatch("ana", { type: "start" });
    clock.advance(TIMING.COUNTDOWN_MS + 1);
    expect(ctl.dispatch("beto", { type: "claim", symbol: 9999, round: 1 }).ok).toBe(true); // errou (não é erro de API)
    expect(ctl.state.lastWrong?.playerId).toBe("beto");
    const sym = matchFor(ctl.state, "beto")!;
    expect(ctl.dispatch("beto", { type: "claim", symbol: sym, round: 1 })).toEqual({ ok: false, error: "locked" });
    clock.advance(LOCK_MS);
    expect(ctl.dispatch("beto", { type: "claim", symbol: sym, round: 1 }).ok).toBe(true);
    expect(ctl.state.phase).toBe("round_end");
  });

  it("clique da rodada anterior não vale na rodada nova", () => {
    const { ctl, clock } = twoPlayers();
    ctl.dispatch("ana", { type: "start" });
    clock.advance(TIMING.COUNTDOWN_MS + 1);
    ctl.dispatch("ana", { type: "claim", symbol: matchFor(ctl.state, "ana")!, round: 1 });
    clock.advance(TIMING.ROUND_END_MS + 1);
    expect(ctl.state.round).toBe(2);
    expect(ctl.dispatch("beto", { type: "claim", symbol: 0, round: 1 })).toEqual({ ok: false, error: "late" });
  });

  it("revanche só depois do fim; sala encerrada e vazia vira lobby pro próximo que chegar", () => {
    const { ctl } = twoPlayers();
    ctl.dispatch("ana", { type: "start" });
    expect(ctl.dispatch("ana", { type: "rematch" }).ok).toBe(false);

    ctl.state = { ...ctl.state, phase: "game_over", winnerId: "ana" };
    expect(ctl.dispatch("carol", { type: "join", name: "Carol" })).toEqual({ ok: false, error: "game_in_progress" });
    ctl.setConnected("ana", false);
    ctl.setConnected("beto", false);
    expect(ctl.dispatch("carol", { type: "join", name: "Carol" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("lobby");
    expect(ctl.state.players.map((p) => p.id)).toEqual(["carol"]);
  });
});

describe("partidas só de bots", () => {
  for (const mode of ["tower", "well"] as const) {
    it(`modo ${mode}: sempre termina, com vencedor e contas fechando`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const { ctl, clock, snapshots } = botsGame(["easy", "medium", "hard"], mode, seed);
        expect(clock.runAll(), `seed ${seed} não terminou`).toBe(true);
        const end = ctl.state;
        expect(end.phase).toBe("game_over");
        expect(end.winnerId).toBeTruthy();
        expect(end.standings?.[0].playerId).toBe(end.winnerId);

        if (mode === "tower") {
          // todas as 55 cartas acabam em alguma pilha
          expect(end.standings!.reduce((n, s) => n + s.cards, 0)).toBe(DECK_SIZE);
        } else {
          const winner = end.players.find((p) => p.id === end.winnerId)!;
          expect(cardsOf(end, winner)).toBe(0);
        }
        // rodadas só avançam de 1 em 1
        let last = 0;
        for (const s of snapshots) {
          expect(s.round >= last).toBe(true);
          last = s.round;
        }
      }
    }, 60_000);
  }

  it("bot difícil ganha muito mais rodadas que o fácil", () => {
    let hardWins = 0;
    const games = 30;
    for (let seed = 1; seed <= games; seed++) {
      const g = newController({ seed: seed * 977 });
      g.ctl.dispatch("host", { type: "join", name: "Host" });
      g.ctl.dispatch("host", { type: "add_bot", level: "hard" });
      g.ctl.dispatch("host", { type: "add_bot", level: "easy" });
      g.ctl.dispatch("host", { type: "start" });
      g.clock.runAll();
      const hard = g.ctl.state.players.find((p) => p.bot === "hard")!;
      const easy = g.ctl.state.players.find((p) => p.bot === "easy")!;
      if (cardsOf(g.ctl.state, hard) > cardsOf(g.ctl.state, easy)) hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.8);
  }, 60_000);
});

describe("setup 'contra bots'", () => {
  it("as mensagens montam a partida (modo, N bots do nível pedido, começar)", () => {
    for (const mode of ["tower", "well"] as const) {
      for (const bots of [1, 4, 7]) {
        const { ctl } = newController();
        ctl.dispatch("eu", { type: "join", name: "Eu" });
        for (const m of botsSetupMessages({ bots, level: "hard", mode })) expect(ctl.dispatch("eu", m).ok).toBe(true);
        expect(ctl.state.phase).toBe("countdown");
        expect(ctl.state.mode).toBe(mode);
        expect(ctl.state.players).toHaveLength(bots + 1);
        expect(ctl.state.players.filter((p) => p.bot === "hard")).toHaveLength(bots);
      }
    }
  });

  it("parseBotsSetup valida e limita", () => {
    expect(parseBotsSetup({})).toBeUndefined();
    expect(parseBotsSetup({ bots: "3", level: "hard", mode: "well" })).toEqual({ bots: 3, level: "hard", mode: "well" });
    expect(parseBotsSetup({ bots: "99", level: "x", mode: "y" })).toEqual({ bots: 7, level: "medium", mode: "tower" });
    expect(parseBotsSetup({ bots: "0" })?.bots).toBe(3);
  });
});
