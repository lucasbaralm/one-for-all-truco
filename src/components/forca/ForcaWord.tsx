"use client";

import { motion } from "framer-motion";
import { normalize } from "@/lib/forca/words";

// A palavra (ou frase) da rodada: uma casinha por letra, as palavras de uma frase agrupadas (uma
// palavra nunca se parte ao meio: se a frase não cabe numa linha, quebra entre as palavras). Letra
// revelada pula pra dentro; quando a rodada acaba, as que ninguém tinha chutado aparecem destacadas
// (vermelho se o boneco fechou, verde se alguém chutou a palavra inteira). Quem ESCOLHEU a palavra
// recebe `secret`: vê as letras que faltam, apagadinhas, no lugar certo.

interface ForcaWordProps {
  /** Letra (com acento) onde já foi revelada, " " nos espaços, null onde está escondida. */
  pattern: (string | null)[];
  /** Letras já chutadas (sem acento). */
  tried: Set<string>;
  status: "playing" | "won" | "lost" | null;
  /** A palavra inteira, só pra quem escolheu (as letras escondidas aparecem apagadas). */
  secret?: string | null;
}

interface Cell {
  /** Posição na palavra inteira (pra casar com `secret`). */
  index: number;
  ch: string | null;
}

/** Quebra o padrão em palavras (os espaços viram só a separação entre os grupos). */
function wordsOf(pattern: (string | null)[]): Cell[][] {
  const groups: Cell[][] = [[]];
  pattern.forEach((ch, index) => {
    if (ch === " ") groups.push([]);
    else groups[groups.length - 1].push({ index, ch });
  });
  return groups.filter((g) => g.length > 0);
}

export function ForcaWord({ pattern, tried, status, secret = null }: ForcaWordProps) {
  const groups = wordsOf(pattern);
  const letters = groups.reduce((n, g) => n + g.length, 0);
  // A casinha é dimensionada pela MAIOR palavra (cada palavra cabe numa linha; as palavras se arrumam em linhas).
  const longest = Math.max(1, ...groups.map((g) => g.length));
  const secretChars = secret ? [...secret] : null;
  return (
    <div className="forca-wordwrap">
      <div className="forca-word" style={{ ["--maxw" as string]: String(longest) }} data-forca-word="" data-words={groups.length} aria-label={`Palavra com ${letters} letras`}>
        {groups.map((group) => (
          <div key={group[0].index} className="forca-wordgroup">
            {group.map(({ index, ch }) => {
              const shown = ch !== null;
              const guessed = shown && tried.has(normalize(ch));
              // Mostrada sem ter sido chutada = revelada no fim da rodada.
              const revealedAtEnd = shown && !guessed;
              const tone = revealedAtEnd ? (status === "lost" ? "text-red-400" : "text-emerald-300") : "text-white";
              const hiddenLetter = !shown && secretChars ? secretChars[index] : null;
              return (
                <div key={index} className="forca-slot" data-slot={shown ? ch : ""} data-revealed={shown ? "true" : "false"} data-end={revealedAtEnd ? "true" : "false"} data-secret={hiddenLetter ? "true" : undefined}>
                  {shown && (
                    <motion.span
                      className={`forca-glyph ${tone}`}
                      initial={{ scale: 0.3, y: -14, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 18 }}
                    >
                      {ch}
                    </motion.span>
                  )}
                  {hiddenLetter && <span className="forca-glyph text-white/35">{hiddenLetter}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
