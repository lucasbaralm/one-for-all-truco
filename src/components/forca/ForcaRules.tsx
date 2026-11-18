"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: "✏️", title: "Quem escolhe", text: "A cada rodada UMA pessoa escolhe a palavra (ou frase), digitando — sem categoria. A dica vocês falam um pro outro na call! Cada um escolhe na sua vez, na ordem da sala." },
  { icon: "🧍", title: "O boneco é de todos", text: "Quem não escolheu tenta descobrir a palavra chutando letras. Cada erro desenha uma parte do MESMO boneco: cabeça, tronco, braços, pernas, olhos, nariz, boca e, por último, o chapéu — com o chapéu a forca fecha." },
  { icon: "🅰️", title: "Chutar uma letra", text: "Na sua vez, escolha uma letra (clique ou digite). Acertou? Ganha 10 pontos por vez que ela aparece. Errou? O boneco ganha uma parte. De um jeito ou de outro a vez passa pro próximo. Acento não conta: chutar A revela o Ã de AVIÃO." },
  { icon: "🎯", title: "Chutar a palavra", text: "Tem certeza? Chute a palavra inteira: acertou, leva 10 pontos por letra que ainda estava escondida e a rodada acaba. Errou, o boneco ganha DUAS partes — cuidado." },
  { icon: "🏅", title: "Bônus", text: "Quem completa a palavra (revelando a última letra ou acertando o chute) ganha +30 — então cuidado pra não entregar a última letra pro próximo." },
  { icon: "😈", title: "E quem escolheu?", text: "Ganha 10 pontos por parte do boneco que a mesa precisou desenhar pra acertar. Palavra difícil paga mais — mas se o boneco fechar, ninguém acertou e quem escolheu não ganha nada. Escolha uma palavra desafiadora, mas possível!" },
  { icon: "⏱️", title: "Tempo", text: "Quem escolhe tem 90 segundos pra digitar; quem chuta tem 40 por jogada (passou, o servidor chuta uma letra comum por você). Quem cair da conexão tem a vez pulada." },
  { icon: "🏆", title: "Fim da partida", text: "São de 1 a 5 palavras (o host escolhe). Vence quem tiver mais pontos." },
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
