// Todos os jogos gravam na mesma tabela match_history; o prefixo do room_id é
// o que separa um do outro (party/ludo.ts, party/dobble.ts...). Sem prefixo = Fodinha.

export type Game = "fodinha" | "ludo" | "dobble" | "uno" | "forca";

export const HISTORY_PREFIX: Record<Exclude<Game, "fodinha">, string> = { ludo: "LUDO:", dobble: "DOBBLE:", uno: "UNO:", forca: "FORCA:" };

/** Os jogos com prefixo (todos menos a Fodinha). */
export const PREFIXED_GAMES = Object.keys(HISTORY_PREFIX) as Exclude<Game, "fodinha">[];

export interface Summary {
  name: string;
  score: number;
  mode?: string;
}

export function gameOf(roomId: string): Game {
  return PREFIXED_GAMES.find((g) => roomId.startsWith(HISTORY_PREFIX[g])) ?? "fodinha";
}

/** O código da sala sem o prefixo do jogo (é o que a pessoa conhece). */
export function roomCodeOf(roomId: string): string {
  const game = gameOf(roomId);
  return game === "fodinha" ? roomId : roomId.slice(HISTORY_PREFIX[game].length);
}

/** Uma linha do resultado de um jogador, no jeito que cada jogo conta pontos. */
export function describeResult(game: Game, p: Summary): string {
  if (game === "ludo") return `${p.name} (${p.score}/4 em casa)`;
  if (game === "dobble") {
    // Torre: cartas na pilha. Poço: cartas que faltavam jogar.
    return p.mode === "well" ? `${p.name} (${p.score === 0 ? "acabou" : `faltavam ${p.score}`})` : `${p.name} (${p.score} ${p.score === 1 ? "carta" : "cartas"})`;
  }
  if (game === "uno") return `${p.name} (${p.score === 0 ? "zerou a mão" : `${p.score} ${p.score === 1 ? "carta" : "cartas"}`})`;
  if (game === "forca") return `${p.name} (${p.score} pts)`;
  return `${p.name} (${p.score})`;
}
