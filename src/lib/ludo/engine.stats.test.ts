import { describe, expect, it } from "vitest";
import { FINISHED, IN_BASE, LudoColor } from "./board";
import { LudoState, createLobby, joinLobby, movePiece, rollDice, startGame } from "./engine";

// Estatísticas da partida (aparecem na tela de fim de jogo): contam rolagens,
// seis, capturas feitas e peças perdidas — sem mexer em nenhuma regra.

function game(pieces: Partial<Record<LudoColor, number[]>>): LudoState {
  let s = createLobby();
  for (const color of Object.keys(pieces) as LudoColor[]) {
    const r = joinLobby(s, { id: color, name: color }, color);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  const started = startGame(s, () => 0);
  if (!started.ok) throw new Error(started.error);
  return {
    ...started.state,
    turn: started.state.players.findIndex((p) => p.color === "red"),
    players: started.state.players.map((p) => ({ ...p, pieces: pieces[p.color] ?? p.pieces })),
  };
}
const must = (r: { ok: true; state: LudoState } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const B = IN_BASE;

describe("estatísticas do Ludo", () => {
  it("começam zeradas a cada partida", () => {
    const s = game({ red: [B, B, B, B], blue: [B, B, B, B] });
    expect(s.stats).toEqual({});
  });

  it("contam rolagens e seis de cada jogador", () => {
    let s = game({ red: [B, B, B, B], blue: [B, B, B, B] });
    s = must(rollDice(s, "red", 6));
    expect(s.stats!.red).toEqual({ rolls: 1, sixes: 1, captures: 0, captured: 0 });
    s = must(movePiece(s, "red", 0)); // 6 dá outra rolada
    s = must(rollDice(s, "red", 2));
    expect(s.stats!.red).toEqual({ rolls: 2, sixes: 1, captures: 0, captured: 0 });
    expect(s.stats!.blue).toBeUndefined();
  });

  it("captura conta pra quem capturou e pra quem perdeu a peça", () => {
    // vermelho em 17 + 3 = 20, onde a azul (progresso 46) está sozinha
    let s = game({ red: [17, B, B, B], blue: [46, B, B, B] });
    s = must(rollDice(s, "red", 3));
    s = must(movePiece(s, "red", 0));
    expect(s.lastMove!.captures).toHaveLength(1);
    expect(s.stats!.red.captures).toBe(1);
    expect(s.stats!.blue.captured).toBe(1);
    expect(s.stats!.blue.captures).toBe(0);
    expect(s.stats!.red.captured).toBe(0);
  });

  it("jogada sem captura não mexe nas capturas", () => {
    let s = game({ red: [10, B, B, B], blue: [B, B, B, B] });
    s = must(rollDice(s, "red", 3));
    s = must(movePiece(s, "red", 0));
    expect(s.stats!.red.captures).toBe(0);
  });

  it("o fim de jogo leva os números junto na classificação", () => {
    // vermelho com 3 peças em casa e a última a 2 casas de chegar
    let s = game({ red: [FINISHED, FINISHED, FINISHED, 54], blue: [46, B, B, B] });
    s = { ...s, stats: { red: { rolls: 9, sixes: 2, captures: 1, captured: 3 } } };
    s = must(rollDice(s, "red", 2));
    s = must(movePiece(s, "red", 3));
    expect(s.phase).toBe("game_over");
    expect(s.standings![0]).toMatchObject({ playerId: "red", rolls: 10, sixes: 2, captures: 1, captured: 3 });
    // quem não tem número nenhum aparece zerado, não "undefined"
    expect(s.standings![1]).toMatchObject({ playerId: "blue", rolls: 0, sixes: 0, captures: 0, captured: 0 });
  });

  it("salas salvas antes do campo existir (stats ausente) continuam funcionando", () => {
    let s = game({ red: [B, B, B, B], blue: [B, B, B, B] });
    delete s.stats;
    s = must(rollDice(s, "red", 5));
    expect(s.stats!.red.rolls).toBe(1);
  });
});
