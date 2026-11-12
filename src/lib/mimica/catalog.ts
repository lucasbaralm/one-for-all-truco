// O catálogo da Mímica: as 600 músicas (300 do Brasil + 300 do mundo) com um id fixo cada.
// Os ids são a posição na lista (0–299 Brasil, 300–599 mundo): o estado do jogo guarda só o id,
// e a carta que vai pro jogador é montada a partir dele.

import { BR_SONGS, WORLD_SONGS } from "./songs";
import { answerKeys, editDistance, titleKey, tolerance } from "./titles";

export type SongKind = "br" | "world";

export interface Song {
  id: number;
  /** Como a música se chama (o que vale pra acertar). O que vem entre parênteses é só complemento. */
  title: string;
  artist: string;
  kind: SongKind;
}

export const SONGS: readonly Song[] = [
  ...BR_SONGS.map(([title, artist], i): Song => ({ id: i, title, artist, kind: "br" })),
  ...WORLD_SONGS.map(([title, artist], i): Song => ({ id: BR_SONGS.length + i, title, artist, kind: "world" })),
];

export const songOf = (id: number | null | undefined): Song | undefined => (id === null || id === undefined ? undefined : SONGS[id]);

/** Os ids de cada lado — a carta sorteia deles. */
export const IDS_BY_KIND: Record<SongKind, readonly number[]> = {
  br: SONGS.filter((s) => s.kind === "br").map((s) => s.id),
  world: SONGS.filter((s) => s.kind === "world").map((s) => s.id),
};

/** As formas de escrever a resposta de cada música (calculadas uma vez) e de quem é cada uma. */
const KEYS_BY_ID: readonly string[][] = SONGS.map((s) => answerKeys(s.title));
const OWNER_OF_KEY = new Map<string, number>();
KEYS_BY_ID.forEach((keys, id) => {
  for (const k of keys) if (!OWNER_OF_KEY.has(k)) OWNER_OF_KEY.set(k, id);
});

/**
 * O chute acerta a música? Ignora acento, caixa e pontuação e perdoa um errinho de digitação — mas só se
 * o chute não for EXATAMENTE o título de outra música do catálogo: "Love Yourself" está a uma letra de
 * "Lose Yourself", e chutar uma não pode acertar a outra.
 */
export function isCorrectGuess(guess: string, song: Song): boolean {
  const g = titleKey(guess);
  if (!g) return false;
  const keys = KEYS_BY_ID[song.id];
  if (keys.includes(g)) return true;
  const owner = OWNER_OF_KEY.get(g);
  if (owner !== undefined && owner !== song.id) return false;
  return keys.some((k) => editDistance(g, k, tolerance(k.length)) <= tolerance(k.length));
}
