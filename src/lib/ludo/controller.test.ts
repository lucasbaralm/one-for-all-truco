import { describe, it, expect } from "vitest";
import { LudoController, nextAutoAction } from "./controller";
import {
  BotLevel,
  LudoState,
  addBot,
  createLobby,
  joinLobby,
  legalMoves,
  rollDice,
  startGame,
} from "./engine";
import { FINISHED, IN_BASE } from "./board";
import { TIMING } from "./timing";

// ── helpers ────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relógio manual: executa timers em ordem sem esperar tempo de verdade. */
function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    get now() {
      return now;
    },
    pending: () => timers.size,
    /** Avança até `ms` à frente, disparando o que vencer no caminho. */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    },
    /** Roda até não sobrar nada agendado (ou estourar o limite de passos). */
    runAll(maxSteps = 100000) {
      for (let i = 0; i < maxSteps; i++) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) return true;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
      }
      return false;
    },
  };
}

function botsGame(levels: BotLevel[], seed: number) {
  const rng = mulberry32(seed);
  const clock = manualClock();
  const snapshots: LudoState[] = [];
  const ctl = new LudoController(createLobby(), {
    rng,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: (s) => snapshots.push(s),
  });
  // host humano só pra poder iniciar; sai logo em seguida e vira "desconectado"
  ctl.dispatch("host", { type: "join", name: "Host" });
  levels.slice(0, 3).forEach((level) => ctl.dispatch("host", { type: "add_bot", level }));
  return { ctl, clock, snapshots };
}

// ── testes ─────────────────────────────────────────────────────────────────

describe("partida só de bots", () => {
  it("termina sempre, com um vencedor e estados sempre válidos", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { ctl, clock, snapshots } = botsGame(["easy", "medium", "hard"], seed);
      ctl.dispatch("host", { type: "start" });
      ctl.setConnected("host", false); // o host humano não joga: o controlador joga por ele
      expect(clock.runAll(), `seed ${seed} não terminou`).toBe(true);

      const end = ctl.state;
      expect(end.phase).toBe("game_over");
      expect(end.winnerId).toBeTruthy();
      expect(end.standings?.[0].playerId).toBe(end.winnerId);
      expect(end.standings?.[0].finished).toBe(4);

      // Checagem manual (em vez de um expect por peça) — são milhares de estados por partida.
      const violations: string[] = [];
      let lastMoveSeq = 0;
      for (const s of snapshots) {
        if (s.moveSeq < lastMoveSeq) violations.push("moveSeq voltou");
        lastMoveSeq = s.moveSeq;
        for (const p of s.players) {
          if (p.pieces.length !== 4) violations.push("número de peças errado");
          if (p.pieces.some((x) => x < IN_BASE || x > FINISHED)) violations.push(`progresso fora da faixa: ${p.pieces}`);
        }
        if (s.phase !== "lobby" && s.turn >= s.players.length) violations.push("turno fora da lista");
      }
      expect(violations, `seed ${seed}`).toEqual([]);
    }
  }, 60_000);

  it("bots difíceis ganham bem mais que o acaso contra bots fáceis", () => {
    let hardWins = 0;
    const games = 80;
    for (let seed = 1; seed <= games; seed++) {
      const rng = mulberry32(seed * 7919);
      const clock = manualClock();
      const ctl = new LudoController(createLobby(), { rng, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
      ctl.dispatch("host", { type: "join", name: "Host" });
      // o "difícil" gira de cor a cada partida pra não favorecer a posição
      const colors = ["red", "green", "blue", "yellow"] as const;
      const hardColor = colors[seed % 4];
      ctl.dispatch("host", { type: "add_bot", level: "hard", color: hardColor });
      for (const c of colors.filter((c) => c !== hardColor).slice(0, 2)) {
        ctl.dispatch("host", { type: "add_bot", level: "easy", color: c });
      }
      ctl.dispatch("host", { type: "start" });
      ctl.setConnected("host", false); // o host humano restante vira piloto automático (nível médio)
      clock.runAll();
      const winner = ctl.state.players.find((p) => p.id === ctl.state.winnerId);
      if (winner?.bot === "hard") hardWins++;
    }
    // Sorte pura daria ~25%; o difícil precisa ficar claramente acima.
    expect(hardWins / games).toBeGreaterThan(0.4);
  });
});

describe("permissões", () => {
  function lobbyWithTwo() {
    const clock = manualClock();
    const ctl = new LudoController(createLobby(), { rng: mulberry32(3), setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("beto", { type: "join", name: "Beto" });
    return { ctl, clock };
  }

  it("só o host adiciona bots, inicia e expulsa", () => {
    const { ctl } = lobbyWithTwo();
    expect(ctl.dispatch("beto", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("beto", { type: "start" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("beto", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("ana", { type: "add_bot", level: "easy" }).ok).toBe(true);
    expect(ctl.dispatch("ana", { type: "start" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("rolling");
  });

  it("expulsar avisa o servidor pra fechar a conexão e tira da sala", () => {
    const kicked: string[] = [];
    const clock = manualClock();
    const ctl = new LudoController(createLobby(), {
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      onKick: (id) => kicked.push(id),
    });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("beto", { type: "join", name: "Beto" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ana" }).ok).toBe(false);
    expect(ctl.dispatch("ana", { type: "kick", playerId: "beto" }).ok).toBe(true);
    expect(kicked).toEqual(["beto"]);
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana"]);
  });

  it("não deixa jogar pelo outro nem rolar duas vezes", () => {
    const { ctl } = lobbyWithTwo();
    ctl.dispatch("ana", { type: "start" });
    const turnId = ctl.state.players[ctl.state.turn].id;
    const otherId = turnId === "ana" ? "beto" : "ana";
    expect(ctl.dispatch(otherId, { type: "roll" })).toEqual({ ok: false, error: "not_your_turn" });
    expect(ctl.dispatch(turnId, { type: "roll" }).ok).toBe(true);
    expect(ctl.dispatch(turnId, { type: "roll" })).toEqual({ ok: false, error: "not_rolling" });
  });

  it("revanche só depois do fim, por quem estava na partida", () => {
    const { ctl } = lobbyWithTwo();
    ctl.dispatch("ana", { type: "start" });
    expect(ctl.dispatch("ana", { type: "rematch" }).ok).toBe(false);
  });

  it("sala encerrada e vazia vira um lobby novo pro próximo que chegar; com gente ainda conectada, não", () => {
    const { ctl } = lobbyWithTwo();
    ctl.dispatch("ana", { type: "start" });
    ctl.state = { ...ctl.state, phase: "game_over", winnerId: "ana" };

    // Ana ainda está conectada: o recém-chegado só assiste.
    expect(ctl.dispatch("carol", { type: "join", name: "Carol" })).toEqual({ ok: false, error: "game_in_progress" });

    ctl.setConnected("ana", false);
    ctl.setConnected("beto", false);
    expect(ctl.dispatch("carol", { type: "join", name: "Carol" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("lobby");
    expect(ctl.state.players.map((p) => p.id)).toEqual(["carol"]);
    expect(ctl.state.hostId).toBe("carol");
  });
});

describe("jogadas automáticas", () => {
  function started(seed = 5) {
    const clock = manualClock();
    const ctl = new LudoController(createLobby(), { rng: mulberry32(seed), setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "medium" });
    ctl.dispatch("ana", { type: "start" });
    return { ctl, clock };
  }

  it("um bot rola sozinho na vez dele, mas só depois da abertura", () => {
    const { ctl, clock } = started();
    // força a vez do bot
    const botIdx = ctl.state.players.findIndex((p) => p.bot);
    ctl.state = { ...ctl.state, turn: botIdx };
    ctl.setConnected("ana", true); // reagenda
    clock.advance(TIMING.BOT_THINK_MAX_MS + 10);
    expect(ctl.state.rollSeq).toBeGreaterThan(0);
  });

  it("não age enquanto pausado e retoma depois", () => {
    const { ctl, clock } = started();
    const botIdx = ctl.state.players.findIndex((p) => p.bot);
    ctl.state = { ...ctl.state, turn: botIdx };
    ctl.setPaused(true);
    clock.advance(60_000);
    expect(ctl.state.rollSeq).toBe(0);
    ctl.setPaused(false);
    clock.advance(TIMING.BOT_THINK_MAX_MS + 10);
    expect(ctl.state.rollSeq).toBe(1);
  });

  it("joga por um humano desconectado na vez dele", () => {
    const { ctl, clock } = started();
    const humanIdx = ctl.state.players.findIndex((p) => !p.bot);
    ctl.state = { ...ctl.state, turn: humanIdx };
    ctl.setConnected("ana", false);
    clock.advance(TIMING.DISCONNECTED_MS + 10);
    expect(ctl.state.rollSeq).toBe(1);
  });

  it("espera o humano quando há mais de uma jogada que faz diferença", () => {
    const s0 = (() => {
      let s = createLobby();
      const j = (r: ReturnType<typeof joinLobby>) => {
        if (!r.ok) throw new Error(r.error);
        return r.state;
      };
      s = j(joinLobby(s, { id: "ana", name: "Ana" }));
      s = j(joinLobby(s, { id: "beto", name: "Beto" }));
      const r = startGame(s, () => 0);
      if (!r.ok) throw new Error(r.error);
      return r.state;
    })();
    const base: LudoState = {
      ...s0,
      turn: 0,
      players: s0.players.map((p, i) => (i === 0 ? { ...p, pieces: [10, 20, IN_BASE, IN_BASE] } : p)),
    };
    const rolled = rollDice(base, "ana", 3);
    if (!rolled.ok) throw new Error(rolled.error);
    expect(legalMoves(rolled.state)).toHaveLength(2);
    expect(nextAutoAction(rolled.state)).toBeNull();

    // com uma peça só que pode andar, joga direto
    const single = rollDice({ ...base, players: base.players.map((p, i) => (i === 0 ? { ...p, pieces: [10, IN_BASE, IN_BASE, IN_BASE] } : p)) }, "ana", 3);
    if (!single.ok) throw new Error(single.error);
    expect(nextAutoAction(single.state)).toMatchObject({ actorId: "ana", message: { type: "move", piece: 0 } });
  });

  it("passa a vez sozinho quando não existe jogada", () => {
    const { ctl, clock } = started();
    const humanIdx = ctl.state.players.findIndex((p) => !p.bot);
    // humano com tudo na base e dado 4 → sem jogada
    ctl.state = { ...ctl.state, turn: humanIdx, phase: "moving", dice: 4 };
    ctl.setConnected("ana", true);
    clock.advance(TIMING.PASS_MS + 10);
    expect(ctl.state.phase).toBe("rolling");
    expect(ctl.state.turn).not.toBe(humanIdx);
  });
});

describe("speed (só pra teste ponta a ponta)", () => {
  it("divide as esperas automáticas pelo fator", () => {
    const scheduled: number[] = [];
    const ctl = new LudoController(createLobby(), {
      rng: () => 0, // o bot pensa o mínimo
      speed: 10,
      setTimer: (_fn, ms) => scheduled.push(ms),
      clearTimer: () => {},
    });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    ctl.dispatch("ana", { type: "start" });
    ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.bot) };
    ctl.setConnected("ana", true); // reagenda a ação do bot, sem tempo de animação
    expect(scheduled.at(-1)).toBe(TIMING.BOT_THINK_MIN_MS / 10);
  });

  it("sem speed (produção) nada muda", () => {
    const scheduled: number[] = [];
    const ctl = new LudoController(createLobby(), {
      rng: () => 0,
      setTimer: (_fn, ms) => scheduled.push(ms),
      clearTimer: () => {},
    });
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    ctl.dispatch("ana", { type: "start" });
    ctl.state = { ...ctl.state, turn: ctl.state.players.findIndex((p) => p.bot) };
    ctl.setConnected("ana", true);
    expect(scheduled.at(-1)).toBe(TIMING.BOT_THINK_MIN_MS);
  });
});

describe("bots no lobby", () => {
  it("limita a 4 jogadores no total", () => {
    let s = createLobby();
    const j = (r: ReturnType<typeof addBot>) => {
      if (!r.ok) throw new Error(r.error);
      return r.state;
    };
    s = j(addBot(s, "easy"));
    s = j(addBot(s, "easy"));
    s = j(addBot(s, "easy"));
    s = j(addBot(s, "easy"));
    expect(addBot(s, "easy")).toEqual({ ok: false, error: "room_full" });
  });
});
