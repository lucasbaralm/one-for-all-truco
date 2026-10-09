"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Club, Diamond, Heart, Spade } from "lucide-react";
import { ProfileHeader } from "@/components/lobby/ProfileHeader";
import { MatchHistory } from "@/components/lobby/MatchHistory";
import { LUDO_COLORS } from "@/components/ludo/colors";

// Menu inicial depois do login: aqui a pessoa decide qual jogo vai jogar.
// Cada jogo tem o próprio lobby (salas, entrar por código, contra bots).

function FodinhaArt() {
  const cards = [
    { rot: -16, x: -34, icon: <Spade className="h-7 w-7 text-zinc-900" />, label: "A" },
    { rot: 0, x: 0, icon: <Heart className="h-7 w-7 fill-red-500 text-red-500" />, label: "K" },
    { rot: 16, x: 34, icon: <Diamond className="h-7 w-7 fill-red-500 text-red-500" />, label: "7" },
  ];
  return (
    <div className="relative flex h-32 items-end justify-center">
      {cards.map((c, i) => (
        <motion.div
          key={i}
          className="absolute flex h-24 w-16 flex-col items-center justify-between rounded-lg border border-zinc-300 bg-white px-1 py-1.5 shadow-xl"
          style={{ x: c.x, rotate: c.rot, transformOrigin: "50% 120%" }}
          animate={{ rotate: [c.rot, c.rot + (i - 1) * 4, c.rot] }}
          transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="self-start text-sm font-black text-zinc-800">{c.label}</span>
          {c.icon}
          <span className="self-end rotate-180 text-sm font-black text-zinc-800">{c.label}</span>
        </motion.div>
      ))}
      <Club className="absolute -right-1 top-1 h-8 w-8 text-white/20" />
    </div>
  );
}

function LudoArt() {
  const corner = (x: number, y: number, color: keyof typeof LUDO_COLORS) => (
    <g key={color}>
      <rect x={x} y={y} width="36" height="36" rx="5" fill={LUDO_COLORS[color].main} />
      <rect x={x + 7} y={y + 7} width="22" height="22" rx="4" fill="#fffdf6" />
      <circle cx={x + 18} cy={y + 18} r="6.5" fill={LUDO_COLORS[color].dark} />
    </g>
  );
  return (
    <div className="relative flex h-32 items-center justify-center">
      <motion.svg
        viewBox="0 0 100 100"
        className="h-28 w-28 drop-shadow-xl"
        animate={{ rotate: [0, 4, 0, -4, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect width="100" height="100" rx="8" fill="#fbf4e4" />
        {corner(0, 0, "red")}
        {corner(64, 0, "green")}
        {corner(64, 64, "blue")}
        {corner(0, 64, "yellow")}
        <polygon points="36,36 64,36 50,50" fill={LUDO_COLORS.green.main} />
        <polygon points="64,36 64,64 50,50" fill={LUDO_COLORS.blue.main} />
        <polygon points="36,64 64,64 50,50" fill={LUDO_COLORS.yellow.main} />
        <polygon points="36,36 36,64 50,50" fill={LUDO_COLORS.red.main} />
      </motion.svg>
      <motion.div
        className="absolute -right-0 -top-1 flex h-11 w-11 items-center justify-center rounded-xl border border-black/10 bg-white shadow-xl"
        animate={{ y: [0, -10, 0], rotate: [0, 18, -12, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="grid h-7 w-7 grid-cols-3 grid-rows-3">
          {[0, 2, 4, 6, 8].map((i) => (
            <span key={i} className="m-auto h-1.5 w-1.5 rounded-full bg-zinc-800" style={{ gridArea: `${Math.floor(i / 3) + 1} / ${(i % 3) + 1}` }} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function DobbleArt() {
  const circles = [
    { x: -38, y: 6, size: 64, emojis: ["🍎", "🐶", "⭐", "🔑"], rot: -14 },
    { x: 38, y: 14, size: 64, emojis: ["🐶", "🌵", "🎈", "🦊"], rot: 12 },
    { x: 0, y: -6, size: 74, emojis: ["🔑", "🌵", "🍎", "🐙", "🚀"], rot: 0 },
  ];
  return (
    <div className="relative flex h-32 items-center justify-center">
      {circles.map((c, i) => (
        <motion.div
          key={i}
          className="absolute grid place-items-center rounded-full border-2 border-white bg-white shadow-xl"
          style={{ width: c.size, height: c.size, x: c.x, y: c.y, rotate: c.rot, zIndex: i === 2 ? 2 : 1 }}
          animate={{ rotate: [c.rot, c.rot + (i % 2 ? -8 : 8), c.rot], y: [c.y, c.y - 4, c.y] }}
          transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="grid grid-cols-3 place-items-center text-[0.8rem] leading-none">
            {c.emojis.map((e, k) => (
              <span key={k} style={{ transform: `rotate(${(k * 67) % 90 - 40}deg)` }}>{e}</span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function GameCard({
  href,
  title,
  tagline,
  chips,
  accent,
  art,
  delay,
}: {
  href: string;
  title: string;
  tagline: string;
  chips: string[];
  accent: string;
  art: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl transition-colors hover:border-white/30"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30 transition-opacity group-hover:opacity-60"
          style={{ background: `radial-gradient(circle at 50% 0%, ${accent}, transparent 65%)` }}
        />
        <div className="relative">
          {art}
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">{title}</h2>
          <p className="mt-1 min-h-[2.5rem] text-sm text-zinc-400">{tagline}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-300">
                {c}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-sm font-bold text-white">
            Jogar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function GameMenu() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 py-10">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-5xl space-y-6"
      >
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-black text-white">ESCOLHA O JOGO</h1>
          <ProfileHeader />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <GameCard
            href="/lobby/fodinha"
            title="Fodinha"
            tagline="Aposte quantas vazas você faz e não erre a conta. Cartas, blefe e muita resenha."
            chips={["Cartas", "Online", "Contra IAs"]}
            accent="#ef4444"
            art={<FodinhaArt />}
            delay={0.05}
          />
          <GameCard
            href="/lobby/ludo"
            title="Ludo"
            tagline="Role o dado, capture os adversários e leve os 4 peões até em casa primeiro."
            chips={["2–4 jogadores", "Online", "Contra bots"]}
            accent="#3b82f6"
            art={<LudoArt />}
            delay={0.15}
          />
          <GameCard
            href="/lobby/dobble"
            title="Dobble"
            tagline="Duas cartas, um símbolo igual. Seja o primeiro a achar — e não erre o clique!"
            chips={["2–8 jogadores", "Online", "Contra bots"]}
            accent="#6366f1"
            art={<DobbleArt />}
            delay={0.25}
          />
        </div>
      </motion.div>

      <MatchHistory limit={6} />
    </div>
  );
}
