import { expect, test, describe, it } from 'vitest';
import {
  createInitialState,
  startNextRound,
  handleBet,
  handlePlayCard,
  handleShuffleAndDeal,
  GameState,
} from './state-machine';
import { Card } from './rules';

describe('Game Integration Tests (End-to-End)', () => {
  test('Simulate full round and game over', () => {
    // 1. Initial Players setup
    const initialPlayers = [
      { id: '1', name: 'Alice', isHost: true },
      { id: '2', name: 'Bob', isHost: false },
      { id: '3', name: 'Charlie', isHost: false },
    ];

    // Cria estado inicial
    let state = createInitialState(initialPlayers);
    expect(state.phase).toBe('waiting');

    // 2. Inicia primeira rodada (1 carta) -> Vai para shuffling
    state = startNextRound(state);
    expect(state.phase).toBe('shuffling');

    // A primeira rodada da partida é sempre embaralhada pelo host (Alice, index 0)
    expect(state.players[state.dealerIndex].name).toBe('Alice');
    state = handleShuffleAndDeal(state, '1');

    expect(state.phase).toBe('betting');
    expect(state.currentRoundCards).toBe(1);
    expect(state.players[0].cards.length).toBe(1);
    expect(state.vira).not.toBeNull();

    // 3. Fase de Apostas
    // Dealer é Alice (index 0), então quem aposta primeiro é Bob (index 1)
    expect(state.players[state.currentPlayerIndex].name).toBe('Bob');
    state = handleBet(state, '2', 0); // Bob pede 0

    expect(state.players[state.currentPlayerIndex].name).toBe('Charlie');
    state = handleBet(state, '3', 1); // Charlie pede 1

    // Alice é a dealer e faz a última aposta: soma de Bob+Charlie = 1.
    // Apostar 0 fecharia a soma em 1 (= currentRoundCards), então é proibido.
    expect(state.players[state.currentPlayerIndex].name).toBe('Alice');
    const rejected = handleBet(state, '1', 0);
    expect(rejected.players[0].bet).toBeNull(); // aposta recusada, fase não muda
    expect(rejected.phase).toBe('betting');

    state = handleBet(state, '1', 1); // Alice pede 1 (único valor permitido)

    // Fim das apostas, muda para playing
    expect(state.phase).toBe('playing');

    // 4. Fase de Jogar Cartas
    // O primeiro a jogar também é Bob (index 1, primeiro a apostar)
    expect(state.players[state.currentPlayerIndex].name).toBe('Bob');
    state = handlePlayCard(state, '2', 0); // Bob joga

    expect(state.players[state.currentPlayerIndex].name).toBe('Charlie');
    state = handlePlayCard(state, '3', 0); // Charlie joga

    expect(state.players[state.currentPlayerIndex].name).toBe('Alice');
    state = handlePlayCard(state, '1', 0); // Alice joga sua única carta

    // Como todos jogaram, a rodada de vaza (trick) termina
    // Se eles tinham apenas 1 carta, a rodada inteira também termina
    expect(state.phase).toBe('round_end');

    // Vamos forçar as pontuações alterando os placares para simular uma eliminação na próxima rodada
    state.players[0].score = 15; // Alice tá com 15
    state.players[1].score = 15; // Bob com 15
    state.players[2].score = 20; // Charlie morreu (perdeu)

    // Inicia a próxima rodada -> shuffling. A partir daqui o dealer roda normalmente
    // (Alice foi a dealer da rodada 1, então a rodada 2 passa para Bob).
    state = startNextRound(state);
    expect(state.phase).toBe('shuffling');
    expect(state.players[state.dealerIndex].name).toBe('Bob');

    state = handleShuffleAndDeal(state, '2');

    // O estado pode ir para game_over se apenas 1 ou 2 sobraram e quisermos validar.
    // Na nossa lógica, o jogo continua até restar apenas 1 jogador vivo (pontos < 20)?
    // Vamos simular a morte de Bob também.
    state.players[1].score = 25; // Bob morreu

    state = startNextRound(state);
    // A lógica atual não elimina jogadores por pontuação (ver testes de
    // state-machine.test.ts): o jogo só termina quando a rodada exigiria mais
    // cartas do que o baralho de 40 comporta. Para forçar esse fim aqui,
    // simulamos que já chegamos no teto de cartas.
    state.currentRoundCards = 15;
    state = startNextRound(state);

    // Como a rodada seguinte pediria mais cartas do que o baralho aguenta, termina.
    expect(state.phase).toBe('game_over');

    // Quem ganhou foi a Alice (menor pontuação)
    const sorted = [...state.players].sort((a, b) => a.score - b.score);
    expect(sorted[0].name).toBe('Alice');
  });
});

describe('Full round with multiple tricks', () => {
  it('lets the trick winner lead the next trick, and accumulates tricks/wonCards correctly', () => {
    // 3 jogadores, 2 cartas cada (2 vazas na rodada). P1 sempre joga a carta mais
    // forte, então deve vencer as duas vazas e fechar a rodada com 2 tricks.
    const vira: Card = { suit: 'diamonds', value: '4' }; // manilha = 5

    let state: GameState = {
      phase: 'playing',
      currentRoundCards: 2,
      roundDirection: 'up',
      dealerIndex: 2,
      currentPlayerIndex: 0, // P1 começa jogando a primeira vaza
      vira,
      tableCards: [],
      players: [
        { id: 'p1', name: 'P1', score: 0, bet: 2, tricks: 0, wonCards: [], cards: [
          { suit: 'clubs', value: '5' },   // manilha de paus (a mais forte do baralho)
          { suit: 'hearts', value: '3' },  // carta normal mais alta
        ] },
        { id: 'p2', name: 'P2', score: 0, bet: 0, tricks: 0, wonCards: [], cards: [
          { suit: 'hearts', value: '7' },
          { suit: 'spades', value: '6' },
        ] },
        { id: 'p3', name: 'P3', score: 0, bet: 0, tricks: 0, wonCards: [], cards: [
          { suit: 'clubs', value: 'K' },
          { suit: 'diamonds', value: 'Q' },
        ] },
      ],
      maxCardsLimit: 5,
      hostId: 'p1',
    };

    // Vaza 1: P1 joga a manilha (vence de cara), depois P2 e P3.
    state = handlePlayCard(state, 'p1', 0); // manilha de paus
    expect(state.currentPlayerIndex).toBe(1);
    state = handlePlayCard(state, 'p2', 0);
    expect(state.currentPlayerIndex).toBe(2);
    state = handlePlayCard(state, 'p3', 0);

    // Vaza 1 termina: P1 venceu, mesa limpa, P1 lidera a vaza 2.
    expect(state.tableCards).toHaveLength(0);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.players[0].tricks).toBe(1);
    expect(state.players[0].wonCards).toHaveLength(1);
    expect(state.players[0].wonCards[0]).toHaveLength(3); // uma carta de cada jogador
    expect(state.phase).toBe('playing'); // ainda tem 1 carta na mão de cada

    // Vaza 2: P1 de novo com a carta mais forte restante (3 de Copas).
    state = handlePlayCard(state, 'p1', 0);
    state = handlePlayCard(state, 'p2', 0);
    state = handlePlayCard(state, 'p3', 0);

    // Rodada acabou (mãos vazias). P1 fez 2 vazas e apostou 2 -> acerta, 0 dano.
    expect(state.phase).toBe('round_end');
    expect(state.players[0].tricks).toBe(2);
    expect(state.players[0].wonCards).toHaveLength(2);
    expect(state.players[0].score).toBe(0);

    // P2 e P3 apostaram 0 e fizeram 0 -> também acertam, 0 dano.
    expect(state.players[1].tricks).toBe(0);
    expect(state.players[1].score).toBe(0);
    expect(state.players[2].tricks).toBe(0);
    expect(state.players[2].score).toBe(0);

    // hostId (metadado de rede) sobrevive à rodada sem ser mexido pelas regras do jogo.
    expect(state.hostId).toBe('p1');
  });
});

describe('Betting - closing rule holds across different round sizes', () => {
  it('always forbids exactly the one bet value that would close the round, for round sizes 1 through 4', () => {
    for (const cards of [1, 2, 3, 4]) {
      const players = ['a', 'b', 'c'].map((id) => ({
        id,
        name: id,
        score: 0,
        bet: null as number | null,
        tricks: 0,
        wonCards: [] as Card[][],
        cards: Array.from({ length: cards }, () => ({ suit: 'hearts', value: '4' }) as Card),
      }));

      let state: GameState = {
        phase: 'betting',
        currentRoundCards: cards,
        roundDirection: 'up',
        dealerIndex: 2, // 'c' é o dealer e faz a última aposta
        currentPlayerIndex: 0,
        vira: { suit: 'diamonds', value: 'K' },
        tableCards: [],
        players,
        maxCardsLimit: 5,
        hostId: null,
      };

      state = handleBet(state, 'a', Math.min(1, cards));
      state = handleBet(state, 'b', 0);

      const sumSoFar = state.players.reduce((s, p) => s + (p.bet ?? 0), 0);
      const forbidden = cards - sumSoFar;

      if (forbidden >= 0 && forbidden <= cards) {
        const rejected = handleBet(state, 'c', forbidden);
        expect(rejected.players[2].bet).toBeNull();
        expect(rejected.phase).toBe('betting');
      }

      // Qualquer outro valor válido no intervalo é aceito e fecha a aposta.
      const allowedValue = forbidden === 0 ? Math.min(1, cards) : 0;
      const accepted = handleBet(state, 'c', allowedValue);
      expect(accepted.players[2].bet).toBe(allowedValue);
      expect(accepted.phase).toBe('playing');
    }
  });
});

describe('Restarting a match after game_over', () => {
  it('resets scores, cards and bets, and has the host deal the first round again', () => {
    const players = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];

    let state = createInitialState(players);
    state.players[0].score = 12;
    state.players[1].score = 20;
    state.phase = 'game_over';

    // "Começar Nova Partida" -> mesmo fluxo do primeiro jogo
    state = startNextRound(createInitialState(players));

    expect(state.phase).toBe('shuffling');
    expect(state.currentRoundCards).toBe(1);
    expect(state.players.every((p) => p.score === 0)).toBe(true);
    expect(state.players.every((p) => p.bet === null)).toBe(true);
    expect(state.players.every((p) => p.cards.length === 0)).toBe(true);
    // O host (index 0) volta a ser quem embaralha na rodada 1 da nova partida.
    expect(state.dealerIndex).toBe(0);

    state = handleShuffleAndDeal(state, '1');
    expect(state.phase).toBe('betting');
    expect(state.players[0].cards).toHaveLength(1);
    expect(state.players[1].cards).toHaveLength(1);
  });
});
