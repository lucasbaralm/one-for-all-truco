import { afterEach, describe, expect, it, vi } from "vitest";
import { GameState, createInitialState, handleBet, handlePlayCard, handleShuffleAndDeal, startNextRound } from "./state-machine";
import { mulberry32 } from "../random";

// Partidas INTEIRAS jogadas por "jogadores" que escolhem ações legais
// aleatórias (com semente — repetível), de 2 a 8 mesas. A cada passo conferimos
// as invariantes do jogo: cartas únicas, contas das vazas, dano por aposta
// errada, rodízio do dealer e o fim exatamente quando o baralho não aguenta mais.

afterEach(() => vi.restoreAllMocks());

const cardKey = (c: { suit: string; value: string }) => `${c.suit}-${c.value}`;

function expectValid(s: GameState) {
  // No fim da rodada a última vaza continua na mesa (o servidor a segura pra todo
  // mundo ver) E já conta como ganha — então ali a mesa não entra na conta.
  const onTable = s.phase === "round_end" ? [] : s.tableCards.map((t) => t.card);
  const cards = [...s.players.flatMap((p) => p.cards), ...onTable, ...s.players.flatMap((p) => p.wonCards.flat())];
  if (s.vira) cards.push(s.vira);
  const keys = cards.map(cardKey);
  expect(new Set(keys).size, "carta repetida").toBe(keys.length);
  expect(s.currentPlayerIndex).toBeGreaterThanOrEqual(0);
  expect(s.currentPlayerIndex).toBeLessThan(s.players.length);
}

/** Uma aposta legal qualquer (respeitando a regra do fechamento). */
function legalBet(s: GameState, rng: () => number): number {
  const me = s.players[s.currentPlayerIndex];
  const isClosing = s.players.filter((p) => p.bet === null).length === 1;
  const forbidden = isClosing ? s.currentRoundCards - s.players.reduce((sum, p) => sum + (p.bet ?? 0), 0) : -1;
  const options: number[] = [];
  for (let i = 0; i <= me.cards.length; i++) if (i !== forbidden) options.push(i);
  return options[Math.floor(rng() * options.length)];
}

function playFullGame(playerCount: number, seed: number) {
  const rng = mulberry32(seed);
  vi.spyOn(Math, "random").mockImplementation(mulberry32(seed * 31 + 1));

  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  let s = createInitialState(players);
  const rounds: { cards: number; dealer: number; scoreDelta: number[] }[] = [];

  s = startNextRound(s);
  let guard = 0;
  while (s.phase !== "game_over" && guard++ < 20000) {
    expectValid(s);
    const actor = s.players[s.currentPlayerIndex];

    if (s.phase === "shuffling") {
      const next = handleShuffleAndDeal(s, actor.id, "random");
      expect(next.phase).toBe("betting");
      // cada um recebeu a quantidade da rodada, e sobrou um vira
      expect(next.players.every((p) => p.cards.length === s.currentRoundCards)).toBe(true);
      expect(next.vira).not.toBeNull();
      s = next;
    } else if (s.phase === "betting") {
      const bet = legalBet(s, rng);
      const next = handleBet(s, actor.id, bet);
      expect(next, `aposta legal ${bet} foi recusada`).not.toBe(s);
      s = next;
    } else if (s.phase === "playing") {
      s = handlePlayCard(s, actor.id, Math.floor(rng() * actor.cards.length));
    } else if (s.phase === "round_end") {
      // fecha as contas da rodada ANTES de avançar
      const tricksTotal = s.players.reduce((n, p) => n + p.tricks, 0);
      expect(tricksTotal, "vazas ganhas ≠ cartas da rodada").toBe(s.currentRoundCards);
      rounds.push({
        cards: s.currentRoundCards,
        dealer: s.dealerIndex,
        scoreDelta: s.players.map((p) => (p.bet !== null && p.bet !== p.tricks ? Math.abs(p.bet - p.tricks) : 0)),
      });
      s = startNextRound(s);
    }
  }
  return { final: s, rounds };
}

describe("partidas completas, de 2 a 8 jogadores", () => {
  for (let n = 2; n <= 8; n++) {
    it(`${n} jogadores: termina, com todas as rodadas e contas certas`, () => {
      const { final, rounds } = playFullGame(n, 100 + n);
      expect(final.phase).toBe("game_over");

      // o baralho de 40 sustenta floor(39 / n) cartas por jogador (sobra 1 pro vira)
      const maxCards = Math.floor(39 / n);
      expect(rounds.map((r) => r.cards)).toEqual(Array.from({ length: maxCards }, (_, i) => i + 1));

      // o dealer roda um assento por rodada, começando no host (índice 0)
      rounds.forEach((r, i) => expect(r.dealer).toBe(i % n));

      // o placar final é a soma exata do dano de cada rodada (nunca negativo)
      const expected = Array.from({ length: n }, (_, p) => rounds.reduce((sum, r) => sum + r.scoreDelta[p], 0));
      expect(final.players.map((p) => p.score)).toEqual(expected);
      expect(final.players.every((p) => p.score >= 0)).toBe(true);
    });
  }

  it("é determinística: a mesma semente joga exatamente a mesma partida", () => {
    const a = playFullGame(4, 7);
    const b = playFullGame(4, 7);
    expect(a.final.players.map((p) => p.score)).toEqual(b.final.players.map((p) => p.score));
    const c = playFullGame(4, 8);
    expect(c.final.players.map((p) => p.score)).not.toEqual(a.final.players.map((p) => p.score));
  });
});
