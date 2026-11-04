// Quantas linhas as casinhas do título ocupam: o CSS dimensiona a casinha pela MAIOR palavra (uma palavra por linha
// no pior caso), o que num celular em pé deixa um título de 4 palavras com 4 linhas e sem espaço pro vídeo. Aqui
// calculamos a largura de linha (em "casinhas") em que as palavras cabem em no máximo N linhas; o CSS usa esse número
// quando o palco é baixo.

/** Espaço entre duas palavras, em casinhas (o mesmo `calc(var(--sw) * 0.6)` do CSS). */
export const WORD_GAP = 0.6;

export interface RowFit {
  /** Largura da linha mais larga, em casinhas (letras + espaços entre palavras). */
  units: number;
  /** Letras da linha mais larga (pra descontar o vão entre elas). */
  letters: number;
  /** Linhas que o título realmente usa nessa largura. */
  rows: number;
}

/** Arruma as palavras em linhas, sem partir nenhuma, cada linha com no máximo `width` casinhas. */
function pack(lengths: number[], width: number): { rows: number; widest: { units: number; letters: number } } {
  let rows = 0;
  let units = 0;
  let letters = 0;
  const widest = { units: 0, letters: 0 };
  for (const len of lengths) {
    const next = units === 0 ? len : units + WORD_GAP + len;
    if (units > 0 && next > width + 1e-9) {
      rows++;
      units = len;
      letters = len;
    } else {
      units = next;
      letters += len;
    }
    if (units > widest.units) {
      widest.units = units;
      widest.letters = letters;
    }
  }
  if (units > 0) rows++;
  return { rows, widest };
}

/** A menor largura de linha em que as palavras (tamanhos em letras) cabem em `maxRows` linhas ou menos. */
export function fitRows(lengths: number[], maxRows: number): RowFit {
  const words = lengths.filter((n) => n > 0);
  if (words.length === 0) return { units: 1, letters: 1, rows: 0 };
  const rowsAllowed = Math.max(1, Math.floor(maxRows));
  const longest = Math.max(...words);
  // as larguras possíveis de uma linha são as de trechos seguidos de palavras
  const candidates = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    let sum = 0;
    for (let j = i; j < words.length; j++) {
      sum += words[j] + (j > i ? WORD_GAP : 0);
      if (sum >= longest) candidates.add(sum);
    }
  }
  for (const width of [...candidates].sort((a, b) => a - b)) {
    const { rows, widest } = pack(words, width);
    if (rows <= rowsAllowed) return { ...widest, rows };
  }
  const all = pack(words, longest);
  return { ...all.widest, rows: all.rows };
}
