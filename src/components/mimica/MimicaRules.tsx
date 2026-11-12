"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";
import { CARD_BR, CARD_WORLD, MAX_SPEED_BONUS, SONG_POINTS } from "@/lib/mimica/engine";
import { TIMING } from "@/lib/mimica/timing";

const seconds = (ms: number) => Math.round(ms / 1000);

const RULES: { icon: string; title: string; text: string }[] = [
  {
    icon: "🎭",
    title: "Quem faz a mímica",
    text: `A cada turno UMA pessoa faz a mímica, na ordem da sala. Ela recebe uma carta com ${CARD_BR + CARD_WORLD} músicas — ${CARD_BR} do Brasil e ${CARD_WORLD} internacional — e escolhe uma em ${seconds(TIMING.PICK_MS)} segundos. Sem falar, sem fazer som, sem soletrar: só o corpo.`,
  },
  {
    icon: "🎥",
    title: "Videochamada",
    text: "A mímica é filmada pela chamada de vídeo do próprio jogo: toque em “Entrar na chamada” pra liberar câmera e microfone. Quem faz a mímica aparece grande pra todo mundo e fica com o microfone cortado. Sem câmera você ainda assiste.",
  },
  {
    icon: "⌨️",
    title: "Quem chuta",
    text: "Veja as casinhas (uma por letra) e se a música é nacional ou internacional, e digite o título. Acento, maiúscula e pontuação não contam, e um errinho de digitação é perdoado. O que está entre parênteses no título não precisa digitar.",
  },
  {
    icon: "🏅",
    title: "Pontos",
    text: `Quem acerta primeiro ganha o valor da música (${SONG_POINTS.br} se for do Brasil, ${SONG_POINTS.world} se for internacional) mais de 1 a ${MAX_SPEED_BONUS} pela rapidez. Quem fez a mímica ganha o valor da música. Passou de ${seconds(TIMING.MIME_MS)} segundos sem ninguém acertar? Ninguém pontua.`,
  },
  {
    icon: "💡",
    title: "Dica",
    text: "Na metade do tempo aparece a primeira letra de cada palavra.",
  },
  {
    icon: "✅",
    title: "Aceitar na mão",
    text: "Se alguém chegou perto mas o jogo não aceitou (um apelido, outra grafia), quem faz a mímica pode aceitar o chute com um clique. Também pode desistir da música.",
  },
  {
    icon: "🎵",
    title: "As músicas",
    text: "São 300 músicas do Brasil e 300 do mundo dos últimos 40 anos: muita MPB e rock nacional, pagode, axé, sertanejo, os hits dos anos 80, 90 e 2000 e os de hoje. Não tem a carta de “faixa extra” do jogo de caixa: aqui o que vale é a mímica.",
  },
  {
    icon: "🏆",
    title: "Fim da partida",
    text: "Cada pessoa faz a mímica de 1 a 5 vezes (o host escolhe as voltas). Vence quem tiver mais pontos.",
  },
];

export function MimicaRulesList() {
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

export function MimicaRulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">Como jogar Mímica</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <MimicaRulesList />
      </motion.div>
    </motion.div>
  );
}
