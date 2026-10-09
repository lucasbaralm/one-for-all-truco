import { describe, expect, it } from "vitest";
import { chooseBotMove } from "./bot";
import { IN_BASE, LudoColor } from "./board";
import { LudoState, createLobby, joinLobby, legalMoves, startGame } from "./engine";
import { mulberry32 } from "../random";

// A IA dos bots (bot.ts) decidindo em posições montadas à mão. Os pesos exatos
// podem mudar; o que está fixo aqui é a ORDEM de prioridade que dá sentido ao
// nível de cada bot.

/**
 * Partida pronta: vez do vermelho, dado `dice`, peças exatamente como pedido
 * (as cores que não aparecem em `pieces` ficam fora da partida).
 */
function position(pieces: Partial<Record<LudoColor, number[]>>, dice: number): LudoState {
  let s = createLobby();
  for (const color of Object.keys(pieces) as LudoColor[]) {
    const r = joinLobby(s, { id: color, name: color }, color);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  const started = startGame(s, () => 0);
  if (!started.ok) throw new Error(started.error);
  const state = started.state;
  return {
    ...state,
    phase: "moving",
    dice,
    turn: state.players.findIndex((p) => p.color === "red"),
    players: state.players.map((p) => ({ ...p, pieces: pieces[p.color] ?? p.pieces })),
  };
}

const ALWAYS = () => 0.5;

describe("escolhas básicas", () => {
  it("sem jogada possível não escolhe nada; com uma só, escolhe ela (em qualquer nível)", () => {
    const none = position({ red: [IN_BASE, IN_BASE, IN_BASE, IN_BASE], blue: [10, IN_BASE, IN_BASE, IN_BASE] }, 3);
    const one = position({ red: [10, IN_BASE, IN_BASE, IN_BASE], blue: [30, IN_BASE, IN_BASE, IN_BASE] }, 3);
    for (const level of ["easy", "medium", "hard"] as const) {
      expect(chooseBotMove(none, level, ALWAYS)).toBeNull();
      expect(chooseBotMove(one, level, ALWAYS)).toBe(0);
    }
  });

  it("nunca escolhe uma peça que não pode andar, em milhares de posições aleatórias", () => {
    const rng = mulberry32(77);
    const colors: LudoColor[] = ["red", "green", "blue", "yellow"];
    for (let i = 0; i < 1500; i++) {
      const pieces: Partial<Record<LudoColor, number[]>> = {};
      for (const c of colors) pieces[c] = Array.from({ length: 4 }, () => (rng() < 0.3 ? IN_BASE : Math.floor(rng() * 57)));
      const s = position(pieces, 1 + Math.floor(rng() * 6));
      const legal = new Set(legalMoves(s).map((m) => m.piece));
      for (const level of ["easy", "medium", "hard"] as const) {
        const choice = chooseBotMove(s, level, rng);
        if (legal.size === 0) expect(choice).toBeNull();
        else expect(legal.has(choice!), `${level} escolheu peça ilegal`).toBe(true);
      }
    }
  });
});

describe("nível fácil", () => {
  it("joga qualquer peça possível ao acaso (todas aparecem)", () => {
    const s = position({ red: [10, 20, 30, IN_BASE], blue: [45, IN_BASE, IN_BASE, IN_BASE] }, 2);
    const rng = mulberry32(5);
    const counts = new Map<number, number>();
    for (let i = 0; i < 600; i++) {
      const piece = chooseBotMove(s, "easy", rng)!;
      counts.set(piece, (counts.get(piece) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([0, 1, 2]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(130); // ≈ 200 cada
  });
});

describe("níveis médio e difícil — prioridades", () => {
  for (const level of ["medium", "hard"] as const) {
    describe(level, () => {
      it("tirar peça da base com 6 vale mais que andar com outra", () => {
        const s = position({ red: [IN_BASE, 10, IN_BASE, IN_BASE], blue: [40, IN_BASE, IN_BASE, IN_BASE] }, 6);
        expect([0, 2, 3]).toContain(chooseBotMove(s, level, mulberry32(1)));
      });

      it("chegar em casa vale mais que andar", () => {
        const s = position({ red: [53, 10, IN_BASE, IN_BASE], blue: [40, IN_BASE, IN_BASE, IN_BASE] }, 3);
        expect(chooseBotMove(s, level, mulberry32(2))).toBe(0);
      });

      it("capturar uma peça adversária vale mais que andar", () => {
        // vermelho 17 + 3 = casa 20 do anel = azul no progresso 46 (sozinha, fora de casa segura)
        const s = position({ red: [17, 30, IN_BASE, IN_BASE], blue: [46, IN_BASE, IN_BASE, IN_BASE] }, 3);
        expect(chooseBotMove(s, level, mulberry32(3))).toBe(0);
      });

      it("prefere cair numa casa segura (estrela) a andar numa casa comum", () => {
        // 5 + 3 = 8 (estrela do vermelho); a outra peça só andaria numa casa comum
        const s = position({ red: [5, 20, IN_BASE, IN_BASE], blue: [IN_BASE, IN_BASE, IN_BASE, IN_BASE] }, 3);
        for (let seed = 0; seed < 25; seed++) expect(chooseBotMove(s, level, mulberry32(seed))).toBe(0);
      });

      it("não captura em casa segura (não há o que capturar ali) — joga normal", () => {
        // estrela do vermelho = casa 8; azul no progresso 34 também está na casa 8
        const s = position({ red: [5, 30, IN_BASE, IN_BASE], blue: [34, IN_BASE, IN_BASE, IN_BASE] }, 3);
        const choice = chooseBotMove(s, level, mulberry32(4));
        expect([0, 1]).toContain(choice);
      });
    });
  }
});

describe("nível difícil — enxerga o perigo", () => {
  it("foge com a peça que está na mira de um adversário", () => {
    // azul no progresso 44 está na casa 18 do anel, 2 casas atrás da peça vermelha em 20
    const s = position({ red: [20, 30, IN_BASE, IN_BASE], blue: [44, IN_BASE, IN_BASE, IN_BASE] }, 5);
    for (let seed = 0; seed < 30; seed++) expect(chooseBotMove(s, "hard", mulberry32(seed))).toBe(0);
  });

  it("não para logo na frente de um adversário quando tem outra jogada segura", () => {
    // azul na casa 12 (progresso 38): andar 10→14 deixaria a peça 2 casas à frente dele (casa comum);
    // a outra (28→32) fica longe de todo mundo
    const s = position({ red: [10, 28, IN_BASE, IN_BASE], blue: [38, IN_BASE, IN_BASE, IN_BASE] }, 4);
    for (let seed = 0; seed < 30; seed++) expect(chooseBotMove(s, "hard", mulberry32(seed))).toBe(1);
  });

  it("ficar em barreira (duas peças juntas) conta como seguro", () => {
    // a peça de 20 andando 4 se junta à de 24 (casa comum) e as duas ficam protegidas, mesmo
    // com o azul logo atrás (casa 18); andar com a de 24 deixaria a de 20 sozinha na mira
    const s = position({ red: [20, 24, IN_BASE, IN_BASE], blue: [44, IN_BASE, IN_BASE, IN_BASE] }, 4);
    for (let seed = 0; seed < 30; seed++) expect(chooseBotMove(s, "hard", mulberry32(seed))).toBe(0);
  });
});
