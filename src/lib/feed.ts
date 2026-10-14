// Histórico de eventos de uma partida ("Zeca rolou 6", "Bia capturou uma peça sua"):
// o que acontece rápido demais pra ler num aviso de 2 segundos fica registrado
// aqui. Cada jogo transforma as mudanças do estado em entradas (ver feed.ts de
// cada um); este módulo só guarda a lista, com limite.

export type FeedTone = "info" | "good" | "bad" | "special";

export interface FeedEntry {
  id: number;
  text: string;
  tone: FeedTone;
  /** Cor de destaque (a do jogador que fez a ação). */
  color?: string;
}

/** O que cada jogo produz — o id é dado na hora de guardar. */
export type FeedInput = Omit<FeedEntry, "id">;

/** Quantas entradas a lista guarda (as mais antigas saem primeiro). */
export const FEED_MAX = 40;

let seq = 0;

/** Acrescenta entradas (na ordem dada) ao fim da lista e corta o excesso do começo. */
export function appendEntries(list: FeedEntry[], add: FeedInput[], max = FEED_MAX): FeedEntry[] {
  if (add.length === 0) return list;
  const next = [...list, ...add.map((e) => ({ ...e, id: ++seq }))];
  return next.length > max ? next.slice(next.length - max) : next;
}
