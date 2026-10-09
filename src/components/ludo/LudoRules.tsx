"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: "🎲", title: "Objetivo", text: "Leve as 4 peças da sua cor até a casa do centro antes de todo mundo." },
  { icon: "6️⃣", title: "Sair da base", text: "Só um 6 tira uma peça da base. Tirou 6? Joga de novo — mas três 6 seguidos fazem você perder a vez." },
  { icon: "👣", title: "Andar", text: "A peça anda o número do dado, no sentido horário, e entra na sua reta colorida depois de dar a volta." },
  { icon: "💥", title: "Capturar", text: "Caiu em cima de uma peça adversária? Ela volta pra base e você joga de novo." },
  { icon: "⭐", title: "Casas seguras", text: "As casas de saída e as estrelas protegem: ninguém é capturado nelas." },
  { icon: "🛡️", title: "Barreira", text: "Duas peças da mesma cor na mesma casa formam uma barreira e não podem ser capturadas." },
  { icon: "🏠", title: "Chegar em casa", text: "Precisa do número exato do dado pra entrar. Colocar uma peça em casa também dá outra jogada." },
];

export function LudoRulesList() {
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

export function LudoRulesDialog({ onClose }: { onClose: () => void }) {
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
          <h2 className="text-xl font-black text-white">Como jogar Ludo</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <LudoRulesList />
      </motion.div>
    </motion.div>
  );
}
