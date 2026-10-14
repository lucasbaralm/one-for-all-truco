"use client";

import { motion } from "framer-motion";
import { MAX_LIVES } from "@/lib/forca/engine";

// A forca desenhada em SVG: a estrutura fica sempre; cada vida perdida desenha uma parte do
// bonequinho (cabeça, tronco, braços, pernas — 6 partes pra 6 vidas) com um traço animado.
// Rodada perdida: o boneco balança na corda.

interface Part {
  key: string;
  /** Desenho da parte; a cabeça é um círculo, o resto é traço. */
  el: { circle: { cx: number; cy: number; r: number } } | { d: string };
}

export const PARTS: Part[] = [
  { key: "head", el: { circle: { cx: 140, cy: 72, r: 19 } } },
  { key: "body", el: { d: "M140 91 L140 150" } },
  { key: "left-arm", el: { d: "M140 104 L113 130" } },
  { key: "right-arm", el: { d: "M140 104 L167 130" } },
  { key: "left-leg", el: { d: "M140 150 L117 196" } },
  { key: "right-leg", el: { d: "M140 150 L163 196" } },
];

const BEAM = "#a1a1aa";

interface GallowsProps {
  /** Vidas que sobraram (de MAX_LIVES a 0). */
  lives: number;
  /** A rodada foi perdida: o boneco balança. */
  lost?: boolean;
  className?: string;
}

export function Gallows({ lives, lost = false, className = "" }: GallowsProps) {
  const drawn = Math.max(0, Math.min(PARTS.length, MAX_LIVES - lives));
  // Quanto mais perto do fim, mais vermelho.
  const stroke = drawn >= 5 ? "#f87171" : drawn >= 3 ? "#fb923c" : "#fbbf24";
  return (
    <svg
      viewBox="0 0 200 240"
      className={className}
      role="img"
      aria-label={`Forca: ${lives} ${lives === 1 ? "vida restante" : "vidas restantes"}`}
      data-forca-gallows=""
      data-lost={drawn}
      data-dead={lost ? "true" : "false"}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* estrutura */}
      <g stroke={BEAM} strokeWidth={7}>
        <path d="M18 226 L132 226" />
        <path d="M52 226 L52 20" />
        <path d="M52 20 L140 20" />
        <path d="M52 62 L94 20" strokeWidth={5} />
      </g>
      <path d="M140 20 L140 53" stroke="#d4d4d8" strokeWidth={4} />
      {/* o bonequinho */}
      <g className={lost ? "forca-swing" : undefined} stroke={stroke} strokeWidth={6}>
        {PARTS.slice(0, drawn).map((p) =>
          "circle" in p.el ? (
            <motion.circle
              key={p.key}
              data-forca-part={p.key}
              {...p.el.circle}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          ) : (
            <motion.path
              key={p.key}
              data-forca-part={p.key}
              d={p.el.d}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          )
        )}
        {lost && drawn >= 1 && (
          // olhos de "X" na cabeça
          <g strokeWidth={3} data-forca-part="eyes">
            <path d="M132 66 L138 72 M138 66 L132 72" />
            <path d="M142 66 L148 72 M148 66 L142 72" />
          </g>
        )}
      </g>
    </svg>
  );
}
