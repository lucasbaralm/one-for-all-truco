import { describe, expect, it } from "vitest";
import { IN_BASE } from "@/lib/ludo/board";
import { LudoState, createLobby, joinLobby, legalMoves, movePiece, rollDice, startGame } from "@/lib/ludo/engine";
import { pieceKey, planTransition, snapshot } from "./useLudoAnimator";

// O animador toca os estados que chegam do servidor em ordem (dado girando,
// peça pulando casa por casa). A DECISÃO de como tocar cada um é esta função
// pura — testada com estados reais do motor, em vez de mocks.

function started(): LudoState {
  let s = createLobby();
  for (const color of ["red", "blue"] as const) {
    const r = joinLobby(s, { id: color, name: color }, color);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  const r = startGame(s, () => 0); // vez do vermelho
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const must = (r: { ok: true; state: LudoState } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("planTransition", () => {
  const s0 = started();
  const rolled = must(rollDice(s0, "red", 6)); // rollSeq +1
  const moved = must(movePiece(rolled, "red", legalMoves(rolled)[0].piece)); // moveSeq +1

  it("a rolada seguinte vira animação de dado; a jogada seguinte, animação de peça", () => {
    expect(planTransition(s0, rolled, false)).toBe("roll");
    expect(planTransition(rolled, moved, false)).toBe("move");
  });

  it("primeira tela (sem estado anterior) e aba escondida pulam direto", () => {
    expect(planTransition(null, rolled, false)).toBe("snapshot");
    expect(planTransition(s0, rolled, true)).toBe("snapshot");
    expect(planTransition(rolled, moved, true)).toBe("snapshot");
  });

  it("outra partida e qualquer coisa envolvendo o lobby pulam direto", () => {
    expect(planTransition(rolled, { ...rolled, gameNumber: rolled.gameNumber + 1 }, false)).toBe("snapshot");
    expect(planTransition(rolled, { ...rolled, phase: "lobby" }, false)).toBe("snapshot");
    expect(planTransition({ ...rolled, phase: "lobby" }, moved, false)).toBe("snapshot");
  });

  it("contadores que pularam (reconexão, aba voltando) não tentam animar o que ficou pelo caminho", () => {
    const twoRolls = { ...rolled, rollSeq: s0.rollSeq + 2 };
    expect(planTransition(s0, twoRolls, false)).toBe("snapshot");
    const twoMoves = { ...moved, moveSeq: rolled.moveSeq + 2 };
    expect(planTransition(rolled, twoMoves, false)).toBe("snapshot");
  });

  it("mudança que não é rolada nem jogada (alguém desconectou, bot mudou de nível) só atualiza", () => {
    const sameButConnected = { ...s0, players: s0.players.map((p) => ({ ...p, connected: false })) };
    expect(planTransition(s0, sameButConnected, false)).toBe("snapshot");
  });

  it("contador +1 sem os dados da jogada/rolada também não anima (nada pra desenhar)", () => {
    expect(planTransition(s0, { ...rolled, lastRoll: null }, false)).toBe("snapshot");
    expect(planTransition(rolled, { ...moved, lastMove: null }, false)).toBe("snapshot");
  });
});

describe("snapshot", () => {
  it("monta a tela direto do estado: posições das peças, dado e nada em andamento", () => {
    const s = must(rollDice(started(), "red", 4));
    const view = snapshot(s);
    expect(view.state).toBe(s);
    expect(view.pieces.red).toEqual([IN_BASE, IN_BASE, IN_BASE, IN_BASE]);
    expect(view.dice).toBe(4);
    expect(view.diceKey).toBe(s.rollSeq);
    expect(view).toMatchObject({ diceRolling: false, busy: false, hop: null, effects: [] });
  });

  it("toda peça começa 'sem animação' (snap), então reconectar não faz as peças voarem pelo tabuleiro", () => {
    const view = snapshot(started());
    expect(Object.values(view.motion)).toHaveLength(8);
    expect(Object.values(view.motion).every((m) => m === "snap")).toBe(true);
  });

  it("sem estado ainda, a tela vazia é válida", () => {
    expect(snapshot(null)).toMatchObject({ state: null, pieces: {}, dice: null, busy: false });
  });

  it("não compartilha os arrays de peças com o estado (animar não pode mexer no estado)", () => {
    const s = started();
    const view = snapshot(s);
    view.pieces.red[0] = 99;
    expect(s.players.find((p) => p.id === "red")!.pieces[0]).toBe(IN_BASE);
  });
});

describe("pieceKey", () => {
  it("chaves únicas por jogador e peça", () => {
    const keys = new Set(["red", "blue"].flatMap((id) => [0, 1, 2, 3].map((i) => pieceKey(id, i))));
    expect(keys.size).toBe(8);
  });
});
