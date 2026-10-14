"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: "🃏", title: "O objetivo", text: "Seja o primeiro a ficar sem cartas. Cada um começa com 7." },
  { icon: "🎯", title: "O que dá pra jogar", text: "Uma carta da mesma cor, do mesmo número ou do mesmo símbolo da carta do centro. O Coringa serve em qualquer hora e você escolhe a cor." },
  { icon: "⚡", title: "Cartas especiais", text: "Pular: o próximo perde a vez. Inverter: muda o sentido (com 2 jogadores vale como Pular). +2: o próximo compra 2 e perde a vez. Coringa +4: o próximo compra 4 e perde a vez." },
  { icon: "🚫", title: "Coringa +4", text: "Só dá pra jogar se você NÃO tiver nenhuma carta da cor atual na mão. O servidor confere — não precisa de desafio." },
  { icon: "📥", title: "Sem carta que sirva?", text: "Compre uma. Se ela der pra jogar, você pode jogá-la; senão, a vez passa. Não empilha +2 nem +4." },
  { icon: "📢", title: "UNO!", text: "Ficou com UMA carta? Aperte UNO! (pode ser antes de jogar a penúltima, ou logo depois). Esqueceu? Qualquer outro jogador pode apertar PEGAR! antes de a próxima pessoa jogar — e você compra 2." },
  { icon: "🤖", title: "Bots", text: "Os fáceis jogam ao acaso e esquecem o UNO; os difíceis guardam o Coringa, atacam quando você está quase ganhando e nunca esquecem." },
];

export function UnoRulesList() {
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

export function UnoRulesDialog({ onClose }: { onClose: () => void }) {
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
          <h2 className="text-xl font-black text-white">Como jogar Uno</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <UnoRulesList />
      </motion.div>
    </motion.div>
  );
}
