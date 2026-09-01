import { describe, it, expect } from 'vitest';
import { createInitialState, startNextRound, handleBet, handlePlayCard, handleShuffleAndDeal, voteToEndMatch, GameState } from './state-machine';
import { PlayerPresence } from '@/components/game/RoomManager';
import { Card, generateDeck } from './rules';

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

  it('should start first round with 1 card per player, dealt by the host', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state);

    expect(state.phase).toBe('shuffling');
    // O host (Alice, index 0) é sempre quem embaralha a primeira rodada da partida.
    expect(state.dealerIndex).toBe(0);

    state = handleShuffleAndDeal(state, '1');

    expect(state.phase).toBe('betting');
    expect(state.currentRoundCards).toBe(1);
    expect(state.players[0].cards.length).toBe(1);
    expect(state.players[1].cards.length).toBe(1);
    expect(state.vira).toBeDefined();
  });

  it('should reject shuffle attempt from a non-dealer player', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state);

    const attempted = handleShuffleAndDeal(state, '2'); // Bob não é o dealer
    expect(attempted).toBe(state); // Estado inalterado
    expect(attempted.phase).toBe('shuffling');
  });

  it('should rotate the dealer to the next player on every round after the first', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state); // Ronda 1: dealer = Alice (0)
    expect(state.dealerIndex).toBe(0);
    state = handleShuffleAndDeal(state, '1');
    state = handleBet(state, '2', 0);
    // Alice (dealer) faz a última aposta da rodada de 1 carta: apostar 1 fecharia
    // a soma em 1 (= currentRoundCards), então só 0 é permitido aqui.
    state = handleBet(state, '1', 0);
    state = handlePlayCard(state, '2', 0);
    state = handlePlayCard(state, '1', 0);
    expect(state.phase).toBe('round_end');

    state = startNextRound(state); // Ronda 2: dealer roda para Bob (1)
    expect(state.dealerIndex).toBe(1);
    expect(state.currentRoundCards).toBe(2);
  });
});

describe('State Machine - "Embaralhamento Supremo do Lucas"', () => {
  const mockPlayers: PlayerPresence[] = [
    { id: '1', name: 'Alice', joinedAt: '2023-01-01T00:00:00Z' },
    { id: '2', name: 'Bob', joinedAt: '2023-01-01T00:00:01Z' },
    { id: '3', name: 'Charlie', joinedAt: '2023-01-01T00:00:02Z' },
  ];

  it('deals cards straight off the raw (unshuffled) deck instead of randomizing', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state); // 1 carta, dealer = Alice (host)
    state = handleShuffleAndDeal(state, '1', 'lucas_supreme');

    const rawDeck = generateDeck();
    // 3 jogadores, 1 carta cada: as 3 primeiras cartas do baralho não embaralhado,
    // na ordem dos jogadores, e o vira é a carta seguinte.
    expect(state.players[0].cards).toEqual([rawDeck[0]]);
    expect(state.players[1].cards).toEqual([rawDeck[1]]);
    expect(state.players[2].cards).toEqual([rawDeck[2]]);
    expect(state.vira).toEqual(rawDeck[3]);
  });

  it('is deterministic across calls, unlike a real shuffle', () => {
    let stateA = createInitialState(mockPlayers);
    stateA = startNextRound(stateA);
    stateA = handleShuffleAndDeal(stateA, '1', 'lucas_supreme');

    let stateB = createInitialState(mockPlayers);
    stateB = startNextRound(stateB);
    stateB = handleShuffleAndDeal(stateB, '1', 'lucas_supreme');

    expect(stateA.players.map(p => p.cards)).toEqual(stateB.players.map(p => p.cards));
    expect(stateA.vira).toEqual(stateB.vira);
  });

  it('still only lets the current dealer trigger it', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state);

    const rejected = handleShuffleAndDeal(state, '2', 'lucas_supreme'); // Bob não é o dealer
    expect(rejected).toBe(state);
  });

  it('defaults to a real random shuffle when no style is given', () => {
    let stateA = createInitialState(mockPlayers);
    stateA = startNextRound(stateA);
    stateA = handleShuffleAndDeal(stateA, '1'); // sem style: shuffle de verdade

    let stateB = createInitialState(mockPlayers);
    stateB = startNextRound(stateB);
    stateB = handleShuffleAndDeal(stateB, '1');

    // Duas rodadas de shuffle de verdade batendo carta por carta é
    // astronomicamente improvável — bem diferente do 'lucas_supreme'.
    expect(stateA.players.map(p => p.cards)).not.toEqual(stateB.players.map(p => p.cards));
  });
});

describe('State Machine - Gameplay Flow', () => {
  const mockPlayers: PlayerPresence[] = [
    { id: 'p1', name: 'P1', joinedAt: '1' },
    { id: 'p2', name: 'P2', joinedAt: '2' },
  ];

  it('should handle betting and transition to playing', () => {
    let state = createInitialState(mockPlayers);
    state = startNextRound(state); // -> shuffling, dealer = p1 (host)
    state = handleShuffleAndDeal(state, 'p1'); // -> betting

    // Dealer é p1 (index 0), então quem aposta primeiro é p2 (index 1)
    expect(state.currentPlayerIndex).toBe(1);

    state = handleBet(state, 'p2', 0);
    expect(state.players[1].bet).toBe(0);
    expect(state.phase).toBe('betting');

    // p1 é o dealer e faz a última aposta da rodada de 1 carta.
    // Apostar 1 fecharia a soma (0 + 1 = 1 carta), então é proibido; só resta 0.
    state = handleBet(state, 'p1', 1);
    expect(state.players[0].bet).toBeNull(); // Aposta rejeitada, estado não mudou
    expect(state.phase).toBe('betting');

    state = handleBet(state, 'p1', 0);
    expect(state.players[0].bet).toBe(0);
    expect(state.phase).toBe('playing');

    // O primeiro a jogar as cartas é quem começou a apostar
    expect(state.currentPlayerIndex).toBe(1);
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
        { id: 'p1', name: 'P1', score: 0, cards: [p1Card], wonCards: [], bet: 0, tricks: 0 },
        { id: 'p2', name: 'P2', score: 0, cards: [p2Card], wonCards: [], bet: 1, tricks: 0 }
      ],
      maxCardsLimit: 5,
      hostId: null,
      endVote: null
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
        { id: 'p1', name: 'P1', score: 5, cards: [p1Card], wonCards: [], bet: 1, tricks: 0 },
        { id: 'p2', name: 'P2', score: 2, cards: [p2Card], wonCards: [], bet: 1, tricks: 0 }
      ],
      maxCardsLimit: 5,
      hostId: null,
      endVote: null
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

describe('State Machine - handleBet validation', () => {
  const baseState: GameState = {
    phase: 'betting',
    currentRoundCards: 2,
    roundDirection: 'up',
    dealerIndex: 1,
    currentPlayerIndex: 0,
    vira: { suit: 'diamonds', value: '4' },
    tableCards: [],
    players: [
      { id: 'p1', name: 'P1', score: 0, cards: [{ suit: 'hearts', value: '5' }, { suit: 'clubs', value: '6' }], wonCards: [], bet: null, tricks: 0 },
      { id: 'p2', name: 'P2', score: 0, cards: [{ suit: 'hearts', value: '7' }, { suit: 'clubs', value: 'Q' }], wonCards: [], bet: null, tricks: 0 },
    ],
    maxCardsLimit: 5,
    hostId: null,
    endVote: null,
  };

  it('should ignore a bet from a player who is not currently up', () => {
    const next = handleBet(baseState, 'p2', 1);
    expect(next).toBe(baseState);
  });

  it('should reject a negative bet', () => {
    const next = handleBet(baseState, 'p1', -1);
    expect(next).toBe(baseState);
    expect(next.players[0].bet).toBeNull();
  });

  it('should reject a bet greater than the number of cards in hand', () => {
    const next = handleBet(baseState, 'p1', 3); // só tem 2 cartas
    expect(next).toBe(baseState);
  });

  it('should reject a non-integer bet', () => {
    const next = handleBet(baseState, 'p1', 1.5);
    expect(next).toBe(baseState);
  });

  it('should accept a valid bet within range', () => {
    const next = handleBet(baseState, 'p1', 2);
    expect(next.players[0].bet).toBe(2);
  });

  it('should not let the closing bettor make the total equal the round card count', () => {
    const state = handleBet(baseState, 'p1', 1); // sobra p2, currentRoundCards = 2
    expect(state.players[0].bet).toBe(1);
    expect(state.currentPlayerIndex).toBe(1);

    // p2 apostar 1 fecharia a soma em 2 (= currentRoundCards) -> proibido
    const rejected = handleBet(state, 'p2', 1);
    expect(rejected.players[1].bet).toBeNull();
    expect(rejected.phase).toBe('betting');

    // Qualquer outro valor válido é aceito
    const accepted = handleBet(state, 'p2', 0);
    expect(accepted.players[1].bet).toBe(0);
    expect(accepted.phase).toBe('playing');
  });

  it('should not restrict a bet that is not the closing bet of the round', () => {
    // p1 é o único apostando agora; mesmo que 2 feche a soma sozinho, a regra
    // só vale para quem faz a ÚLTIMA aposta — aqui ainda falta p2 apostar depois.
    const next = handleBet(baseState, 'p1', 2);
    expect(next.players[0].bet).toBe(2);
  });
});

describe('State Machine - handlePlayCard validation', () => {
  const baseState: GameState = {
    phase: 'playing',
    currentRoundCards: 1,
    roundDirection: 'up',
    dealerIndex: 0,
    currentPlayerIndex: 0,
    vira: { suit: 'diamonds', value: '4' },
    tableCards: [],
    players: [
      { id: 'p1', name: 'P1', score: 0, cards: [{ suit: 'hearts', value: '5' }], wonCards: [], bet: 0, tricks: 0 },
      { id: 'p2', name: 'P2', score: 0, cards: [{ suit: 'clubs', value: '6' }], wonCards: [], bet: 0, tricks: 0 },
    ],
    maxCardsLimit: 5,
    hostId: null,
    endVote: null,
  };

  it('should ignore a play from a player who is not currently up', () => {
    const next = handlePlayCard(baseState, 'p2', 0);
    expect(next).toBe(baseState);
  });

  it('should ignore an out-of-range card index (too high)', () => {
    const next = handlePlayCard(baseState, 'p1', 5);
    expect(next).toBe(baseState);
    expect(next.players[0].cards.length).toBe(1);
  });

  it('should ignore a negative card index', () => {
    const next = handlePlayCard(baseState, 'p1', -1);
    expect(next).toBe(baseState);
  });

  it('should accept a valid card index', () => {
    const next = handlePlayCard(baseState, 'p1', 0);
    expect(next.players[0].cards.length).toBe(0);
    expect(next.tableCards.length).toBe(1);
  });
});

describe('State Machine - round escalation and game over', () => {
  it('should keep escalating the card count past maxCardsLimit until the deck itself runs out', () => {
    // maxCardsLimit é um campo legado não aplicado: o teto real é o baralho de 40 cartas.
    // Com 2 jogadores, floor(39/2) = 19 cartas é o teto real, bem acima do maxCardsLimit (5).
    let state = createInitialState([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ]);
    expect(state.maxCardsLimit).toBe(5);

    state = startNextRound(state); // ronda 1 (1 carta)
    for (let i = 0; i < 10; i++) {
      // Força o fim da rodada sem jogar, só para avançar currentRoundCards
      state = { ...state, phase: 'round_end' } as GameState;
      state = startNextRound(state);
      if (state.phase === 'game_over') break;
    }

    // Depois de passar de 5 cartas (o "maxCardsLimit" legado) o jogo continua normalmente
    expect(state.currentRoundCards).toBeGreaterThan(5);
    expect(state.phase).not.toBe('game_over');
  });

  it('should end the game once the next round would need more cards than the deck can deal', () => {
    let state = createInitialState([
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' },
    ]);
    // floor(39/3) = 13 cartas é o teto real para 3 jogadores.
    // Começa em 12: a próxima rodada pede 13 (exatamente o teto) e deve ser aceita.
    state = { ...startNextRound(state), currentRoundCards: 12, phase: 'round_end' } as GameState;
    state = startNextRound(state);
    expect(state.phase).not.toBe('game_over');
    expect(state.currentRoundCards).toBe(13);

    state = { ...state, phase: 'round_end' } as GameState;
    state = startNextRound(state); // pediria 14 cartas, passa do teto de 13
    expect(state.phase).toBe('game_over');
  });
});

describe('State Machine - voteToEndMatch', () => {
  const mockPlayers: PlayerPresence[] = [
    { id: '1', name: 'Alice', joinedAt: '1' },
    { id: '2', name: 'Bob', joinedAt: '2' },
    { id: '3', name: 'Charlie', joinedAt: '3' },
  ];

  it('starts a new vote with the first voter and does not end the match yet', () => {
    let state = createInitialState(mockPlayers);
    state = voteToEndMatch(state, '1', 3);
    expect(state.endVote?.votes).toEqual(['1']);
    expect(state.phase).not.toBe('game_over');
  });

  it('ends the match once at least half the CONNECTED players have voted (rounded up)', () => {
    let state = createInitialState(mockPlayers); // 3 jogadores na mesa, todos conectados -> precisa de 2 votos
    state = voteToEndMatch(state, '1', 3);
    expect(state.phase).not.toBe('game_over');

    state = voteToEndMatch(state, '2', 3);
    expect(state.phase).toBe('game_over');
    expect(state.endVote).toBeNull();
  });

  it('ends the match with exactly half the votes for an even number of connected players', () => {
    const evenPlayers: PlayerPresence[] = [
      { id: '1', name: 'Alice', joinedAt: '1' },
      { id: '2', name: 'Bob', joinedAt: '2' },
      { id: '3', name: 'Charlie', joinedAt: '3' },
      { id: '4', name: 'Dana', joinedAt: '4' },
    ];
    let state = createInitialState(evenPlayers); // 4 jogadores -> precisa de 2 votos
    state = voteToEndMatch(state, '1', 4);
    expect(state.phase).not.toBe('game_over');
    state = voteToEndMatch(state, '2', 4);
    expect(state.phase).toBe('game_over');
  });

  it('bases the majority only on currently-connected players, not the whole roster', () => {
    // 4 jogadores na mesa (roster), mas só 2 estão conectados agora -> precisa de 1 voto só.
    const players: PlayerPresence[] = [
      { id: '1', name: 'Alice', joinedAt: '1' },
      { id: '2', name: 'Bob', joinedAt: '2' },
      { id: '3', name: 'Charlie', joinedAt: '3' },
      { id: '4', name: 'Dana', joinedAt: '4' },
    ];
    let state = createInitialState(players);
    state = voteToEndMatch(state, '1', 2); // só Alice e Bob conectados
    expect(state.phase).toBe('game_over'); // 1 voto já é metade de 2 conectados
  });

  it('ignores a duplicate vote from the same player', () => {
    let state = createInitialState(mockPlayers);
    state = voteToEndMatch(state, '1', 3);
    state = voteToEndMatch(state, '1', 3); // vota de novo
    expect(state.endVote?.votes).toEqual(['1']);
    expect(state.phase).not.toBe('game_over');
  });

  it('ignores a vote from someone not at the table', () => {
    let state = createInitialState(mockPlayers);
    const next = voteToEndMatch(state, 'ghost', 3);
    expect(next).toBe(state);
  });

  it('does nothing once the match is already over', () => {
    let state = createInitialState(mockPlayers);
    state = { ...state, phase: 'game_over' };
    const next = voteToEndMatch(state, '1', 3);
    expect(next).toBe(state);
  });
});
