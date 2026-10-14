"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Card as GameCard } from "@/lib/game/rules";
import { PlayingCard } from "./PlayingCard";

// ─────────────────────────────────────────────────────────────────────────────
// HAND CARD — uma carta arrastável na minha mão. Arrastar e soltar em cima da
// mesa (tableDropRef) joga a carta de verdade; soltar em qualquer outro lugar
// só reorganiza a mão (reordena pra posição mais próxima de onde caiu). Um
// toque sem arrastar não faz nada — de propósito, pra não jogar sem querer
// enquanto só se está tentando reorganizar.
// ─────────────────────────────────────────────────────────────────────────────
export function HandCard({
  cardKey,
  card,
  hidden,
  theme,
  backIndex,
  isMyTurn,
  canDrag,
  marginLeftRem,
  fanAngle,
  layoutId,
  onRegisterRef,
  onPlay,
  onReorder,
  tableDropRef,
}: {
  cardKey: string;
  card: GameCard;
  hidden: boolean;
  theme: string;
  backIndex: number;
  isMyTurn: boolean;
  canDrag: boolean;
  marginLeftRem: number;
  fanAngle: number;
  layoutId: string;
  onRegisterRef: (key: string, el: HTMLDivElement | null) => void;
  onPlay: () => void;
  onReorder: (key: string, dropClientX: number) => void;
  tableDropRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
      ref={(el) => onRegisterRef(cardKey, el)}
      layout
      layoutId={layoutId}
      drag={canDrag}
      dragSnapToOrigin
      dragElastic={0.15}
      dragMomentum={false}
      // Leque de verdade: cada carta gira em torno de um pivô abaixo da mão
      // (transformOrigin), não do próprio centro — daí o leque abrir "pra
      // cima" com as pontas girando pra fora, igual um baralho na mão.
      animate={{ rotate: fanAngle }}
      whileHover={isMyTurn && !dragging ? { y: -24, zIndex: 50 } : {}}
      whileDrag={{ scale: 1.14, zIndex: 100, rotate: 0, boxShadow: "0 22px 36px rgba(0,0,0,0.55)" }}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_e, info) => {
        setDragging(false);
        const tableRect = tableDropRef.current?.getBoundingClientRect();
        const droppedOnTable =
          !!tableRect &&
          info.point.x >= tableRect.left &&
          info.point.x <= tableRect.right &&
          info.point.y >= tableRect.top &&
          info.point.y <= tableRect.bottom;
        if (droppedOnTable && isMyTurn) {
          onPlay();
        } else {
          onReorder(cardKey, info.point.x);
        }
      }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={{ marginLeft: `${-marginLeftRem}rem`, transformOrigin: "50% 140%" }}
      data-hand-card=""
      className={`relative ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-90"}`}>
      <PlayingCard card={card} hidden={hidden} theme={theme} backIndex={backIndex} />
      {isMyTurn && !dragging && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full" />
      )}
    </motion.div>
  );
}
