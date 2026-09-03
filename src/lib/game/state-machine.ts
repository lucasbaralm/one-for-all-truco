import { Card, generateDeck, shuffleDeck, getWinningCardIndex } from './rules';

export type GamePhase = 'waiting' | 'shuffling' | 'betting' | 'playing' | 'round_end' | 'game_over';

export interface PlayerState {
  id: string;
  name: string;
  score: number;
  bet: number | null;
  tricks: number;
  cards: Card[];
  wonCards: Card[][]; // Bolos de vazas ganhas no round atual
}

export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  currentRoundCards: number;
  // Não usado: nesta variante as cartas só sobem até o limite do baralho, nunca descem.
  roundDirection: 'up' | 'down';
  dealerIndex: number;
  currentPlayerIndex: number; // De quem é a vez de falar/jogar
  vira: Card | null;
  tableCards: { playerId: string; card: Card }[];
  // Não usado para limitar rounds: o teto real é ditado por generateDeck() (ver startNextRound).
  maxCardsLimit: number;
  // Votação em andamento para encerrar a partida antes da hora (precisa de
  // pelo menos metade da mesa). null = nenhuma votação ativa no momento.
  endVote: { votes: string[] } | null;
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
      wonCards: [],
    })),
    currentRoundCards: 1, // Começa com 1 carta
    roundDirection: 'up',
    dealerIndex: 0, // O host começa dando as cartas
    currentPlayerIndex: 0, // No shuffling, quem age é o dealer
    vira: null,
    tableCards: [],
    maxCardsLimit: 5, // Sobe até 5 cartas (máximo padrão da Fodinha rápida)
    endVote: null,
  };
}

/**
 * Registra o voto de um jogador para encerrar a partida antes da hora.
 * Cria a votação se ainda não existir uma ativa. Quando pelo menos metade
 * dos jogadores CONECTADOS no momento (arredondando pra cima) já votou, a
 * partida acaba imediatamente — não importa em que fase estava.
 *
 * `eligibleVoterCount` é decidido por quem chama (a UI, que sabe quem está
 * conectado agora via presença) — esta função não tem acesso a rede/presença,
 * só decide a regra em cima do número que recebe.
 */
export function voteToEndMatch(state: GameState, playerId: string, eligibleVoterCount: number): GameState {
  if (state.phase === 'game_over') return state;
  if (!state.players.some(p => p.id === playerId)) return state;

  const currentVotes = state.endVote?.votes ?? [];
  if (currentVotes.includes(playerId)) return state; // já votou

  const votes = [...currentVotes, playerId];
  if (votes.length * 2 >= eligibleVoterCount) {
    return { ...state, phase: 'game_over', endVote: null };
  }
  return { ...state, endVote: { votes } };
}

export function startNextRound(state: GameState): GameState {
  // O host (dealerIndex 0) começa dando as cartas na primeira rodada da partida;
  // depois disso o dealer roda normalmente para o próximo jogador a cada rodada.
  const nextDealerIndex = state.phase === 'waiting'
    ? state.dealerIndex
    : (state.dealerIndex + 1) % state.players.length;

  // Calcula se sobe a quantidade de cartas
  let newCardCount = state.currentRoundCards;

  if (state.phase !== 'waiting') {
    newCardCount++;
    // Teto real: quantas cartas por jogador cabem no baralho de 40, sobrando 1 para o vira.
    const absoluteMax = Math.floor(39 / state.players.length);

    // Se a próxima rodada for exigir mais cartas do que o baralho aguenta, o jogo acaba!
    if (newCardCount > absoluteMax) {
      return { ...state, phase: 'game_over' };
    }
  }

  // Prepara os jogadores (zera cartas, apostas e vazas)
  const newPlayers = state.players.map(p => {
    return { ...p, cards: [], wonCards: [], bet: null, tricks: 0 };
  });

  return {
    ...state,
    phase: 'shuffling', // Agora aguarda o dealer embaralhar e distribuir
    players: newPlayers,
    currentRoundCards: newCardCount,
    roundDirection: 'up',
    dealerIndex: nextDealerIndex,
    currentPlayerIndex: nextDealerIndex, // Apenas o dealer age nesta fase
    vira: null,
    tableCards: [],
  };
}

export type ShuffleStyle = 'random' | 'lucas_supreme';

/**
 * Ação manual do dealer de embaralhar e distribuir as cartas.
 * O "Embaralhamento Supremo do Lucas" é uma pegadinha: não embaralha de
 * verdade, só pega o baralho novo na ordem em que foi gerado e distribui
 * assim mesmo — como se tivesse "empilhado tudo de novo por cima" sem
 * misturar nada.
 */
export function handleShuffleAndDeal(state: GameState, playerId: string, style: ShuffleStyle = 'random'): GameState {
  if (state.phase !== 'shuffling') return state;
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return state; // Apenas o dealer

  const deck = style === 'lucas_supreme' ? generateDeck() : shuffleDeck(generateDeck());
  let cardIndex = 0;
  
  const newPlayers = state.players.map(p => {
    const hand = deck.slice(cardIndex, cardIndex + state.currentRoundCards);
    cardIndex += state.currentRoundCards;
    return { ...p, cards: hand };
  });

  const vira = deck[cardIndex];
  const nextPlayerIndex = (state.dealerIndex + 1) % state.players.length;

  return {
    ...state,
    phase: 'betting',
    players: newPlayers,
    vira,
    currentPlayerIndex: nextPlayerIndex,
  };
}

/**
 * Registra a aposta de um jogador.
 */
export function handleBet(state: GameState, playerId: string, bet: number): GameState {
  if (state.phase !== 'betting') return state;

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return state;

  // A aposta precisa ser um valor possível de se fazer: entre 0 e a quantidade de cartas na mão.
  if (!Number.isInteger(bet) || bet < 0 || bet > currentPlayer.cards.length) return state;

  // Regra do "fechamento": quem faz a última aposta da rodada não pode escolher um valor
  // que deixe a soma das apostas igual à quantidade de cartas da rodada — alguém tem que errar.
  const isClosingBet = state.players.filter(p => p.bet === null).length === 1;
  if (isClosingBet) {
    const sumOfOtherBets = state.players.reduce((sum, p) => sum + (p.bet ?? 0), 0);
    if (sumOfOtherBets + bet === state.currentRoundCards) return state;
  }

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

  // Só aceita um índice que exista de fato na mão do jogador.
  if (cardIndexInHand < 0 || cardIndexInHand >= currentPlayer.cards.length) return state;

  const cardPlayed = currentPlayer.cards[cardIndexInHand];

  // Remove a carta da mão do jogador (deep copy para evitar mutações)
  const newPlayers = state.players.map(p => {
    if (p.id === playerId) {
      const newHand = p.cards.filter((_, idx) => idx !== cardIndexInHand);
      return { ...p, cards: newHand };
    }
    return p;
  });

  const newTableCards = [...state.tableCards, { playerId, card: cardPlayed }];

  // Verifica se a vaza acabou (todos jogaram 1 carta)
  if (newTableCards.length === state.players.length) {
    const winningCardIdx = getWinningCardIndex(newTableCards.map(tc => tc.card), state.vira!);
    const winnerId = newTableCards[winningCardIdx].playerId;
    const winnerIndex = newPlayers.findIndex(p => p.id === winnerId);

    // Atualiza tricks e wonCards do vencedor (IMUTABLE — cria novo array)
    const playersAfterTrick = newPlayers.map((p, idx) => {
      if (idx === winnerIndex) {
        return {
          ...p,
          tricks: p.tricks + 1,
          wonCards: [...p.wonCards, newTableCards.map(tc => tc.card)], // deep push
        };
      }
      return p;
    });

    // Verifica se o round acabou (sem cartas nas mãos)
    const outOfCards = playersAfterTrick.every(p => p.cards.length === 0);

    if (outOfCards) {
      // Calcula pontuação: quem errou a aposta recebe dano
      const playersWithScores = playersAfterTrick.map(p => {
        const damage = p.bet !== null && p.bet !== p.tricks
          ? Math.abs(p.bet - p.tricks)
          : 0;
        return { ...p, score: p.score + damage };
      });

      return {
        ...state,
        phase: 'round_end',
        players: playersWithScores,
        // Mantém a última vaza na mesa (não limpa) — a UI segura essa vaza
        // visível por um tempo antes de mostrar o placar, pra dar tempo de
        // ver o que o último jogador jogou. startNextRound() limpa depois.
        tableCards: newTableCards,
      };
    }

    // Ainda há cartas: limpa mesa, vencedor joga primeiro
    return {
      ...state,
      players: playersAfterTrick,
      tableCards: [],
      currentPlayerIndex: winnerIndex,
    };
  }

  // Ainda não acabou a vaza: próximo jogador
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  return {
    ...state,
    players: newPlayers,
    tableCards: newTableCards,
    currentPlayerIndex: nextPlayerIndex,
  };
}
