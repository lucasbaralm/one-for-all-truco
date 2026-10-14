import { describe, expect, it } from "vitest";
import { Card } from "./rules";
import { diffFodinha, fmtCard } from "./feed";
import { GameState, handleBet, handlePlayCard, startNextRound } from "./state-machine";
import { createTestState } from "./testHelpers";

const ctx = { me: "ana" };
const c = (value: Card["value"], suit: Card["suit"]): Card => ({ value, suit });

/** 3 jogadores, 2 cartas cada, vira 4♦ (manilha 5), pronto pra apostar. */
function betting(): GameState {
  return createTestState({
    vira: c("4", "diamonds"),
    phase: "betting",
    dealerIndex: 2, // quem aposta e joga primeiro é o seguinte ao dealer: a ana
    hands: [
      { id: "ana", name: "ana", cards: [c("3", "clubs"), c("7", "hearts")] },
      { id: "beto", name: "beto", cards: [c("5", "spades"), c("Q", "hearts")] },
      { id: "cris", name: "cris", cards: [c("6", "clubs"), c("K", "hearts")] },
    ],
  });
}

describe("fmtCard", () => {
  it("valor + naipe", () => {
    expect(fmtCard(c("7", "spades"))).toBe("7♠");
    expect(fmtCard(c("A", "hearts"))).toBe("A♥");
    expect(fmtCard(c("Q", "diamonds"))).toBe("Q♦");
    expect(fmtCard(c("3", "clubs"))).toBe("3♣");
  });
});

describe("diffFodinha", () => {
  it("primeira tela e mesa vazia não geram histórico", () => {
    expect(diffFodinha(null, betting(), ctx)).toMatchObject({ reset: true, items: [] });
    expect(diffFodinha(betting(), { ...betting(), phase: "waiting" }, ctx)).toMatchObject({ reset: true, items: [] });
  });

  it("primeira tela embaralhando diz a rodada e quem dá; em outras fases não inventa nada", () => {
    const shuffling: GameState = { ...betting(), phase: "shuffling", vira: null, dealerIndex: 1 };
    const d = diffFodinha(null, shuffling, ctx);
    expect(d.reset).toBe(true);
    expect(d.items.map((i) => i.text)).toEqual([`🃏 Rodada de ${shuffling.currentRoundCards} cartas — beto dá as cartas`]);
    expect(diffFodinha(null, { ...shuffling, dealerIndex: 0 }, ctx).items[0].text).toContain("você dá");
    expect(diffFodinha(null, betting(), ctx).items).toEqual([]);
  });

  it("rodada nova anuncia quantas cartas e quem dá", () => {
    const round = startNextRound({ ...betting(), phase: "round_end" });
    const d = diffFodinha({ ...betting(), phase: "round_end" }, round, ctx);
    expect(d.items.map((i) => i.text)).toEqual([`🃏 Rodada de ${round.currentRoundCards} cartas — ${round.players[round.dealerIndex].name === "ana" ? "você dá" : `${round.players[round.dealerIndex].name} dá`} as cartas`]);
    expect(d.reset).toBe(false);
  });

  it("cartas dadas mostram o vira e a manilha, com o som de dar as cartas", () => {
    const shuffling: GameState = { ...betting(), phase: "shuffling", vira: null };
    const d = diffFodinha(shuffling, betting(), ctx);
    expect(d.items.map((i) => i.text)).toEqual(["🂠 Vira 4♦ — a manilha é o 5"]);
    expect(d.cues).toEqual(["deal"]);
  });

  it("apostas: 'Você apostou' pra mim, o nome pros outros, um som só", () => {
    const s0 = betting();
    const s1 = handleBet(s0, "ana", 1);
    expect(diffFodinha(s0, s1, ctx).items.map((i) => i.text)).toEqual(["💭 Você apostou 1"]);
    const s2 = handleBet(s1, "beto", 0);
    const d = diffFodinha(s1, s2, ctx);
    expect(d.items.map((i) => i.text)).toEqual(["💭 beto apostou 0"]);
    expect(d.cues).toEqual(["bet"]);
    expect(diffFodinha(s2, s2, ctx).items).toEqual([]);
  });

  it("cartas jogadas entram; a vaza fechada diz quem levou (e o som é diferente se fui eu)", () => {
    let s = betting();
    for (const [id, bet] of [["ana", 1], ["beto", 0], ["cris", 0]] as const) s = handleBet(s, id, bet);
    expect(s.phase).toBe("playing");

    const afterAna = handlePlayCard(s, "ana", 0); // 3♣
    expect(diffFodinha(s, afterAna, ctx).items.map((i) => i.text)).toEqual(["🎴 Você jogou 3♣"]);

    const afterBeto = handlePlayCard(afterAna, "beto", 0); // 5♠ = manilha
    const afterCris = handlePlayCard(afterBeto, "cris", 0); // 6♣; beto leva com a manilha
    const d = diffFodinha(afterBeto, afterCris, ctx);
    expect(d.items.map((i) => i.text)).toEqual(["🎴 cris jogou 6♣", "🏆 beto levou a vaza"]);
    expect(d.cues).toEqual(["play", "trick"]);
  });

  it("fim da rodada: quem acertou, quem errou e quantos pontos levou", () => {
    const base = createTestState({
      vira: c("4", "diamonds"),
      hands: [
        { id: "ana", name: "ana", cards: [c("3", "clubs")], bet: 1 },
        { id: "beto", name: "beto", cards: [c("7", "spades")], bet: 1 },
        { id: "cris", name: "cris", cards: [c("6", "clubs")], bet: 0 },
      ],
    });
    // ana joga o 3♣ (mais forte): leva a vaza e acerta; beto e cris jogam
    let s = handlePlayCard(base, "ana", 0);
    s = handlePlayCard(s, "beto", 0);
    s = handlePlayCard(s, "cris", 0);
    expect(s.phase).toBe("round_end");
    const d = diffFodinha(base, s, ctx);
    expect(d.roundResults).toEqual([
      { name: "ana", hit: true },
      { name: "beto", hit: false },
      { name: "cris", hit: true },
    ]);
    const texts = d.items.map((i) => i.text);
    expect(texts).toContain("✅ Acertaram: Você, cris");
    expect(texts).toContain("❌ beto errou: apostou 1, fez 0 (+1 ponto 💀)");
    expect(d.cues).toContain("hit");
    // o mesmo estado de novo não repete o resultado
    expect(diffFodinha(s, s, ctx).roundResults).toBeNull();
  });

  it("errei: linha ruim pra mim e som de erro", () => {
    const base = createTestState({
      vira: c("4", "diamonds"),
      hands: [
        { id: "ana", name: "ana", cards: [c("4", "clubs")], bet: 1 },
        { id: "beto", name: "beto", cards: [c("7", "spades")], bet: 0 },
      ],
    });
    let s = handlePlayCard(base, "ana", 0);
    s = handlePlayCard(s, "beto", 0); // 7♠ vence o 4♣
    const d = diffFodinha(base, s, ctx);
    const mine = d.items.find((i) => i.text.startsWith("❌ Você"))!;
    expect(mine.text).toBe("❌ Você errou: apostou 1, fez 0 (+1 ponto 💀)");
    expect(mine.tone).toBe("bad");
    expect(d.cues).toContain("miss");
  });

  it("fim de jogo: menos pontos vence", () => {
    const s = createTestState({
      vira: c("4", "diamonds"),
      hands: [
        { id: "ana", name: "ana", cards: [], score: 7 },
        { id: "beto", name: "beto", cards: [], score: 3 },
      ],
    });
    const over: GameState = { ...s, phase: "game_over" };
    const d = diffFodinha(s, over, ctx);
    expect(d.items.map((i) => i.text)).toEqual(["🏁 Fim de jogo — beto venceu!"]);
    expect(d.cues).toEqual(["over"]);
    const mine = diffFodinha({ ...s, players: s.players.map((p) => ({ ...p, score: p.id === "ana" ? 1 : 3 })) }, { ...over, players: s.players.map((p) => ({ ...p, score: p.id === "ana" ? 1 : 3 })) }, ctx);
    expect(mine.items[0].text).toBe("🏁 Fim de jogo — você venceu!");
  });

  it("partida nova depois do fim de jogo zera a lista", () => {
    const s = betting();
    const over: GameState = { ...s, phase: "game_over" };
    expect(diffFodinha(over, { ...s, phase: "shuffling", currentRoundCards: 1 }, ctx).reset).toBe(true);
  });

  it("votos pra encerrar", () => {
    const s = betting();
    const voted: GameState = { ...s, endVote: { votes: ["beto"] } };
    expect(diffFodinha(s, voted, ctx).items.map((i) => i.text)).toEqual(["🚩 beto votou pra encerrar a partida"]);
    expect(diffFodinha(voted, voted, ctx).items).toEqual([]);
  });
});
