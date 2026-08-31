import { Card, generateDeck, shuffleDeck, getWinningCardIndex } from './rules';

export type GamePhase = 'waiting' | 'betting' | 'playing' | 'round_end' | 'game_over';

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  bet: number | null;
  tricks: number;
  cards: Card[];
}

export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  currentRoundCards: number;
  roundDirection: 'up' | 'down';
  dealerIndex: number;
  currentPlayerIndex: number; // De quem é a vez de falar/jogar
  vira: Card | null;
  tableCards: { playerId: string; card: Card }[];
  maxCardsLimit: number; // Por ex: sobe até 5 cartas
}

/**
 * Cria o estado inicial do jogo com os jogadores que estavam no lobby.
 */
export function createInitialState(playerPresence: { id: string, name: string }[]): GameState {
  return {
    phase: 'waiting',
    players: playerPresence.map(p => ({
      id: p.id,
      name: p.name,
      score: 0, // Cada jogador começa com 0 pontos
      bet: null,
      tricks: 0,
      cards: [],
    })),
    currentRoundCards: 1, // Começa com 1 carta
    roundDirection: 'up',
    dealerIndex: 0, // O host começa dando as cartas
    currentPlayerIndex: 1 % playerPresence.length, // Quem começa falando é o próximo depois do dealer
    vira: null,
    tableCards: [],
    maxCardsLimit: 5, // Sobe até 5 cartas (máximo padrão da Fodinha rápida)
  };
}

/**
 * Inicia uma nova rodada (distribui cartas, vira, zera apostas).
 */
export function startNextRound(state: GameState): GameState {
  const deck = shuffleDeck(generateDeck());
  const playersAlive = state.players; // Sem eliminação por vidas
  
  // Descobre o próximo dealer
  const nextDealerIndex = (state.dealerIndex + 1) % state.players.length;
  const nextPlayerIndex = (nextDealerIndex + 1) % state.players.length;

  // Calcula se sobe a quantidade de cartas
  let newCardCount = state.currentRoundCards;
  
  if (state.phase !== 'waiting') {
    newCardCount++;
    const absoluteMax = Math.floor(39 / playersAlive.length);
    
    // Se a próxima rodada for exigir mais cartas do que o baralho aguenta, o jogo acaba!
    if (newCardCount > absoluteMax) {
      return { ...state, phase: 'game_over' };
    }
  }

  // Distribui as cartas
  let cardIndex = 0;
  const newPlayers = state.players.map(p => {
    const hand = deck.slice(cardIndex, cardIndex + newCardCount);
    cardIndex += newCardCount;
    return { ...p, cards: hand, bet: null, tricks: 0 };
  });

  const vira = deck[cardIndex];

  return {
    ...state,
    phase: 'betting',
    players: newPlayers,
    currentRoundCards: newCardCount,
    roundDirection: 'up',
    dealerIndex: nextDealerIndex,
    currentPlayerIndex: nextPlayerIndex,
    vira,
    tableCards: [],
  };
}

/**
 * Registra a aposta de um jogador.
 */
export function handleBet(state: GameState, playerId: string, bet: number): GameState {
  if (state.phase !== 'betting') return state;
  
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return state;

  const newPlayers = state.players.map(p => 
    p.id === playerId ? { ...p, bet } : p
  );

  // Verifica se todos já apostaram
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const allBetted = newPlayers.every(p => p.bet !== null);

  if (allBetted) {
    // Muda para a fase de jogar cartas e o primeiro a jogar é o que começou apostando
    const firstToPlay = (state.dealerIndex + 1) % state.players.length;
    return {
      ...state,
      phase: 'playing',
      players: newPlayers,
      currentPlayerIndex: firstToPlay
    };
  }

  return {
    ...state,
    players: newPlayers,
    currentPlayerIndex: nextPlayerIndex
  };
}

/**
 * Registra a jogada de carta de um jogador.
 */
export function handlePlayCard(state: GameState, playerId: string, cardIndexInHand: number): GameState {
  if (state.phase !== 'playing') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return state;

  const cardPlayed = currentPlayer.cards[cardIndexInHand];
  
  // Remove a carta da mão do jogador
  const newPlayers = state.players.map(p => {
    if (p.id === playerId) {
      const newHand = [...p.cards];
      newHand.splice(cardIndexInHand, 1);
      return { ...p, cards: newHand };
    }
    return p;
  });

  const newTableCards = [...state.tableCards, { playerId, card: cardPlayed }];
  
  // Verifica se a rodada de mesa (vaza) acabou (todos jogaram 1 carta)
  if (newTableCards.length === state.players.length) {
    // Descobre quem ganhou a vaza
    const winningCardIdx = getWinningCardIndex(newTableCards.map(tc => tc.card), state.vira!);
    const winnerId = newTableCards[winningCardIdx].playerId;
    
    // Dá 1 trick pro vencedor
    const playersAfterTrick = newPlayers.map(p => 
      p.id === winnerId ? { ...p, tricks: p.tricks + 1 } : p
    );

    // O vencedor é o próximo a jogar
    const winnerIndex = playersAfterTrick.findIndex(p => p.id === winnerId);

    // Verifica se acabaram as cartas da mão de todo mundo
    const outOfCards = playersAfterTrick.every(p => p.cards.length === 0);

    if (outOfCards) {
      // Fim da rodada total! Calcula pontuação e volta pra waiting
      const playersWithScores = playersAfterTrick.map(p => {
        let scoreChange = 0;
        if (p.bet !== null) {
          if (p.bet === p.tricks) {
            scoreChange = 0; // Acertou
          } else {
            scoreChange = Math.abs(p.bet - p.tricks); // Errou (Dano)
          }
        }
        return { ...p, score: p.score + scoreChange };
      });

      return {
        ...state,
        phase: 'round_end',
        players: playersWithScores,
        tableCards: newTableCards,
      };
    }

    return {
      ...state,
      players: playersAfterTrick,
      tableCards: [], // Limpa a mesa pra próxima vaza
      currentPlayerIndex: winnerIndex
    };
  }

  // Ainda não acabou a vaza, passa pro próximo
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  
  return {
    ...state,
    players: newPlayers,
    tableCards: newTableCards,
    currentPlayerIndex: nextPlayerIndex
  };
}
