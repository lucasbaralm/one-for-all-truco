import { describe, it, expect } from 'vitest';
import { createTestState, playCards, placeBets, getTrickWinner } from './testHelpers';

describe('testHelpers — hearts-5 vs clubs-5, no manilha involved', () => {
  it('clubs-5 (Paus) beats hearts-5 (Copas), clubs played first', () => {
    const before = createTestState({
      vira: { suit: 'diamonds', value: 'J' }, // manilha é 'Q' — nada aqui é manilha
      hands: [
        { id: 'p1', cards: [{ suit: 'clubs', value: '5' }] },
        { id: 'p2', cards: [{ suit: 'hearts', value: '5' }] },
        { id: 'p3', cards: [{ suit: 'spades', value: '4' }] },
        { id: 'p4', cards: [{ suit: 'diamonds', value: '4' }] },
      ],
    });

    const after = playCards(before, [
      { playerId: 'p1', cardIndex: 0 }, // clubs-5
      { playerId: 'p2', cardIndex: 0 }, // hearts-5
      { playerId: 'p3', cardIndex: 0 }, // spades-4 (mais fraca, não interfere)
      { playerId: 'p4', cardIndex: 0 }, // diamonds-4 (idem)
    ]);

    expect(getTrickWinner(after, before)).toBe('p1');
  });

  it('clubs-5 (Paus) STILL beats hearts-5 (Copas) even played last — order never decides', () => {
    const before = createTestState({
      vira: { suit: 'diamonds', value: 'J' },
      hands: [
        { id: 'p1', cards: [{ suit: 'hearts', value: '5' }] },
        { id: 'p2', cards: [{ suit: 'spades', value: '4' }] },
        { id: 'p3', cards: [{ suit: 'diamonds', value: '4' }] },
        { id: 'p4', cards: [{ suit: 'clubs', value: '5' }] }, // joga por último
      ],
    });

    const after = playCards(before, [
      { playerId: 'p1', cardIndex: 0 }, // hearts-5 primeiro
      { playerId: 'p2', cardIndex: 0 },
      { playerId: 'p3', cardIndex: 0 },
      { playerId: 'p4', cardIndex: 0 }, // clubs-5 por último — mesmo assim vence
    ]);

    expect(getTrickWinner(after, before)).toBe('p4');
  });

  it('a manilha in the same trick still overrides the 5-pair suit tiebreak', () => {
    const before = createTestState({
      vira: { suit: 'diamonds', value: '5' }, // manilha é '6'
      hands: [
        { id: 'p1', cards: [{ suit: 'hearts', value: '5' }] },
        { id: 'p2', cards: [{ suit: 'clubs', value: '5' }] },
        { id: 'p3', cards: [{ suit: 'diamonds', value: '6' }] }, // manilha fraca (Ouros)
        { id: 'p4', cards: [{ suit: 'spades', value: '4' }] },
      ],
    });

    const after = playCards(before, [
      { playerId: 'p1', cardIndex: 0 },
      { playerId: 'p2', cardIndex: 0 },
      { playerId: 'p3', cardIndex: 0 }, // manilha — vence mesmo sendo Ouros (o naipe mais fraco)
      { playerId: 'p4', cardIndex: 0 },
    ]);

    expect(getTrickWinner(after, before)).toBe('p3');
  });

  it('betting phase helper works too (sanity check for the framework itself)', () => {
    const before = createTestState({
      vira: { suit: 'diamonds', value: 'J' },
      phase: 'betting',
      hands: [
        { id: 'p1', cards: [{ suit: 'clubs', value: '5' }] },
        { id: 'p2', cards: [{ suit: 'hearts', value: '5' }] },
      ],
    });

    // 1 carta na rodada: quem fecha (p2) não pode deixar a soma == 1, então
    // depois de p1 apostar 0, só sobra 0 pra p2 (apostar 1 seria a "fechada"
    // proibida) — daí os dois apostarem 0 aqui de propósito.
    const afterBets = placeBets(before, [
      { playerId: 'p1', bet: 0 },
      { playerId: 'p2', bet: 0 },
    ]);

    expect(afterBets.phase).toBe('playing');
    expect(afterBets.players.map((p) => p.bet)).toEqual([0, 0]);
  });
});
