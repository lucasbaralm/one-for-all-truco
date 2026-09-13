// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS — monta um GameState com mãos escolhidas à mão (vira, cartas de
// cada jogador, quem começa) em vez de depender de shuffleDeck()/sorte pra
// reproduzir um confronto específico (ex: "5 de copas contra 5 de paus, sem
// manilha"). Só usa os tipos e funções já exportados por state-machine.ts/
// rules.ts — não altera nem duplica a lógica de jogo, só monta o estado
// inicial e toca as jogadas em sequência através das funções reais
// (handlePlayCard/handleBet), então qualquer teste que use isso está
// exercitando exatamente o mesmo código que roda em produção.
//
// Uso típico:
//
//   const state = createTestState({
//     vira: { suit: 'diamonds', value: 'J' }, // manilha vira 'Q'
//     hands: [
//       { id: 'p1', cards: [{ suit: 'hearts', value: '5' }] },
//       { id: 'p2', cards: [{ suit: 'clubs', value: '5' }] },
//       { id: 'p3', cards: [{ suit: 'spades', value: '4' }] },
//       { id: 'p4', cards: [{ suit: 'diamonds', value: '4' }] },
//     ],
//   });
//   const result = playCards(state, [
//     { playerId: 'p1', cardIndex: 0 },
//     { playerId: 'p2', cardIndex: 0 },
//     { playerId: 'p3', cardIndex: 0 },
//     { playerId: 'p4', cardIndex: 0 },
//   ]);
//   getTrickWinner(result) // -> 'p2' (clubs-5 vence copas-5, mesmo jogando depois)
// ─────────────────────────────────────────────────────────────────────────────

import { Card } from './rules';
import { GameState, PlayerState, handlePlayCard, handleBet } from './state-machine';

export interface TestHandSpec {
  id: string;
  name?: string;
  cards: Card[];
  bet?: number | null;
  score?: number;
  tricks?: number;
  wonCards?: Card[][];
}

export interface CreateTestStateOptions {
  vira: Card;
  hands: TestHandSpec[];
  /** Índice de quem joga/aposta primeiro. Padrão: 0. */
  currentPlayerIndex?: number;
  /** Índice do dealer (só importa pra quem começa a *próxima* rodada). Padrão: 0. */
  dealerIndex?: number;
  /** 'playing' (padrão, pronto pra jogar cartas) ou 'betting' (pronto pra apostar). */
  phase?: 'betting' | 'playing';
  /** Cartas já na mesa antes das jogadas do teste (raro precisar). */
  tableCards?: { playerId: string; card: Card }[];
}

/**
 * Monta um GameState pronto pra um teste determinístico: mãos, vira e ordem
 * de jogada exatamente como especificado, sem nenhum sorteio envolvido.
 * Por padrão já entra em fase 'playing' com aposta 0 pra todo mundo (o valor
 * da aposta não afeta quem vence a vaza) — passe `phase: 'betting'` se o
 * teste for especificamente sobre a fase de apostas.
 */
export function createTestState(opts: CreateTestStateOptions): GameState {
  const phase = opts.phase ?? 'playing';
  const players: PlayerState[] = opts.hands.map((h) => ({
    id: h.id,
    name: h.name ?? h.id,
    score: h.score ?? 0,
    bet: phase === 'betting' ? (h.bet ?? null) : (h.bet ?? 0),
    tricks: h.tricks ?? 0,
    cards: h.cards,
    wonCards: h.wonCards ?? [],
  }));

  const currentRoundCards = Math.max(...opts.hands.map((h) => h.cards.length), 1);

  return {
    phase,
    players,
    currentRoundCards,
    roundDirection: 'up',
    dealerIndex: opts.dealerIndex ?? 0,
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    vira: opts.vira,
    tableCards: opts.tableCards ?? [],
    maxCardsLimit: 5,
    endVote: null,
  };
}

/**
 * Aplica uma sequência de jogadas de carta em ordem, através da função real
 * handlePlayCard — cada entrada precisa ser exatamente quem tem a vez
 * (currentPlayerIndex), senão a jogada é ignorada silenciosamente (mesmo
 * comportamento de handlePlayCard em produção, então isso também serve pra
 * testar que uma jogada fora de ordem realmente não faz nada).
 */
export function playCards(
  state: GameState,
  plays: { playerId: string; cardIndex: number }[]
): GameState {
  return plays.reduce((s, p) => handlePlayCard(s, p.playerId, p.cardIndex), state);
}

/** Mesma ideia de playCards, mas pra apostas (handleBet). */
export function placeBets(
  state: GameState,
  bets: { playerId: string; bet: number }[]
): GameState {
  return bets.reduce((s, b) => handleBet(s, b.playerId, b.bet), state);
}

/**
 * Descobre quem ganhou a última vaza completada nesse state: compara
 * `tricks` de cada jogador com o valor informado em `before` (o state antes
 * das jogadas, ou um Record id->tricks) e retorna o id de quem subiu.
 * Retorna null se ninguém subiu (vaza ainda não fechou, ex: faltou jogador).
 */
export function getTrickWinner(
  after: GameState,
  before: GameState | Record<string, number>
): string | null {
  const beforeTricks: Record<string, number> = Array.isArray((before as GameState).players)
    ? Object.fromEntries((before as GameState).players.map((p) => [p.id, p.tricks]))
    : (before as Record<string, number>);

  const winner = after.players.find((p) => p.tricks > (beforeTricks[p.id] ?? 0));
  return winner?.id ?? null;
}
