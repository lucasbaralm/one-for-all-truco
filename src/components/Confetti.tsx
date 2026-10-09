"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#facc15", "#ec4899", "#fff"];

/** Chuva de confete em tela cheia (vitória). Os pedaços são sorteados uma vez só. */
export function Confetti({ count = 70 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2.4 + Math.random() * 2,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 720,
      size: 6 + Math.random() * 7,
    }))
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[66] overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color }}
          initial={{ y: -30, opacity: 1, rotate: 0 }}
          animate={{ y: "105vh", rotate: p.rotate, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}
