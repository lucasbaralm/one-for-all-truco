import { describe, expect, it } from "vitest";
import { ALL_CARDS, DECK_SIZE } from "./cards";
import { DobbleController } from "./controller";
import {
  DobbleMode,
  DobbleState,
  advanceRound,
  beginPlay,
  claim,
  createLobby,
  joinLobby,
  matchFor,
  setMode,
  startGame,
  toView,
} from "./engine";
import { BOT_REACTION_MS, TIMING } from "./timing";
import { manualClock } from "../testing/clock";
import { mulberry32 } from "../random";

// Partidas do Dobble jogadas por clientes "malucos" (acertam, erram, chegam
// atrasados, clicam fora de hora) — conferindo a cada passo que nenhuma carta
// some ou se duplica, que o servidor nunca vaza o que está virado pra baixo e
// que a partida sempre termina.

function ensure(cond: boolean, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function must(r: { ok: true; state: DobbleState } | { ok: false; error: string }) {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function room(players: number, mode: DobbleMode, rng: () => number): DobbleState {
  let s = createLobby();
  for (let i = 0; i < players; i++) s = must(joinLobby(s, { id: `p${i}`, name: `P${i}` }));
  s = must(setMode(s, mode));
  return must(startGame(s, rng));
}

/** Toda carta existe em UM lugar só (centro, mãos, monte, montes viradores). */
function expectNoDuplicates(s: DobbleState) {
  const ids: number[] = [];
  if (s.center !== null) ids.push(s.center);
  ids.push(...s.draw);
  for (const p of s.players) {
    if (p.hand !== null) ids.push(p.hand);
    ids.push(...p.pile);
  }
  ensure(new Set(ids).size === ids.length, "carta repetida entre as zonas do jogo");
  ensure(ids.every((c) => c >= 0 && c < ALL_CARDS.length), "id de carta inválido");
}

/** Torre: centro + monte + pilhas = 55 (56 por um instante, na rodada ganha, antes de o centro trocar). */
function expectTowerAccounting(s: DobbleState) {
  const inPlay = (s.center !== null ? 1 : 0) + s.draw.length + s.players.reduce((n, p) => n + p.stack, 0);
  const expected = DECK_SIZE + (s.phase === "round_end" ? 1 : 0);
  ensure(inPlay === expected, `contas da Torre erradas: ${inPlay} ≠ ${expected} (${s.phase})`);
}

function fuzzGame(players: number, mode: DobbleMode, seed: number) {
  const rng = mulberry32(seed);
  let s = room(players, mode, rng);
  let now = 0;
  let lastRound = 0;
  let steps = 0;
  const seen = { wrong: 0, late: 0, locked: 0, notPlaying: 0 };

  while (s.phase !== "game_over" && steps++ < 5000) {
    expectNoDuplicates(s);
    if (mode === "tower") expectTowerAccounting(s);
    ensure(s.round >= lastRound, "a rodada voltou");
    lastRound = s.round;

    if (s.phase === "countdown") {
      s = must(beginPlay(s));
    } else if (s.phase === "round_end") {
      // enquanto a rodada ganha está parada, cliques atrasados não podem mudar nada
      const late = claim(s, "p0", 0, s.round, now);
      ensure(!late.ok && late.error === "not_playing", "clique durante round_end deveria ser recusado");
      seen.notPlaying++;
      s = must(advanceRound(s));
      ensure(Object.keys(s.lockedUntil).length === 0, "castigos deveriam zerar na rodada nova");
    } else {
      const who = s.players[Math.floor(rng() * players)].id;
      const roll = rng();
      if (roll < 0.15) {
        // símbolo errado (um que a carta do jogador tem mas não é o certo)
        const me = s.players.find((p) => p.id === who)!;
        const right = matchFor(s, who)!;
        const wrongSym = ALL_CARDS[me.hand!].find((x) => x !== right)!;
        const r = claim(s, who, wrongSym, s.round, now);
        if (r.ok) {
          s = r.state;
          seen.wrong++;
          ensure(s.phase === "playing", "erro não pode encerrar a rodada");
          ensure((s.lockedUntil[who] ?? 0) > now, "erro deveria dar castigo");
        } else {
          ensure(r.error === "locked", `erro inesperado: ${r.error}`);
          seen.locked++;
        }
      } else if (roll < 0.25) {
        // clique de uma rodada que já passou
        const r = claim(s, who, matchFor(s, who)!, s.round - 1, now);
        ensure(!r.ok && r.error === "late", "clique atrasado deveria ser recusado");
        seen.late++;
      } else {
        const r = claim(s, who, matchFor(s, who)!, s.round, now);
        if (r.ok) {
          s = r.state;
          ensure(s.phase === "round_end", "acerto deveria encerrar a rodada");
          ensure(s.lastClaim?.playerId === who, "vencedor errado");
        } else {
          ensure(r.error === "locked", `acerto recusado por ${r.error}`);
          seen.locked++;
        }
      }
      now += 400; // o tempo passa: castigos vencem
    }
  }
  return { s, seen };
}

describe("partidas completas (cliques certos, errados, atrasados)", () => {
  for (const mode of ["tower", "well"] as const) {
    it(`modo ${mode}: de 2 a 8 jogadores, 8 partidas cada — sempre terminam, sem carta duplicada`, () => {
      for (let players = 2; players <= 8; players++) {
        for (let seed = 1; seed <= 8; seed++) {
          const { s } = fuzzGame(players, mode, seed * 101 + players);
          expect(s.phase, `${players} jogadores, seed ${seed}`).toBe("game_over");
          expect(s.standings![0].playerId).toBe(s.winnerId);
          if (mode === "tower") {
            expect(s.standings!.reduce((n, x) => n + x.cards, 0)).toBe(DECK_SIZE);
            const top = Math.max(...s.standings!.map((x) => x.cards));
            expect(s.standings![0].cards).toBe(top);
          } else {
            expect(s.standings![0].cards).toBe(0);
          }
        }
      }
    });
  }

  it("o fuzz de fato exercita erros, castigos e cliques atrasados", () => {
    let wrong = 0;
    let late = 0;
    let locked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { seen } = fuzzGame(4, "tower", seed);
      wrong += seen.wrong;
      late += seen.late;
      locked += seen.locked;
    }
    expect(wrong).toBeGreaterThan(20);
    expect(late).toBeGreaterThan(20);
    expect(locked).toBeGreaterThan(0);
  });

  it("a visão pública nunca vaza o monte nem os montes dos jogadores, em nenhuma fase", () => {
    const rng = mulberry32(3);
    for (const mode of ["tower", "well"] as const) {
      let s = room(4, mode, rng);
      const check = () => {
        const v = toView(s);
        const json = JSON.stringify(v);
        expect(json).not.toContain('"draw"');
        expect(json).not.toContain('"pile"');
        if (v.phase === "countdown") {
          expect(v.center).toBeNull();
          expect(v.players.every((p) => p.hand === null)).toBe(true);
        }
        // só o que está virado pra cima: as mãos da visão são as mãos reais
        v.players.forEach((p, i) => {
          if (v.phase !== "countdown") expect(p.hand).toBe(s.players[i].hand);
        });
      };
      check();
      s = must(beginPlay(s));
      check();
      s = must(claim(s, "p0", matchFor(s, "p0")!, s.round, 0));
      check();
      s = must(advanceRound(s));
      check();
    }
  });
});

describe("jogadores humanos simulados + bots, pelo controlador (com relógio manual)", () => {
  it("a sala conduz a partida inteira sozinha: contagem, rodadas paradas, bots e humanos disputando", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed * 7);
      const clock = manualClock();
      const phases: string[] = [];
      let lastRound = -1;

      const ctl: DobbleController = new DobbleController(createLobby(), {
        rng: mulberry32(seed * 11),
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        onChange: (st) => {
          if (phases.at(-1) !== st.phase) phases.push(st.phase);
          // a cada rodada que abre, os dois humanos "reagem" depois de um tempo (às vezes errando antes)
          if (st.phase === "playing" && st.round !== lastRound) {
            lastRound = st.round;
            for (const human of ["ana", "beto"]) {
              const [lo, hi] = BOT_REACTION_MS.medium;
              const delay = lo + rng() * (hi - lo);
              clock.setTimer(() => {
                const now = ctl.state;
                if (now.phase !== "playing" || now.round !== st.round) return;
                const sym = rng() < 0.12 ? 9999 : matchFor(now, human)!;
                ctl.dispatch(human, { type: "claim", symbol: sym, round: st.round });
              }, delay);
            }
          }
        },
      });
      ctl.dispatch("ana", { type: "join", name: "Ana" });
      ctl.dispatch("beto", { type: "join", name: "Beto" });
      ctl.dispatch("ana", { type: "add_bot", level: "medium" });
      ctl.dispatch("ana", { type: "add_bot", level: "hard" });
      ctl.dispatch("ana", { type: "set_mode", mode: seed % 2 ? "tower" : "well" });
      ctl.dispatch("ana", { type: "start" });

      expect(clock.runAll(), `seed ${seed} não terminou`).toBe(true);
      expect(ctl.state.phase).toBe("game_over");
      expect(ctl.state.standings![0].playerId).toBe(ctl.state.winnerId);
      // a ordem das fases respeita o fluxo: contagem → jogando ⇄ rodada ganha → fim
      const flow = phases.slice(phases.indexOf("countdown")); // ignora o lobby (entradas e bots)
      expect(flow[0]).toBe("countdown");
      expect(flow.at(-1)).toBe("game_over");
      expect(flow.filter((p) => p === "countdown")).toHaveLength(1);
      expect(flow.slice(1, -1).every((p) => p === "playing" || p === "round_end")).toBe(true);
      // rodadas alternam: nunca duas "jogando" nem duas "rodada ganha" seguidas
      expect(flow.every((p, i) => i === 0 || p !== flow[i - 1])).toBe(true);
      // o tempo da partida inteira cabe numa cota razoável (nada de timers que travam)
      expect(clock.now()).toBeGreaterThan(TIMING.COUNTDOWN_MS);
      expect(clock.now()).toBeLessThan(60 * 60 * 1000);
    }
  });
});
