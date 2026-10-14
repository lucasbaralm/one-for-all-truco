import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "./cards";
import { DobbleState, advanceRound, beginPlay, claim, createLobby, joinLobby, matchFor, setMode, startGame } from "./engine";

// Tempo de reação e estatísticas da partida (tela de fim de jogo e histórico) —
// medidos no relógio do servidor, sem mexer em nenhuma regra.

const unwrap = (r: { ok: true; state: DobbleState } | { ok: false; error: string }): DobbleState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

function started(mode: "tower" | "well" = "tower"): DobbleState {
  let s = createLobby();
  for (const id of ["ana", "beto"]) s = unwrap(joinLobby(s, { id, name: id }));
  s = unwrap(setMode(s, mode));
  return unwrap(startGame(s));
}

/** A primeira rodada abre em t=1000. */
const playing = (mode: "tower" | "well" = "tower") => unwrap(beginPlay(started(mode), 1000));

const wrongSymbolFor = (s: DobbleState, id: string) => {
  const hand = s.players.find((p) => p.id === id)!.hand!;
  const right = matchFor(s, id);
  return ALL_CARDS[hand].find((x) => x !== right)!;
};

describe("tempo de reação", () => {
  it("a rodada guarda a hora em que abriu; o acerto leva o tempo desde então", () => {
    const s = playing();
    expect(s.roundStartedAt).toBe(1000);
    const won = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 1850));
    expect(won.lastClaim?.reactionMs).toBe(850);
  });

  it("a rodada seguinte conta do zero (a partir de quando ela abriu)", () => {
    const s = playing();
    const won = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 1850));
    const next = unwrap(advanceRound(won, 4000));
    expect(next.roundStartedAt).toBe(4000);
    const again = unwrap(claim(next, "beto", matchFor(next, "beto")!, next.round, 4300));
    expect(again.lastClaim?.reactionMs).toBe(300);
  });

  it("sem hora de abertura conhecida (sala antiga) o tempo fica em branco, não inventado", () => {
    const s = unwrap(beginPlay(started())); // sem relógio
    expect(s.roundStartedAt).toBe(0);
    const won = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 5000));
    expect(won.lastClaim?.reactionMs).toBeNull();
  });

  it("vale também no Poço", () => {
    const s = playing("well");
    const won = unwrap(claim(s, "beto", matchFor(s, "beto")!, s.round, 1400));
    expect(won.lastClaim?.reactionMs).toBe(400);
    expect(unwrap(advanceRound(won, 3000)).roundStartedAt).toBe(3000);
  });
});

describe("estatísticas", () => {
  it("começam vazias a cada partida", () => {
    expect(started().stats).toEqual({});
  });

  it("acertos, erros e melhor tempo de cada jogador", () => {
    let s = playing();
    s = unwrap(claim(s, "beto", wrongSymbolFor(s, "beto"), s.round, 1200)); // erro
    s = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 1900)); // ana ganha em 900ms
    expect(s.stats!.ana).toEqual({ won: 1, wrong: 0, fastestMs: 900 });
    expect(s.stats!.beto).toEqual({ won: 0, wrong: 1, fastestMs: null });

    s = unwrap(advanceRound(s, 3000));
    s = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 3400)); // mais rápido: 400ms
    s = unwrap(advanceRound(s, 5000));
    s = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 6200)); // mais lento: não substitui o melhor
    expect(s.stats!.ana).toEqual({ won: 3, wrong: 0, fastestMs: 400 });
  });

  it("o fim de jogo leva os números na classificação (zerados pra quem nunca ganhou nem errou)", () => {
    // Torre com o monte de sobra vazio: a primeira rodada ganha já encerra a partida
    let s = playing();
    s = { ...s, draw: [] };
    s = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 1500));
    s = unwrap(advanceRound(s, 3000));
    expect(s.phase).toBe("game_over");
    expect(s.standings![0]).toMatchObject({ playerId: "ana", won: 1, wrong: 0, fastestMs: 500 });
    expect(s.standings![1]).toMatchObject({ playerId: "beto", won: 0, wrong: 0, fastestMs: null });
  });

  it("salas salvas antes do campo existir (stats ausente) continuam funcionando", () => {
    const s = playing();
    delete s.stats;
    const won = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 1500));
    expect(won.stats!.ana.won).toBe(1);
  });
});
