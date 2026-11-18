"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { MAX_LIVES } from "@/lib/forca/engine";

// A forca desenhada em SVG: a estrutura fica sempre; cada erro desenha mais uma parte do bonequinho
// que a mesa DIVIDE — cabeça, tronco, braço esquerdo, braço direito, perna esquerda, perna direita,
// olhos, nariz, boca e, por último, o chapéu (10 partes pra 10 erros: com o chapéu a forca fecha).
// Rodada perdida: o boneco balança na corda, com olhos de "X" e a boca triste.

interface Part {
  key: string;
  render: (ctx: { lost: boolean }) => ReactNode;
}

const draw = { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.45, ease: "easeOut" as const } };
const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } };

export const PARTS: Part[] = [
  { key: "head", render: () => <motion.circle data-forca-part="head" cx={140} cy={72} r={19} {...draw} /> },
  { key: "body", render: () => <motion.path data-forca-part="body" d="M140 91 L140 150" {...draw} /> },
  { key: "left-arm", render: () => <motion.path data-forca-part="left-arm" d="M140 104 L113 130" {...draw} /> },
  { key: "right-arm", render: () => <motion.path data-forca-part="right-arm" d="M140 104 L167 130" {...draw} /> },
  { key: "left-leg", render: () => <motion.path data-forca-part="left-leg" d="M140 150 L117 196" {...draw} /> },
  { key: "right-leg", render: () => <motion.path data-forca-part="right-leg" d="M140 150 L163 196" {...draw} /> },
  {
    key: "eyes",
    render: ({ lost }) => (
      <motion.g data-forca-part="eyes" data-eyes={lost ? "x" : "dots"} strokeWidth={2.6} {...fade}>
        {lost ? (
          <>
            <path d="M129.5 63.5 L135.5 69.5 M135.5 63.5 L129.5 69.5" />
            <path d="M144.5 63.5 L150.5 69.5 M150.5 63.5 L144.5 69.5" />
          </>
        ) : (
          <>
            <circle cx={133} cy={66.5} r={2.3} fill="currentColor" stroke="none" />
            <circle cx={147} cy={66.5} r={2.3} fill="currentColor" stroke="none" />
          </>
        )}
      </motion.g>
    ),
  },
  { key: "nose", render: () => <motion.path data-forca-part="nose" d="M140 69 L138 77 L142 77" strokeWidth={2.4} {...fade} /> },
  {
    key: "mouth",
    render: ({ lost }) => <motion.path data-forca-part="mouth" data-mouth={lost ? "frown" : "smile"} d={lost ? "M132 86 Q140 79.5 148 86" : "M132 82 Q140 88.5 148 82"} strokeWidth={2.6} {...fade} />,
  },
  {
    key: "hat",
    render: () => (
      <motion.g data-forca-part="hat" initial={{ y: -26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 15 }}>
        <path d="M129 53 L129 33 L151 33 L151 53" fill="#18181b" strokeWidth={4} />
        <path d="M129 46.5 L151 46.5" stroke="#ef4444" strokeWidth={4.5} />
        <path d="M120 53 L160 53" strokeWidth={5} />
      </motion.g>
    ),
  },
];

const BEAM = "#a1a1aa";

interface GallowsProps {
  /** Partes que ainda faltam desenhar (de MAX_LIVES a 0). */
  lives: number;
  /** A rodada foi perdida: o boneco balança. */
  lost?: boolean;
  className?: string;
}

export function Gallows({ lives, lost = false, className = "" }: GallowsProps) {
  const drawn = Math.max(0, Math.min(PARTS.length, MAX_LIVES - lives));
  // Quanto mais perto do fim, mais vermelho.
  const stroke = drawn >= 8 ? "#f87171" : drawn >= 5 ? "#fb923c" : "#fbbf24";
  return (
    <svg
      viewBox="0 0 200 240"
      className={className}
      role="img"
      aria-label={`Forca: ${lives} ${lives === 1 ? "parte restante" : "partes restantes"} no boneco`}
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
      <g className={lost ? "forca-swing" : undefined} stroke={stroke} strokeWidth={6} style={{ color: stroke }}>
        {PARTS.slice(0, drawn).map((p) => (
          <g key={p.key}>{p.render({ lost })}</g>
        ))}
      </g>
    </svg>
  );
}
