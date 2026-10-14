"use client";

import { memo } from "react";
import { UnoCard as Card, cardOf } from "@/lib/uno/cards";
import { COLOR_HEX } from "@/lib/uno/labels";
import { cardName } from "@/lib/uno/labels";

// Uma carta do Uno desenhada em CSS (sem imagens): fundo da cor, oval branca
// inclinada no meio, o número/símbolo grande e pequenininho nos cantos. O
// tamanho é a LARGURA (`size`: qualquer medida CSS, ex.: "var(--uc)"); a altura
// segue a proporção 2:3. Cada carta carrega data-uno-card (o id) — é como o
// teste ponta a ponta acha a carta que quer jogar.

const WILD_BG = "conic-gradient(from 45deg, #ef4444 0 25%, #facc15 0 50%, #22c55e 0 75%, #3b82f6 0 100%)";

function symbolOf(card: Card): string {
  switch (card.kind) {
    case "number":
      return String(card.value);
    case "skip":
      return "⊘";
    case "reverse":
      return "⇄";
    case "draw2":
      return "+2";
    case "wild":
      return "★";
    case "wild4":
      return "+4";
  }
}

interface UnoCardViewProps {
  /** Id da carta (null = virada pra baixo). */
  card: number | null;
  size: string;
  /** Escurecida: não pode ser jogada agora. */
  dim?: boolean;
  /** Em destaque (a que posso jogar). */
  glow?: boolean;
  className?: string;
}

export const UnoCardView = memo(function UnoCardView({ card, size, dim, glow, className = "" }: UnoCardViewProps) {
  const shape = "relative shrink-0 select-none overflow-hidden rounded-[0.55rem] border-[0.18rem] border-white shadow-[0_6px_14px_rgba(0,0,0,0.5)]";
  const dims = { width: size, aspectRatio: "2 / 3" } as const;

  if (card === null) {
    return (
      <div data-uno-card="back" className={`${shape} bg-zinc-900 ${className}`} style={dims} aria-hidden>
        <div className="absolute inset-[10%] grid place-items-center rounded-[50%] bg-red-600 [transform:rotate(-24deg)]">
          <span className="font-black italic text-yellow-300" style={{ fontSize: `calc(${size} * 0.26)` }}>
            UNO
          </span>
        </div>
      </div>
    );
  }

  const c = cardOf(card);
  const bg = c.color ? COLOR_HEX[c.color] : WILD_BG;
  const symbol = symbolOf(c);
  // 6 e 9 se confundem de cabeça pra baixo: sublinhados, como na carta de verdade.
  const underline = c.kind === "number" && (c.value === 6 || c.value === 9) ? "underline" : "";
  const wild = c.kind === "wild" || c.kind === "wild4";
  return (
    <div
      data-uno-card={card}
      aria-label={cardName(c)}
      className={`${shape} ${className}`}
      style={{
        ...dims,
        background: bg,
        filter: dim ? "brightness(0.45) saturate(0.6)" : undefined,
        boxShadow: glow ? "0 0 0 3px #fff, 0 0 18px 4px rgba(255,255,255,0.75)" : undefined,
      }}
    >
      <span className={`absolute left-[9%] top-[5%] font-black leading-none text-white ${underline}`} style={{ fontSize: `calc(${size} * 0.2)`, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
        {symbol}
      </span>
      <span
        className={`absolute bottom-[5%] right-[9%] rotate-180 font-black leading-none text-white ${underline}`}
        style={{ fontSize: `calc(${size} * 0.2)`, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
      >
        {symbol}
      </span>
      <div className="absolute inset-[12%] grid place-items-center rounded-[50%] bg-white/95 [transform:rotate(-24deg)]">
        <span
          className={`font-black leading-none ${underline}`}
          style={{ fontSize: `calc(${size} * ${wild ? 0.34 : 0.42})`, color: c.color ? bg : "#1f2937", transform: "rotate(24deg)" }}
        >
          {symbol}
        </span>
      </div>
    </div>
  );
});
