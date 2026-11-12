"use client";

import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { fitRows } from "@/lib/mimica/wordFit";

// O título da música como casinhas, uma por letra: as palavras ficam agrupadas (uma palavra nunca se parte ao
// meio: se o título não cabe numa linha, quebra entre as palavras) e a pontuação (apóstrofo, hífen, "?") aparece
// no lugar, sem casinha. Letra revelada pula pra dentro. Quando o turno acaba, as letras que ninguém tinha visto
// aparecem destacadas (verde se alguém acertou, vermelho se não). A pessoa que faz a mímica recebe `secret` e vê o
// título inteiro, apagadinho, no lugar certo.

interface MimicaWordProps {
  /** Letra onde já foi revelada, " " entre as palavras, a pontuação como está, null onde está escondida. */
  pattern: (string | null)[];
  /** O turno acabou: o que não estava à vista aparece destacado. */
  ended?: "solved" | "failed" | null;
  /** O título (principal) inteiro, só pra quem faz a mímica. */
  secret?: string | null;
  /** Quais posições já estavam reveladas antes do fim (pra destacar só o que faltava). */
  revealedBefore?: Set<number>;
}

interface Cell {
  index: number;
  ch: string | null;
}

const isGlyph = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/** Quebra o padrão em palavras (os espaços viram só a separação entre os grupos). */
function wordsOf(pattern: (string | null)[]): Cell[][] {
  const groups: Cell[][] = [[]];
  pattern.forEach((ch, index) => {
    if (ch === " ") groups.push([]);
    else groups[groups.length - 1].push({ index, ch });
  });
  return groups.filter((g) => g.length > 0);
}

export function MimicaWord({ pattern, ended = null, secret = null, revealedBefore }: MimicaWordProps) {
  const groups = wordsOf(pattern);
  // A casinha é dimensionada pela MAIOR palavra (cada palavra cabe numa linha; as palavras se arrumam em linhas).
  const lengths = groups.map((g) => g.length);
  const longest = Math.max(1, ...lengths);
  // Em tela baixa o CSS troca "uma palavra por linha" por "no máximo 2, 3 ou 4 linhas": --pu/--pl são a largura da
  // linha mais larga (em casinhas) e quantas letras ela tem; --r é quantas linhas o título usa de fato.
  const two = fitRows(lengths, 2);
  const three = fitRows(lengths, 3);
  const four = fitRows(lengths, 4);
  const letters = pattern.filter((c) => c === null || (c !== " " && isGlyph(c))).length;
  const secretChars = secret ? [...secret] : null;
  const vars = {
    "--maxw": String(longest),
    "--pu2": String(two.units),
    "--pl2": String(two.letters),
    "--r2": String(Math.max(1, two.rows)),
    "--pu3": String(three.units),
    "--pl3": String(three.letters),
    "--r3": String(Math.max(1, three.rows)),
    "--pu4": String(four.units),
    "--pl4": String(four.letters),
    "--r4": String(Math.max(1, four.rows)),
  } as CSSProperties;
  return (
    <div className="mimica-wordwrap">
      <div className="mimica-word" style={vars} data-mimica-word="" data-words={groups.length} aria-label={`Título com ${letters} letras`}>
        {groups.map((group) => (
          <div key={group[0].index} className="mimica-wordgroup">
            {group.map(({ index, ch }) => {
              if (ch !== null && !isGlyph(ch)) {
                return (
                  <span key={index} className="mimica-mark" data-mark={ch}>
                    {ch}
                  </span>
                );
              }
              const shown = ch !== null;
              const lateReveal = shown && ended !== null && revealedBefore !== undefined && !revealedBefore.has(index);
              const tone = lateReveal ? (ended === "solved" ? "text-emerald-300" : "text-red-400") : "text-white";
              const hiddenLetter = !shown && secretChars ? secretChars[index] : null;
              return (
                <div key={index} className="mimica-slot" data-slot={shown ? ch : ""} data-revealed={shown ? "true" : "false"} data-secret={hiddenLetter ? "true" : undefined}>
                  {shown && (
                    <motion.span
                      className={`mimica-glyph ${tone}`}
                      initial={{ scale: 0.3, y: -14, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 18 }}
                    >
                      {ch}
                    </motion.span>
                  )}
                  {hiddenLetter && <span className="mimica-glyph text-white/35">{hiddenLetter}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
