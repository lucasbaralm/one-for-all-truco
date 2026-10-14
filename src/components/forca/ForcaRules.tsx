"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: "🔤", title: "O objetivo", text: "Descobrir a palavra secreta antes de a forca fechar. A forca é de TODOS: são 6 vidas e cada erro tira uma da mesa. Quem mais pontua no fim das palavras vence." },
  { icon: "🅰️", title: "Chutar uma letra", text: "Na sua vez, escolha uma letra (clique ou digite). Acertou? Ganha 10 pontos por vez que ela aparece. Errou? A mesa perde 1 vida. De um jeito ou de outro a vez passa pro próximo. Acento não conta: chutar A revela o Ã de AVIÃO." },
  { icon: "🎯", title: "Chutar a palavra", text: "Tem certeza? Chute a palavra inteira: acertou, leva 10 pontos por letra que ainda estava escondida e a rodada acaba. Errou, a mesa perde 2 vidas — cuidado." },
  { icon: "🏅", title: "Bônus", text: "Quem completa a palavra (revelando a última letra ou acertando o chute) ganha +30 — então cuidado pra não entregar a última letra pro próximo. Se a forca fechar antes, ninguém leva o bônus." },
  { icon: "⏱️", title: "Tempo", text: "Você tem 25 segundos por jogada. Passou do tempo, o servidor chuta uma letra comum por você." },
  { icon: "🏆", title: "Fim da partida", text: "São 3, 5 ou 8 palavras (o host escolhe). Cada uma abre com um jogador diferente. Vence quem tiver mais pontos." },
  { icon: "🤖", title: "Bots", text: "Os fáceis chutam pelas letras mais comuns e arriscam pouco; os difíceis conhecem a lista de palavras e só chutam a palavra quando ela é a única possível." },
];

export function ForcaRulesList() {
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

export function ForcaRulesDialog({ onClose }: { onClose: () => void }) {
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
          <h2 className="text-xl font-black text-white">Como jogar Forca</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ForcaRulesList />
      </motion.div>
    </motion.div>
  );
}
