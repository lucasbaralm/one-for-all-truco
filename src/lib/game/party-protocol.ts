// Formato das mensagens trocadas com o room server do PartyKit
// (party/server.ts). Compartilhado entre cliente e servidor pra não
// desalinhar os dois lados.
import { Card } from './rules';
import { GameState, ShuffleStyle } from './state-machine';

export type ClientMessage =
  | { type: 'start_game'; players: { id: string; name: string }[] }
  | { type: 'bet'; playerId: string; bet: number }
  | { type: 'play_card'; playerId: string; cardIndex: number }
  | { type: 'shuffle'; playerId: string; style: ShuffleStyle }
  | { type: 'vote_end'; playerId: string }
  | { type: 'emoji'; emoji: string; fromPlayerId: string }
  | { type: 'shuffle_announce'; dealerName: string; label: string };

export type ServerMessage =
  | { type: 'state'; state: GameState }
  | { type: 'trick_result'; winnerId: string; cards: { playerId: string; card: Card }[] }
  | { type: 'emoji'; emoji: string; fromPlayerId: string }
  | { type: 'shuffle_announce'; dealerName: string; label: string };
