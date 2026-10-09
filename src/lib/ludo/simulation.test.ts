import { describe, expect, it } from "vitest";
import { chooseBotMove } from "./bot";
import { FINISHED, IN_BASE, isOnRing, isSafeRingIndex, ringIndexOf } from "./board";
import {
  LudoState,
  addBot,
  createLobby,
  distinctMoves,
  joinLobby,
  legalMoves,
  movePiece,
  passTurn,
  rollDice,
  startGame,
} from "./engine";
import { mulberry32 } from "../random";
import { moveAnimationMs, TIMING } from "./timing";

// Partidas inteiras jogadas direto pelas funções do motor (sem controlador nem
// timers) com dados e escolhas aleatórias porém legais — conferindo, a CADA
// passo, as invariantes que as regras do Ludo prometem.

/** Asserção leve pros laços quentes (o expect do vitest, chamado milhões de vezes, estoura o tempo). */
function ensure(cond: boolean, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function newGame(players: number, rng: () => number): LudoState {
  let s = createLobby();
  const must = (r: { ok: true; state: LudoState } | { ok: false; error: string }) => {
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };
  s = must(joinLobby(s, { id: "p0", name: "P0" }));
  for (let i = 1; i < players; i++) s = must(addBot(s, "medium"));
  return must(startGame(s, rng));
}

/** Quem está em cada casa COMUM do anel: casa → (jogador → quantas peças). */
function occupancy(s: LudoState) {
  const byRing = new Map<number, Map<string, number>>();
  for (const p of s.players) {
    ensure(p.pieces.length === 4, "número de peças errado");
    for (const x of p.pieces) {
      ensure(x >= IN_BASE && x <= FINISHED, `progresso fora da faixa: ${x}`);
      if (!isOnRing(x)) continue;
      const ring = ringIndexOf(p.color, x);
      if (isSafeRingIndex(ring)) continue;
      const here = byRing.get(ring) ?? new Map<string, number>();
      here.set(p.id, (here.get(p.id) ?? 0) + 1);
      byRing.set(ring, here);
    }
  }
  return byRing;
}

/** Duas cores com UMA peça cada na mesma casa comum (sem barreira nenhuma). */
function loneCoexisting(byRing: Map<number, Map<string, number>>) {
  return new Set([...byRing].filter(([, here]) => here.size > 1 && [...here.values()].every((n) => n === 1)).map(([ring]) => ring));
}

/**
 * Captura só acontece quando uma peça CAI numa casa — então duas peças solitárias
 * de cores diferentes só dividem uma casa comum se isso nasceu de uma barreira
 * que se desfez (A em barreira + B pousou ali; A move uma peça e sobram A:1 e B:1).
 */
function expectBoardValid(s: LudoState, prev?: LudoState) {
  const now = occupancy(s);
  if (!prev) return;
  const before = occupancy(prev);
  const wasLone = loneCoexisting(before);
  for (const ring of loneCoexisting(now)) {
    if (wasLone.has(ring)) continue; // já era assim antes (ninguém pousou ali desde então)
    const hadBarrier = [...(before.get(ring)?.values() ?? [])].some((n) => n >= 2);
    ensure(hadBarrier, `casa ${ring}: duas peças solitárias de cores diferentes sem barreira desfeita`);
  }
}

function play(players: number, seed: number, smart: boolean) {
  const rng = mulberry32(seed);
  let s = newGame(players, rng);
  const stats = { turns: 0, captures: 0, sixes: 0, forfeits: 0, extraTurns: 0 };
  let guard = 0;
  let prev: LudoState | undefined;

  while (s.phase !== "game_over" && guard++ < 20000) {
    expectBoardValid(s, prev);
    prev = s;
    const me = s.players[s.turn];

    if (s.phase === "rolling") {
      const value = 1 + Math.floor(rng() * 6);
      const r = rollDice(s, me.id, value);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      if (value === 6) stats.sixes++;
      ensure(s.sixStreak <= 3, "sequência de 6 passou de 3");
      if (s.forfeit) {
        stats.forfeits++;
        ensure(legalMoves(s).length === 0, "perdeu a vez mas ainda tinha jogada");
        ensure(s.sixStreak === 3, "perdeu a vez sem ser o 3º seis");
      }
      continue;
    }

    // phase === "moving"
    const moves = legalMoves(s);
    const turnBefore = s.turn;
    const before = s;
    if (moves.length === 0) {
      const r = passTurn(s);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      // sem jogada: passa a vez — exceto um 6 (que dá nova rolada, menos o 3º seguido)
      if (before.dice === 6 && !before.forfeit) {
        ensure(s.turn === turnBefore && s.extraTurn === "six", "6 sem jogada deveria dar nova rolada");
      } else {
        ensure(s.turn === (turnBefore + 1) % players, "a vez deveria passar");
      }
    } else {
      const piece = smart ? chooseBotMove(s, "hard", rng)! : distinctMoves(moves)[Math.floor(rng() * distinctMoves(moves).length)].piece;
      const r = movePiece(s, me.id, piece);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      const lm = s.lastMove!;
      stats.captures += lm.captures.length;
      // jogar de novo só por 6, captura ou chegada em casa; senão a vez passa
      const extra = lm.dice === 6 || lm.captures.length > 0 || lm.finished;
      if (s.phase !== "game_over") {
        if (extra) {
          stats.extraTurns++;
          const reason = lm.captures.length ? "capture" : lm.finished ? "home" : "six";
          ensure(s.turn === turnBefore && s.extraTurn === reason, `jogada extra errada (${reason})`);
        } else {
          ensure(s.turn === (turnBefore + 1) % players && s.extraTurn === null, "turno normal deveria passar a vez");
        }
      }
      // uma peça em casa nunca sai de lá
      before.players.forEach((p, pi) => p.pieces.forEach((x, i) => ensure(x !== FINISHED || s.players[pi].pieces[i] === FINISHED, "peça em casa saiu de casa")));
      // capturadas voltam pra base
      for (const c of lm.captures) {
        ensure(s.players.find((p) => p.id === c.playerId)!.pieces[c.piece] === IN_BASE, "peça capturada não voltou pra base");
      }
    }
    stats.turns++;
  }
  return { s, stats };
}

describe("partidas completas pelo motor", () => {
  for (const players of [2, 3, 4]) {
    it(`${players} jogadores, 60 partidas aleatórias: sempre terminam com UM vencedor e o tabuleiro sempre válido`, () => {
      let captures = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const { s, stats } = play(players, seed * 13 + players, false);
        expect(s.phase, `seed ${seed} não terminou`).toBe("game_over");
        const winners = s.players.filter((p) => p.pieces.every((x) => x === FINISHED));
        expect(winners.map((p) => p.id)).toEqual([s.winnerId]);
        expect(s.standings![0].playerId).toBe(s.winnerId);
        expect(s.standings![0].finished).toBe(4);
        captures += stats.captures;
      }
      expect(captures).toBeGreaterThan(0); // capturas acontecem de verdade
    });
  }

  it("a mesma semente repete exatamente a mesma partida", () => {
    const a = play(4, 99, true).s;
    const b = play(4, 99, true).s;
    expect(a.winnerId).toBe(b.winnerId);
    expect(a.moveSeq).toBe(b.moveSeq);
    expect(a.players.map((p) => p.pieces)).toEqual(b.players.map((p) => p.pieces));
  });

  it("jogando com a IA difícil também termina e respeita todas as regras", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = play(4, seed * 17, true);
      expect(s.phase).toBe("game_over");
    }
  });

  it("os dados são justos: cada face sai perto de 1/6 das vezes", () => {
    const rng = mulberry32(2025);
    const counts = new Array(7).fill(0);
    const s = newGame(2, rng);
    let state = s;
    for (let i = 0; i < 6000; i++) {
      const me = state.players[state.turn];
      const value = 1 + Math.floor(rng() * 6);
      const r = rollDice({ ...state, phase: "rolling", dice: null }, me.id, value);
      if (!r.ok) throw new Error(r.error);
      counts[r.state.dice!]++;
      state = { ...state, turn: (state.turn + 1) % 2 };
    }
    for (let face = 1; face <= 6; face++) {
      expect(counts[face]).toBeGreaterThan(850);
      expect(counts[face]).toBeLessThan(1150);
    }
  });
});

describe("duração das animações (o servidor espera o cliente terminar)", () => {
  const move = (over: Partial<NonNullable<LudoState["lastMove"]>>): NonNullable<LudoState["lastMove"]> => ({
    seq: 1,
    playerId: "p0",
    piece: 0,
    from: 10,
    to: 14,
    dice: 4,
    captures: [],
    finished: false,
    ...over,
  });

  it("sem jogada, não espera nada", () => {
    expect(moveAnimationMs(null)).toBe(0);
  });

  it("andar custa um passo por casa; sair da base custa só a saída", () => {
    expect(moveAnimationMs(move({ from: 10, to: 14 }))).toBe(4 * TIMING.STEP_MS);
    expect(moveAnimationMs(move({ from: IN_BASE, to: 0, dice: 6 }))).toBe(TIMING.EXIT_MS);
  });

  it("captura e chegada em casa acrescentam o tempo dos efeitos", () => {
    const cap = move({ captures: [{ playerId: "p1", piece: 0, from: 20 }] });
    expect(moveAnimationMs(cap)).toBe(4 * TIMING.STEP_MS + TIMING.CAPTURE_MS);
    expect(moveAnimationMs(move({ from: 53, to: 56, dice: 3, finished: true }))).toBe(3 * TIMING.STEP_MS + TIMING.HOME_MS);
  });
});
