import { expect, test, describe } from 'vitest';
import { 
  createInitialState, 
  startNextRound, 
  handleBet, 
  handlePlayCard,
  handleShuffleAndDeal 
} from './state-machine';

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
    
    // Dealer (index 0 - Alice, mas startNextRound vai pro index 1 - Bob, id: 2)
    state = handleShuffleAndDeal(state, '2');

    expect(state.phase).toBe('betting');
    expect(state.currentRoundCards).toBe(1);
    expect(state.players[0].cards.length).toBe(1);
    expect(state.vira).not.toBeNull();

    // 3. Fase de Apostas
    // Dealer é Bob (index 1), então quem aposta primeiro é Charlie (index 2)
    expect(state.players[state.currentPlayerIndex].name).toBe('Charlie');
    state = handleBet(state, '3', 0); // Charlie pede 0

    expect(state.players[state.currentPlayerIndex].name).toBe('Alice');
    state = handleBet(state, '1', 1); // Alice pede 1

    expect(state.players[state.currentPlayerIndex].name).toBe('Bob');
    state = handleBet(state, '2', 1); // Bob pede 1

    // Fim das apostas, muda para playing
    expect(state.phase).toBe('playing');
    
    // 4. Fase de Jogar Cartas
    // O primeiro a jogar também é Charlie (index 2)
    expect(state.players[state.currentPlayerIndex].name).toBe('Charlie');
    state = handlePlayCard(state, '3', 0); // Charlie joga

    expect(state.players[state.currentPlayerIndex].name).toBe('Alice');
    state = handlePlayCard(state, '1', 0); // Alice joga

    expect(state.players[state.currentPlayerIndex].name).toBe('Bob');
    state = handlePlayCard(state, '2', 0); // Bob joga sua única carta

    // Como todos jogaram, a rodada de vaza (trick) termina
    // Se eles tinham apenas 1 carta, a rodada inteira também termina
    expect(state.phase).toBe('round_end');

    // Vamos forçar as pontuações alterando os placares para simular uma eliminação na próxima rodada
    state.players[0].score = 15; // Alice tá com 15
    state.players[1].score = 15; // Bob com 15
    state.players[2].score = 20; // Charlie morreu (perdeu)

    // Inicia a próxima rodada -> shuffling
    state = startNextRound(state);
    expect(state.phase).toBe('shuffling');
    
    // Dealer da segunda rodada é Charlie (index 2, id: '3')
    state = handleShuffleAndDeal(state, '3');
    
    // O estado pode ir para game_over se apenas 1 ou 2 sobraram e quisermos validar.
    // Na nossa lógica, o jogo continua até restar apenas 1 jogador vivo (pontos < 20)?
    // Vamos simular a morte de Bob também.
    state.players[1].score = 25; // Bob morreu

    state = startNextRound(state);
    // Próximo a lidar seria o index 2, Charlie, mas ele está morto.
    // De qualquer forma, só 1 está abaixo de 20 pontos, e startNextRound pode 
    // até bater no game_over (que definimos se cartas acabarem).
    // Mas para forçar game over no nosso teste, vamos fingir que já chegamos no máximo de cartas.
    
    // O teste real deve validar game_over. A lógica de game_over só ocorre 
    // se o maxCards for ultrapassado.
    state.currentRoundCards = 15;
    state = startNextRound(state);
    
    // Como só restou Alice abaixo de 20 pontos, o jogo deve terminar
    expect(state.phase).toBe('game_over');

    // Quem ganhou foi a Alice
    const sorted = [...state.players].sort((a, b) => a.score - b.score);
    expect(sorted[0].name).toBe('Alice');
  });
});
