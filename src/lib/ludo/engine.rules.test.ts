import { describe, expect, it } from "vitest";
import { FINISHED, IN_BASE, LudoColor } from "./board";
import { LudoState, createLobby, joinLobby, legalMoves, movePiece, passTurn, rollDice, startGame } from "./engine";

// Cantos das regras do Ludo, um por um (engine.test.ts cobre o caminho feliz).

/** Partida entre as cores pedidas, vez do vermelho, peças exatamente como pedido. */
function game(pieces: Partial<Record<LudoColor, number[]>>, extra: Partial<LudoState> = {}): LudoState {
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
    turn: state.players.findIndex((p) => p.color === "red"),
    players: state.players.map((p) => ({ ...p, pieces: pieces[p.color] ?? p.pieces })),
    ...extra,
  };
}
const must = (r: { ok: true; state: LudoState } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const roll = (s: LudoState, v: number, id = "red") => must(rollDice(s, id, v));
const move = (s: LudoState, piece: number, id = "red") => must(movePiece(s, id, piece));
const B = IN_BASE;

describe("barreiras", () => {
  it("cair numa barreira adversária não captura ninguém — as peças dividem a casa", () => {
    // casa 20 do anel = azul no progresso 46; duas azuis ali formam barreira
    const s = move(roll(game({ red: [17, B, B, B], blue: [46, 46, B, B] }), 3), 0);
    expect(s.players[0].pieces[0]).toBe(20);
    expect(s.players[1].pieces.slice(0, 2)).toEqual([46, 46]);
    expect(s.lastMove!.captures).toEqual([]);
    expect(s.extraTurn).toBeNull();
    expect(s.players[s.turn].id).toBe("blue"); // a vez passa normalmente
  });

  it("uma peça solitária na casa ao lado da barreira continua capturável", () => {
    const s = move(roll(game({ red: [17, B, B, B], blue: [46, B, B, B] }), 3), 0);
    expect(s.lastMove!.captures).toHaveLength(1);
  });

  it("duas peças minhas juntas viram barreira pros outros: quem pousa em cima não captura", () => {
    // vermelho em barreira na casa 20; azul (progresso 44 = casa 18) cai nela com 2
    const s = move(roll(game({ red: [20, 20, B, B], blue: [44, B, B, B] }, { turn: 1 }), 2, "blue"), 0, "blue"); // vez do azul (índice 1)
    expect(s.players[1].pieces[0]).toBe(46);
    expect(s.players.find((p) => p.id === "red")!.pieces.slice(0, 2)).toEqual([20, 20]);
    expect(s.lastMove!.captures).toEqual([]);
  });
});

describe("casas seguras e bases", () => {
  it("sair da base pra uma casa de saída ocupada por um adversário: os dois ficam lá (casa segura)", () => {
    // a saída do vermelho é a casa 0; azul no progresso 26 está nela
    const s = move(roll(game({ red: [B, B, B, B], blue: [26, B, B, B] }), 6), 0);
    expect(s.players[0].pieces[0]).toBe(0);
    expect(s.players[1].pieces[0]).toBe(26);
    expect(s.lastMove!.captures).toEqual([]);
  });

  it("peça na reta final não pode ser capturada nem capturar (casas só da própria cor)", () => {
    const s = move(roll(game({ red: [49, B, B, B], blue: [B, B, B, B], green: [B, B, B, B] }), 3), 0);
    expect(s.players[0].pieces[0]).toBe(52); // entrou na reta final
    expect(s.lastMove!.captures).toEqual([]);
  });
});

describe("jogar de novo e três seis", () => {
  it("captura com um 6 mantém a contagem de seis seguidos (o terceiro 6 ainda perde a vez)", () => {
    // 1º 6: sai da base; 2º 6: captura; 3º 6: perde a vez
    let s = game({ red: [B, 14, B, B], blue: [46, B, B, B] });
    s = move(roll(s, 6), 0); // sai da base (6 nº 1)
    expect(s.sixStreak).toBe(1);
    // peça em 14 + 6 = 20 captura a azul (progresso 46 na casa 20)
    s = move(roll(s, 6), 1);
    expect(s.lastMove!.captures).toHaveLength(1);
    expect(s.extraTurn).toBe("capture");
    expect(s.sixStreak).toBe(2); // captura num 6 NÃO zera a sequência
    s = roll(s, 6);
    expect(s.forfeit).toBe(true);
    expect(legalMoves(s)).toEqual([]);
    expect(must(passTurn(s)).players[must(passTurn(s)).turn].id).toBe("blue");
  });

  it("captura num número comum zera a sequência (jogar de novo, mas do zero)", () => {
    let s = game({ red: [B, 17, B, B], blue: [46, B, B, B] });
    s = move(roll(s, 6), 0); // 6 nº 1 (sai da base)
    s = move(roll(s, 3), 1); // 17 + 3 = 20: captura num 3
    expect(s.extraTurn).toBe("capture");
    expect(s.sixStreak).toBe(0);
  });

  it("um 6 em que não dá pra mexer nada ainda soma na sequência dos seis", () => {
    // todas as peças em casa menos uma que precisa de 1: o 6 não serve pra nada
    let s = game({ red: [FINISHED, FINISHED, FINISHED, 55], blue: [B, B, B, B] });
    s = roll(s, 6);
    expect(legalMoves(s)).toEqual([]);
    s = must(passTurn(s));
    expect(s.extraTurn).toBe("six");
    expect(s.sixStreak).toBe(1);
  });
});

describe("chegar em casa", () => {
  it("exige o número exato: passar do fim não é jogada", () => {
    const s = roll(game({ red: [55, B, B, B], blue: [B, B, B, B] }), 2);
    expect(legalMoves(s)).toEqual([]);
    expect(legalMoves(roll(game({ red: [55, B, B, B], blue: [B, B, B, B] }), 1)).map((m) => m.to)).toEqual([FINISHED]);
  });

  it("peça que já chegou nunca mais é jogável, em nenhum número", () => {
    for (let dice = 1; dice <= 6; dice++) {
      const s = roll(game({ red: [FINISHED, 10, B, B], blue: [B, B, B, B] }), dice);
      expect(legalMoves(s).some((m) => m.piece === 0)).toBe(false);
    }
  });
});

describe("classificação ao fim do jogo", () => {
  it("ordena por peças em casa e, no empate, por quem andou mais", () => {
    const s = move(
      roll(game({ red: [FINISHED, FINISHED, FINISHED, 54], blue: [FINISHED, FINISHED, 40, B], green: [FINISHED, FINISHED, 20, B] }), 2),
      3
    );
    expect(s.phase).toBe("game_over");
    expect(s.standings!.map((x) => x.playerId)).toEqual(["red", "blue", "green"]);
    expect(s.standings!.map((x) => x.finished)).toEqual([4, 2, 2]);
    expect(s.standings![1].progress).toBeGreaterThan(s.standings![2].progress);
  });
});
