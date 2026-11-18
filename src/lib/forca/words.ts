// Texto da Forca: as palavras agora são digitadas por quem escolhe a rodada (sem lista nem
// categoria — a dica é falada na call). Aqui ficam as peças de texto: tirar o acento, aceitar
// só letras e espaços e montar a palavra/frase da rodada.
//
// O jogo compara as letras SEM acento: chutar "A" revela o "Ã" de AVIÃO.

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Letras mais comuns em português, da mais pra menos frequente (o chute automático do tempo esgotado). */
export const LETTER_ORDER = "AEOSRIDNMTCULPVGQBFHZJXKWY";

/** Mínimo de letras da palavra/frase e máximo de caracteres (contando os espaços). */
export const MIN_WORD_LETTERS = 2;
export const MAX_WORD_CHARS = 30;

/** Os acentos, depois do normalize("NFD"): marcas combinantes U+0300 a U+036F. */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** "avião" → "AVIAO": maiúsculas, sem acento, só A–Z (o resto é descartado). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export interface ParsedWord {
  /** Como aparece na tela: maiúsculas, COM acento, espaços simples entre as palavras. */
  word: string;
  /** Uma letra A–Z (sem acento) por caractere de `word`, e " " nos espaços — alinhada com `word`. */
  norm: string;
}

/**
 * Lê o que o escolhedor digitou. Só vale letras e espaços (acentos ficam); qualquer outro
 * caractere (número, hífen, símbolo) recusa a palavra, em vez de mudar o que ele quis dizer.
 * Devolve null se não presta (poucas letras, comprida demais, caractere estranho).
 */
export function parseWord(raw: string): ParsedWord | null {
  if (typeof raw !== "string") return null;
  const chars = [...raw.trim().toUpperCase().replace(/\s+/g, " ")];
  let word = "";
  let norm = "";
  for (const ch of chars) {
    if (ch === " ") {
      word += " ";
      norm += " ";
      continue;
    }
    const n = normalize(ch);
    if (n.length !== 1) return null;
    word += ch;
    norm += n;
  }
  if (word.length > MAX_WORD_CHARS) return null;
  if (norm.replace(/ /g, "").length < MIN_WORD_LETTERS) return null;
  return { word, norm };
}
