"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: "🔎", title: "A regra de ouro", text: "Quaisquer duas cartas têm exatamente UM símbolo igual. Ache o símbolo que a sua carta tem em comum com a carta do centro e clique nele." },
  { icon: "⚡", title: "Quem clicar primeiro ganha a rodada", text: "O servidor confere os cliques na ordem em que chegam. Errou o símbolo? Você fica uns segundos de castigo, sem poder jogar." },
  { icon: "🏗️", title: "Modo Torre", text: "Quem ganha a rodada leva a carta do centro (ela vira a sua carta). Quando as cartas do centro acabam, vence quem tem a maior pilha." },
  { icon: "🕳️", title: "Modo Poço", text: "Cada um tem um monte de cartas. Quem ganha a rodada joga a sua carta no centro e vira a próxima. Quem esvaziar o monte primeiro vence." },
  { icon: "🤖", title: "Bots", text: "Os bots também procuram o símbolo: os fáceis demoram e às vezes erram, os difíceis são rápidos e nunca erram." },
];

export function DobbleRulesList() {
  return (
    <ul className="space-y-3">
      {RULES.map((r) => (
        <li key={r.title} className="flex gap-3">
          <span className="text-2xl leading-none">{r.icon}</span>
          <div>
            <p className="font-bold text-white">{r.title}</p>
            <p className="text-sm text-zinc-400">{r.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DobbleRulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">Como jogar Dobble</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <DobbleRulesList />
      </motion.div>
    </motion.div>
  );
}
