"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────────────────────────────────────
// SHUFFLE PANEL
// ─────────────────────────────────────────────────────────────────────────────
export type ShuffleType = "cut" | "riffle" | "overhand" | "lucas";

export function ShufflePanel({
  isDealer,
  dealerName,
  onShuffle,
}: {
  isDealer: boolean;
  dealerName: string;
  onShuffle: (t: ShuffleType) => void;
}) {
  const [preview, setPreview] = useState<ShuffleType | null>(null);
  const [confirmed, setConfirmed] = useState<ShuffleType | null>(null);

  // No mobile não existe "hover" de verdade, então o preview (que só rodava
  // com onHoverStart) nunca aparecia lá — e mesmo no desktop, ao clicar a
  // fase mudava tão rápido que ninguém chegava a ver a animação escolhida.
  // Ao tocar/clicar: mostra a animação escolhida por um instante e só DEPOIS
  // manda embaralhar de verdade, pra dar tempo de ver o que foi selecionado.
  const handlePick = (type: ShuffleType) => {
    if (confirmed) return;
    setConfirmed(type);
    setPreview(type);
    setTimeout(() => onShuffle(type), 1100);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex items-center justify-center flex-col bg-black/75 border border-white/10 rounded-2xl backdrop-blur-md gap-2 sm:gap-4 p-3 sm:p-5 [@media(max-height:720px)]:gap-1.5 [@media(max-height:720px)]:p-2.5">
      {isDealer ? (
        <>
          <span className="text-white font-black text-sm sm:text-lg text-center px-2">Sua vez de embaralhar!</span>
          {/* Em telas baixas (notebook com barra do navegador + barra de tarefas)
              o painel precisa caber na célula da mesa: some o subtítulo, a
              descrição dos botões e a prévia animada. */}
          <span className="text-zinc-400 text-xs sm:text-sm text-center px-2 [@media(max-height:720px)]:hidden">Escolha como quer embaralhar:</span>
          <div className="flex gap-1.5 sm:gap-3 flex-wrap justify-center px-2">
            {[
              { type: "cut" as ShuffleType, label: "✂️ Cortar", desc: "Divide ao meio" },
              { type: "riffle" as ShuffleType, label: "🎴 Riffle", desc: "Entrelaçar" },
              { type: "overhand" as ShuffleType, label: "🤌 Pilha", desc: "Mover por cima" },
              { type: "lucas" as ShuffleType, label: "👑 Supremo do Lucas", desc: "Não embaralha nada" },
            ].map(({ type, label, desc }) => (
              <motion.button key={type} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                onHoverStart={() => !confirmed && setPreview(type)}
                onHoverEnd={() => !confirmed && setPreview(null)}
                onClick={() => handlePick(type)}
                disabled={!!confirmed}
                className={`flex flex-col items-center gap-0.5 sm:gap-1 bg-zinc-900 border px-2.5 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl transition-all text-white w-[76px] sm:w-auto disabled:opacity-40 ${
                  confirmed === type
                    ? "border-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.4)]"
                    : type === "lucas"
                    ? "border-yellow-600 hover:border-yellow-400 hover:bg-yellow-900/20"
                    : "border-zinc-700 hover:border-red-500 hover:bg-red-900/20"
                }`}>
                <span className="text-lg sm:text-2xl">{label.split(" ")[0]}</span>
                <span className="font-bold text-[10px] sm:text-sm text-center leading-tight">{label.split(" ").slice(1).join(" ")}</span>
                <span className="text-zinc-500 text-[9px] sm:text-xs hidden sm:[@media(min-height:721px)]:block">{desc}</span>
              </motion.button>
            ))}
          </div>
          <div className="[@media(max-height:720px)]:hidden">
            <AnimatePresence mode="wait">
              {preview && <DeckAnimation type={preview} key={preview} />}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-5xl">🃏</motion.div>
          <span className="text-white font-bold text-center">{dealerName} está embaralhando...</span>
        </div>
      )}
    </motion.div>
  );
}

function DeckAnimation({ type }: { type: ShuffleType }) {
  const cards = [0, 1, 2, 3, 4];
  if (type === "cut") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex gap-8 h-20 items-end">
        {[cards.slice(0, 3), cards.slice(3)].map((half, hi) => (
          <motion.div key={hi} className="relative flex"
            animate={{ x: hi === 0 ? -10 : 10 }} transition={{ type: "spring", stiffness: 200 }}>
            {half.map((_, i) => (
              <div key={i} className="w-8 h-12 bg-gradient-to-br from-red-700 to-red-900 border border-red-500 rounded-sm shadow absolute"
                style={{ bottom: i * 2, left: i * 0.5 }} />
            ))}
          </motion.div>
        ))}
      </motion.div>
    );
  }
  if (type === "riffle") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="relative flex h-20 items-end w-32 justify-center">
        {cards.map((_, i) => (
          <motion.div key={i}
            className="absolute w-8 h-12 bg-gradient-to-br from-red-700 to-red-900 border border-red-500 rounded-sm shadow"
            animate={{ rotate: [0, i % 2 === 0 ? 20 : -20, 0], x: [0, i % 2 === 0 ? -12 : 12, 0] }}
            transition={{ duration: 0.8, delay: i * 0.05, repeat: Infinity, repeatDelay: 0.5 }}
            style={{ bottom: i * 2 }} />
        ))}
      </motion.div>
    );
  }
  if (type === "lucas") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="relative flex flex-col items-center h-20 justify-end w-32">
        <motion.span className="text-2xl mb-1"
          animate={{ y: [0, -6, 0], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1, repeat: Infinity }}>
          👑
        </motion.span>
        <div className="relative w-8 h-12">
          {cards.map((_, i) => (
            <div key={i}
              className="absolute w-8 h-12 bg-gradient-to-br from-yellow-600 to-yellow-800 border border-yellow-400 rounded-sm shadow"
              style={{ bottom: i * 1.5, left: i * 1.5 }} />
          ))}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative flex h-20 items-end w-32 justify-center">
      {cards.map((_, i) => (
        <motion.div key={i}
          className="absolute w-8 h-12 bg-gradient-to-br from-red-700 to-red-900 border border-red-500 rounded-sm shadow"
          animate={{ y: [0, -20, 0], x: [0, 8, 0] }}
          transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 0.6 }}
          style={{ bottom: i * 2, left: i * 2 }} />
      ))}
    </motion.div>
  );
}
