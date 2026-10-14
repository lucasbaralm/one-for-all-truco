"use client";

import type { Guess } from "@/lib/forca/engine";

// Teclado A–Z (disposição QWERTY, a que o teclado de verdade tem). Cada tecla mostra o que
// aconteceu com a letra: acertou (verde), errou (vermelho) — e quem chutou, na cor dele.

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

interface ForcaKeyboardProps {
  guesses: Guess[];
  /** Cor de cada jogador (id → cor), pra marcar quem chutou a letra. */
  colorOf: (playerId: string) => string;
  enabled: boolean;
  onPick: (letter: string) => void;
}

export function ForcaKeyboard({ guesses, colorOf, enabled, onPick }: ForcaKeyboardProps) {
  const byLetter = new Map(guesses.map((g) => [g.letter, g]));
  return (
    <div className="forca-keys" data-forca-keys="">
      {ROWS.map((row) => (
        <div key={row} className="forca-keyrow">
          {[...row].map((l) => {
            const g = byLetter.get(l);
            const state = g ? (g.hits > 0 ? "hit" : "miss") : "free";
            const usable = enabled && !g;
            return (
              <button
                key={l}
                type="button"
                onClick={() => usable && onPick(l)}
                disabled={!usable}
                data-forca-key={l}
                data-state={state}
                aria-label={g ? `${l}: ${g.hits > 0 ? "tem" : "não tem"}` : `Chutar ${l}`}
                className="forca-key"
                style={g ? { borderBottomColor: colorOf(g.by) } : undefined}
              >
                {l}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
