// Texto dos títulos da Mímica: comparar o chute com a resposta (sem acento, sem pontuação, com
// tolerância a erro de digitação) e montar o "padrão" que quem chuta enxerga (uma casinha por letra).
//
// A resposta de "Habits (Stay High)" vale como "Habits", como "Habits Stay High" e como "habits stay hight":
// o que vem entre parênteses é complemento, ninguém é obrigado a digitar.

const COMBINING_MARKS = /[̀-ͯ]/g;

/** "Coração Partido!" → "coracaopartido": minúsculas, sem acento, só letras e dígitos, sem espaços. */
export function titleKey(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** O título sem o que vem entre parênteses ("Habits (Stay High)" → "Habits"). É o que aparece nas casinhas. */
export function mainTitle(title: string): string {
  const main = title.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return main || title.trim();
}

/** "&" pode ser dito "e", "and" ou nem dito. */
const AMPERSAND_WORDS = ["", "e", "and", "y"];

function keysOf(text: string): string[] {
  if (!text.includes("&")) return [titleKey(text)];
  return AMPERSAND_WORDS.map((w) => titleKey(text.replace(/&/g, ` ${w} `)));
}

/** Todas as formas de escrever a resposta (sem duplicar, sem vazias). */
export function answerKeys(title: string): string[] {
  const keys = new Set([...keysOf(mainTitle(title)), ...keysOf(title)]);
  keys.delete("");
  return [...keys];
}

/** Quantos erros de digitação cada tamanho de resposta aceita (nas curtas, nenhum: "Lover" ≠ "Lovers"). */
export function tolerance(length: number): number {
  return length >= 14 ? 2 : length >= 6 ? 1 : 0;
}

/** Distância de edição (inserir/tirar/trocar uma letra), parando assim que passa de `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** O chute acerta o título? Ignora acento, maiúscula, pontuação e espaço, e perdoa um errinho de digitação. */
export function matchesTitle(guess: string, title: string): boolean {
  const g = titleKey(guess);
  if (!g) return false;
  return answerKeys(title).some((k) => g === k || editDistance(g, k, tolerance(k.length)) <= tolerance(k.length));
}

const isGlyph = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/**
 * O título como QUEM CHUTA enxerga: null onde a letra (ou dígito) está escondida, e o próprio caractere
 * nos espaços e na pontuação (apóstrofo, hífen, "?"...). `hint` = 1 mostra a primeira letra de cada
 * palavra; `revealAll` mostra tudo (fim do turno).
 */
export function titlePattern(title: string, hint: 0 | 1 = 0, revealAll = false): (string | null)[] {
  let atWordStart = true;
  return [...mainTitle(title)].map((ch) => {
    if (/\s/.test(ch)) {
      atWordStart = true;
      return " ";
    }
    if (!isGlyph(ch)) return ch;
    const show = revealAll || (hint >= 1 && atWordStart);
    atWordStart = false;
    return show ? ch : null;
  });
}

/** Tamanho do título pra anunciar ("2 palavras, 9 letras") — não entrega nada que as casinhas não mostrem. */
export function titleShape(title: string): { words: number; letters: number } {
  const main = mainTitle(title);
  const words = main.split(/\s+/).filter((w) => [...w].some(isGlyph)).length;
  const letters = [...main].filter(isGlyph).length;
  return { words, letters };
}
