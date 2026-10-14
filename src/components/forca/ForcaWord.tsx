"use client";

import { motion } from "framer-motion";
import { normalize } from "@/lib/forca/words";

// A palavra da rodada: uma casinha por letra. Letra revelada pula pra dentro; quando a
// rodada acaba, as que ninguém tinha chutado aparecem destacadas (vermelho se a forca
// fechou, verde se alguém chutou a palavra inteira).

interface ForcaWordProps {
  /** Letra (com acento) onde já foi revelada, null onde está escondida. */
  pattern: (string | null)[];
  /** Letras já chutadas (sem acento). */
  tried: Set<string>;
  status: "playing" | "won" | "lost" | null;
}

export function ForcaWord({ pattern, tried, status }: ForcaWordProps) {
  const n = Math.max(1, pattern.length);
  return (
    <div className="forca-wordwrap">
      <div className="forca-word" style={{ ["--n" as string]: String(n) }} data-forca-word="" aria-label={`Palavra com ${pattern.length} letras`}>
        {pattern.map((ch, i) => {
          const shown = ch !== null;
          const guessed = shown && tried.has(normalize(ch));
          // Mostrada sem ter sido chutada = revelada no fim da rodada.
          const revealedAtEnd = shown && !guessed;
          const tone = revealedAtEnd ? (status === "lost" ? "text-red-400" : "text-emerald-300") : "text-white";
          return (
            <div key={i} className="forca-slot" data-slot={shown ? ch : ""} data-revealed={shown ? "true" : "false"} data-end={revealedAtEnd ? "true" : "false"}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
