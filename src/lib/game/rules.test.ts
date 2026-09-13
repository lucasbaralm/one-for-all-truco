import { describe, it, expect } from 'vitest';
import { generateDeck, getWinningCardIndex, Card } from './rules';

describe('Rules - generateDeck', () => {
  it('should create a deck with exactly 40 cards', () => {
    const deck = generateDeck();
    expect(deck.length).toBe(40);
  });

  it('should not contain 8, 9 or 10', () => {
    const deck = generateDeck();
    // Use 'any' type to check for invalid values since TS statically knows they are invalid
    const invalidCards = deck.filter((c: any) => c.value === '8' || c.value === '9' || c.value === '10');
    expect(invalidCards.length).toBe(0);
  });

  it('should contain 4 suits for each valid value', () => {
    const deck = generateDeck();
    const values = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
    
    values.forEach(v => {
      const cardsOfValue = deck.filter(c => c.value === v);
      expect(cardsOfValue.length).toBe(4);
    });
  });
});

describe('Rules - getWinningCardIndex', () => {
  it('should return the index of the highest normal card when no manilhas are present', () => {
    const cards: Card[] = [
      { suit: 'hearts', value: '4' },
      { suit: 'clubs', value: '6' },
      { suit: 'spades', value: '5' }
    ];
    const vira: Card = { suit: 'diamonds', value: 'J' }; // Manilhas seriam K
    
    // O 6 é o mais forte entre 4, 5, 6
    const winnerIdx = getWinningCardIndex(cards, vira);
    expect(winnerIdx).toBe(1); // '6' is at index 1
  });

  it('should handle manilhas correctly (Paus > Copas > Espadas > Ouros)', () => {
    const cards: Card[] = [
      { suit: 'diamonds', value: '5' }, // Manilha de Ouros
      { suit: 'clubs', value: '5' },    // Manilha de Paus (Mais forte)
      { suit: 'hearts', value: '5' },   // Manilha de Copas
    ];
    const vira: Card = { suit: 'diamonds', value: '4' }; // Vira 4 -> Manilha é 5
    
    const winnerIdx = getWinningCardIndex(cards, vira);
    expect(winnerIdx).toBe(1); // '5' de Paus
  });

  it('should make manilhas beat any normal card', () => {
    const cards: Card[] = [
      { suit: 'spades', value: '3' }, // Carta normal mais alta (3)
      { suit: 'diamonds', value: '2' }, // Carta normal (2)
      { suit: 'hearts', value: '4' },   // Manilha (Vira 3 -> Manilha 4)
    ];
    const vira: Card = { suit: 'diamonds', value: '3' };
    
    const winnerIdx = getWinningCardIndex(cards, vira);
    expect(winnerIdx).toBe(2); // '4' de Copas vence o '3' de Espadas
  });

  it('should break same-value ties by suit strength, never by play order', () => {
    const cards: Card[] = [
      { suit: 'diamonds', value: 'K' }, // Empate de valor com o próximo, mas Ouros é o naipe mais fraco
      { suit: 'hearts', value: 'K' },   // Copas > Ouros — deve vencer mesmo jogando depois
      { suit: 'clubs', value: 'Q' }
    ];
    const vira: Card = { suit: 'diamonds', value: '4' }; // Manilha seria 5 — nenhuma carta aqui é manilha

    const winnerIdx = getWinningCardIndex(cards, vira);
    expect(winnerIdx).toBe(1); // 'K' de Copas vence o 'K' de Ouros pelo naipe
  });

  it('should let a later-played card of a stronger suit beat an earlier same-value card', () => {
    const cards: Card[] = [
      { suit: 'hearts', value: '2' }, // Jogada primeiro
      { suit: 'clubs', value: '2' },  // Jogada depois — Paus > Copas, deve vencer mesmo assim
    ];
    const vira: Card = { suit: 'diamonds', value: 'J' }; // Manilha seria Q — '2' não é manilha aqui

    const winnerIdx = getWinningCardIndex(cards, vira);
    expect(winnerIdx).toBe(1); // 'clubs' vence por naipe, não por ordem de jogada
  });
});
