// IA dos bots da Forca. Os bots só enxergam o que um jogador enxerga (a palavra
// parcialmente revelada, a categoria e as letras já chutadas) e usam a lista de
// palavras do jogo como dicionário:
//  • easy   — metade das vezes chuta pela frequência das letras em português,
//             sem olhar o dicionário; só arrisca a palavra inteira de vez em quando.
//  • medium — escolhe a letra que aparece em mais palavras possíveis; às vezes relaxa.
//  • hard   — sempre a melhor letra do dicionário; chuta a palavra quando só resta uma.

import { currentPlayer, ForcaState, publicPattern, triedLetters, BotLevel } from "./engine";
import { BOT_SLOPPY } from "./timing";
import { LETTER_ORDER, WORDS, normalize } from "./words";

type Rng = () => number;

export type BotAction = { type: "letter"; letter: string } | { type: "word"; word: string };

/** Palavras da lista que ainda cabem no que está na tela (mesmo tamanho, letras reveladas nos lugares certos, nenhuma letra já chutada nos lugares escondidos). */
export function candidatesFor(state: ForcaState): string[] {
  const round = state.round;
  if (!round) return [];
  const pattern = publicPattern(round);
  const tried = triedLetters(round);
  const matches = (word: string) => {
    const norm = normalize(word);
    if (norm.length !== pattern.length) return false;
    for (let i = 0; i < norm.length; i++) {
      const shown = pattern[i];
      if (shown !== null) {
        if (normalize(shown) !== norm[i]) return false;
      } else if (tried.has(norm[i])) return false;
    }
    return true;
  };
  const all = WORDS.filter((w) => !state.usedWords.slice(0, -1).includes(w.word) && matches(w.word));
  // A categoria é dica pública: se ainda há palavra dela, fica só com elas.
  const inCategory = all.filter((w) => w.category === round.category);
  return (inCategory.length > 0 ? inCategory : all).map((w) => w.word);
}

export function chooseBotAction(state: ForcaState, level: BotLevel, rng: Rng = Math.random): BotAction | null {
  const round = state.round;
  if (state.phase !== "playing" || !round || !currentPlayer(state)) return null;
  const tried = triedLetters(round);
  const free = [...LETTER_ORDER].filter((l) => !tried.has(l));
  if (free.length === 0) return null;

  const candidates = candidatesFor(state);
  // Só uma palavra possível: o difícil e o médio arriscam; o fácil às vezes.
  if (candidates.length === 1 && (level !== "easy" || rng() < 0.4)) return { type: "word", word: candidates[0] };

  const sloppy = rng() < BOT_SLOPPY[level];
  if (sloppy || candidates.length === 0) {
    // pela frequência das letras, com um pouquinho de sorte entre as 3 primeiras
    return { type: "letter", letter: free[Math.floor(rng() * Math.min(3, free.length))] };
  }

  // A letra que aparece em MAIS palavras possíveis (desempate: a mais comum em português).
  const score = (l: string) => candidates.filter((w) => normalize(w).includes(l)).length;
  const best = free.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { type: "letter", letter: best };
}
