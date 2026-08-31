import { describe, it, expect } from 'vitest';
import { createInitialState, startNextRound, handleBet, handlePlayCard, GameState } from './state-machine';
import { PlayerPresence } from '@/components/game/RoomManager';
import { Card } from './rules';

describe('State Machine - Setup', () => {
  const mockPlayers: PlayerPresence[] = [
    { id: '1', name: 'Alice', joinedAt: '2023-01-01T00:00:00Z' },
    { id: '2', name: 'Bob', joinedAt: '2023-01-01T00:00:01Z' }
  ];

  it('should create initial state with correctly mapped players', () => {
    const state = createInitialState(mockPlayers);
    expect(state.players.length).toBe(2);
    expect(state.players[0].name).toBe('Alice');
    expect(state.players[0].score).toBe(0);
    expect(state.players[0].cards.length).toBe(0);
    expect(state.phase).toBe('waiting');
    expect(state.currentRoundCards).toBe(1);
  });

  it('should start first round with 1 card per player', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state);
    
    expect(state.phase).toBe('betting');
    expect(state.currentRoundCards).toBe(1);
    expect(state.players[0].cards.length).toBe(1);
    expect(state.players[1].cards.length).toBe(1);
    expect(state.vira).toBeDefined();
  });
});

describe('State Machine - Gameplay Flow', () => {
  const mockPlayers: PlayerPresence[] = [
    { id: 'p1', name: 'P1', joinedAt: '1' },
    { id: 'p2', name: 'P2', joinedAt: '2' },
  ];

  it('should handle betting and transition to playing', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state); 
    
    // Na Fodinha, se o dealer é X, o próximo dealer é X+1 e o primeiro a jogar é o próximo do dealer (X+2)
    // Inicialmente dealer = 0.
    // Start round -> novo dealer: 1. Primeiro a jogar: 0 (P1).
    expect(state.currentPlayerIndex).toBe(0);
    
    state = handleBet(state, 'p1', 1);
    expect(state.players[0].bet).toBe(1);
    expect(state.phase).toBe('betting');
    
    state = handleBet(state, 'p2', 0);
    expect(state.players[1].bet).toBe(0);
    expect(state.phase).toBe('playing');
    
    // O primeiro a jogar as cartas é quem começou a apostar
    expect(state.currentPlayerIndex).toBe(0); 
  });

  it('should handle playing cards and trick evaluation', () => {
    // Forçar um estado controlado
    const p1Card: Card = { suit: 'hearts', value: '4' };
    const p2Card: Card = { suit: 'spades', value: 'K' }; // K vence 4 (se não for manilha)
    const vira: Card = { suit: 'diamonds', value: '2' }; // Manilha é 3
    
    let state: GameState = {
      phase: 'playing',
      currentRoundCards: 1,
      roundDirection: 'up',
      dealerIndex: 0,
      currentPlayerIndex: 1, // P2 começa jogando
      vira,
      tableCards: [],
      players: [
        { id: 'p1', name: 'P1', score: 0, cards: [p1Card], bet: 0, tricks: 0 },
        { id: 'p2', name: 'P2', score: 0, cards: [p2Card], bet: 1, tricks: 0 }
      ],
      maxCardsLimit: 5
    };

    // P2 joga
    state = handlePlayCard(state, 'p2', 0);
    expect(state.tableCards.length).toBe(1);
    expect(state.currentPlayerIndex).toBe(0); // Passou a vez pro P1
    expect(state.players[1].cards.length).toBe(0);

    // P1 joga
    state = handlePlayCard(state, 'p1', 0);
    
    // A vaza acabou! O K (P2) vence o 4 (P1)
    // O P2 ganha 1 trick, e acaba a rodada (pq era round de 1 carta)
    expect(state.phase).toBe('round_end');
    
    const p1Final = state.players.find(p => p.id === 'p1');
    const p2Final = state.players.find(p => p.id === 'p2');
    
    expect(p2Final?.tricks).toBe(1);
    expect(p1Final?.tricks).toBe(0);
    
    // Cálculo de dano: 
    // P2 apostou 1 e fez 1 -> Toma 0 dano
    expect(p2Final?.score).toBe(0);
    // P1 apostou 0 e fez 0 -> Toma 0 dano
    expect(p1Final?.score).toBe(0);
  });

  it('should apply damage if bet is missed', () => {
    // Forçar um estado onde o jogador errou a aposta
    const p1Card: Card = { suit: 'hearts', value: '7' };
    const p2Card: Card = { suit: 'spades', value: '4' };
    const vira: Card = { suit: 'diamonds', value: '2' };
    
    let state: GameState = {
      phase: 'playing',
      currentRoundCards: 1,
      roundDirection: 'up',
      dealerIndex: 0,
      currentPlayerIndex: 1, // P2 joga
      vira,
      tableCards: [],
      players: [
        { id: 'p1', name: 'P1', score: 5, cards: [p1Card], bet: 1, tricks: 0 },
        { id: 'p2', name: 'P2', score: 2, cards: [p2Card], bet: 1, tricks: 0 }
      ],
      maxCardsLimit: 5
    };

    state = handlePlayCard(state, 'p2', 0);
    state = handlePlayCard(state, 'p1', 0);
    
    // P1 (7) vence P2 (4)
    // P1 apostou 1 e fez 1 = +0 dano
    // P2 apostou 1 e fez 0 = +1 dano
    
    expect(state.phase).toBe('round_end');
    expect(state.players.find(p => p.id === 'p1')?.score).toBe(5); // 5 + 0
    expect(state.players.find(p => p.id === 'p2')?.score).toBe(3); // 2 + 1
  });
});
