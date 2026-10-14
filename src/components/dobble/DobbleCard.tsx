"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { SYMBOLS } from "@/lib/dobble/cards";
import { layoutCard } from "./symbolLayout";

// Todos os símbolos usam O MESMO tamanho de fonte — o do maior possível. O "tamanho variado" que
// faz o Dobble ser desafiador sai de um scale() (que só mexe na composição). Se cada símbolo tivesse
// um font-size próprio, o navegador teria que criar uma fonte nova e refazer o layout do texto pra
// cada símbolo de cada carta nova: eram os travadinhos de 40–80ms a cada rodada.
export const GLYPH_FULL_SIZE = 32; // % do diâmetro da carta (o maior símbolo sorteado tem ~31,9)

interface DobbleCardProps {
  /** Id da carta (null = virada pra baixo). */
  card: number | null;
  /** Diâmetro: qualquer medida CSS (ex.: "var(--c)", "3rem"). */
  size: string;
  /** Qual carta é (pra testes e leitores de tela). */
  role: "mine" | "center" | "mini";
  /** Símbolo a destacar (o que foi achado). */
  highlight?: number | null;
  /** Símbolo marcado como errado (a carta treme). */
  wrong?: number | null;
  /** Presente = os símbolos são clicáveis. */
  onSymbol?: (symbol: number) => void;
  disabled?: boolean;
}

// Uma carta do Dobble: círculo branco com 8 emojis. Clicável quando `onSymbol`
// existe. Cada símbolo carrega data-symbol — é como o teste ponta a ponta
// (e qualquer automação) acha o símbolo igual nas duas cartas.
export const DobbleCard = memo(function DobbleCard({ card, size, role, highlight = null, wrong = null, onSymbol, disabled }: DobbleCardProps) {
  const interactive = !!onSymbol && !disabled;
  return (
    <div
      data-card={role}
      data-card-id={card ?? undefined}
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, ["--card" as string]: size }}
    >
      {/* carta */}
      <div
        className={`absolute inset-0 rounded-full border-[0.35rem] shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_0_30px_rgba(0,0,0,0.08)] ${
          card === null ? "border-indigo-300 bg-gradient-to-br from-indigo-500 to-fuchsia-600" : "border-white bg-gradient-to-br from-white to-zinc-100"
        }`}
      />

      {card === null ? (
        <div className="absolute inset-0 flex items-center justify-center text-[calc(var(--card)*0.34)] font-black text-white/80">?</div>
      ) : (
        layoutCard(card).map((spot) => {
          const isHit = highlight === spot.symbol;
          const isWrong = wrong === spot.symbol;
          const box = {
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            width: `${spot.size}%`,
            height: `${spot.size}%`,
          };
          const glyph = (
            <span
              className="flex h-full w-full items-center justify-center leading-none select-none"
              style={{
                fontSize: `calc(var(--card) * ${(GLYPH_FULL_SIZE * 0.8) / 100})`,
                transform: `rotate(${spot.rotate}deg) scale(${(spot.size / GLYPH_FULL_SIZE).toFixed(3)})`,
              }}
            >
              {SYMBOLS[spot.symbol]}
            </span>
          );
          return (
            <div key={spot.symbol} className="absolute -translate-x-1/2 -translate-y-1/2" style={box}>
              {isHit && (
                <motion.span
                  className="absolute -inset-[18%] rounded-full bg-yellow-300/60 ring-4 ring-yellow-400"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: [0.4, 1.35, 1.15], opacity: 1 }}
                  transition={{ duration: 0.45 }}
                  style={{ boxShadow: "0 0 24px 6px rgba(250,204,21,0.8)" }}
                />
              )}
              {isWrong && (
                <motion.span
                  className="absolute -inset-[12%] rounded-full bg-red-500/50 ring-2 ring-red-500"
                  initial={{ opacity: 1, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.4 }}
                  transition={{ duration: 0.7 }}
                />
              )}
              {interactive ? (
                <motion.button
                  type="button"
                  data-symbol={spot.symbol}
                  aria-label={`Símbolo ${SYMBOLS[spot.symbol]}`}
                  onClick={() => onSymbol(spot.symbol)}
                  whileHover={{ scale: 1.18 }}
                  whileTap={{ scale: 0.88 }}
                  className="relative h-full w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {glyph}
                </motion.button>
              ) : (
                <span data-symbol={spot.symbol} className="relative block h-full w-full">
                  {glyph}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
});
