"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Club, Diamond, Heart, Spade, WifiOff } from "lucide-react";
import { useServiceStatus } from "@/components/ServiceStatus";
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

function UnoArt() {
  const cards = [
    { rot: -18, x: -34, bg: "#ef4444", label: "7" },
    { rot: 0, x: 0, bg: "#facc15", label: "+2" },
    { rot: 18, x: 34, bg: "#3b82f6", label: "⊘" },
  ];
  return (
    <div className="relative flex h-32 items-end justify-center">
      {cards.map((c, i) => (
        <motion.div
          key={i}
          className="absolute grid h-24 w-16 place-items-center rounded-lg border-[3px] border-white shadow-xl"
          style={{ x: c.x, rotate: c.rot, background: c.bg, transformOrigin: "50% 120%", zIndex: i === 1 ? 2 : 1 }}
          animate={{ rotate: [c.rot, c.rot + (i - 1) * 4, c.rot] }}
          transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="grid h-14 w-10 place-items-center rounded-[50%] bg-white/95 text-2xl font-black [transform:rotate(-24deg)]" style={{ color: c.bg }}>
            <span className="[transform:rotate(24deg)]">{c.label}</span>
          </span>
        </motion.div>
      ))}
      <motion.div
        className="absolute -right-1 top-0 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-red-600 text-[0.6rem] font-black italic text-yellow-300 shadow-xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        UNO
      </motion.div>
    </div>
  );
}

function ForcaArt() {
  const letters = ["F", "O", "R", "C", "A"];
  return (
    <div className="relative flex h-32 flex-col items-center justify-center gap-2">
      <svg viewBox="0 0 100 70" className="h-20 w-28 drop-shadow-xl" fill="none" stroke="#e5e7eb" strokeWidth="4" strokeLinecap="round">
        <path d="M12 66h50M24 66V6h42v10" />
        <motion.g stroke="#fca5a5" animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "66px 16px" }}>
          <circle cx="66" cy="24" r="8" />
          <path d="M66 32v18M66 38l-9 8M66 38l9 8M66 50l-8 12M66 50l8 12" />
        </motion.g>
      </svg>
      <div className="flex gap-1">
        {letters.map((l, i) => (
          <motion.span
            key={i}
            className="grid h-7 w-6 place-items-center rounded-md border-b-4 border-emerald-400 bg-white/90 text-sm font-black text-zinc-900"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          >
            {i === 2 ? "" : l}
          </motion.span>
        ))}
      </div>
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
  offline,
  className = "",
}: {
  href: string;
  title: string;
  tagline: string;
  chips: string[];
  accent: string;
  art: React.ReactNode;
  delay: number;
  /** Motivo de o jogo não conectar agora (null = tudo certo). O cartão continua clicável: o aviso pode ser um falso alarme. */
  offline?: string | null;
  /** Classes do contêiner (posição na grade). */
  className?: string;
}) {
  return (
    <motion.div
      className={className}
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
          {offline && (
            <span className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide text-amber-200">
              <WifiOff className="h-3 w-3" /> {offline}
            </span>
          )}
          <div className={offline ? "opacity-50 grayscale transition-[filter,opacity]" : "transition-[filter,opacity]"}>{art}</div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">{title}</h2>
          <p className="mt-1 min-h-[2.5rem] text-sm text-zinc-400">{tagline}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-300">
                {c}
              </span>
            ))}
          </div>
          <div className={`mt-4 flex items-center gap-1.5 text-sm font-bold ${offline ? "text-amber-200" : "text-white"}`}>
            {offline ? "Tentar mesmo assim" : "Jogar"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function GameMenu() {
  // Os três jogos dependem do servidor de jogo e do Supabase (quem é você): se um cair, nenhum conecta.
  const { party, supabase } = useServiceStatus();
  const offline = party === "down" ? "Servidor offline" : supabase === "down" ? "Supabase offline" : null;
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

        {/* 6 colunas: três cartões na primeira linha e os outros dois centralizados na segunda */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          <GameCard
            href="/lobby/fodinha"
            title="Fodinha"
            tagline="Aposte quantas vazas você faz e não erre a conta. Cartas, blefe e muita resenha."
            chips={["Cartas", "Online", "Contra IAs"]}
            accent="#ef4444"
            art={<FodinhaArt />}
            delay={0.05}
            offline={offline}
            className="lg:col-span-2"
          />
          <GameCard
            href="/lobby/ludo"
            title="Ludo"
            tagline="Role o dado, capture os adversários e leve os 4 peões até em casa primeiro."
            chips={["2–4 jogadores", "Online", "Contra bots"]}
            accent="#3b82f6"
            art={<LudoArt />}
            delay={0.15}
            offline={offline}
            className="lg:col-span-2"
          />
          <GameCard
            href="/lobby/dobble"
            title="Dobble"
            tagline="Duas cartas, um símbolo igual. Seja o primeiro a achar — e não erre o clique!"
            chips={["2–8 jogadores", "Online", "Contra bots"]}
            accent="#6366f1"
            art={<DobbleArt />}
            delay={0.25}
            offline={offline}
            className="lg:col-span-2"
          />
          <GameCard
            href="/lobby/uno"
            title="Uno"
            tagline="Combine cor ou número, solte um +4 e não esqueça de gritar UNO — ou alguém te pega."
            chips={["2–8 jogadores", "Online", "Contra bots"]}
            accent="#ef4444"
            art={<UnoArt />}
            delay={0.35}
            offline={offline}
            className="lg:col-span-2 lg:col-start-2"
          />
          <GameCard
            href="/lobby/forca"
            title="Forca"
            tagline="Chute letras na sua vez, descubra a palavra antes de a forca fechar e some mais pontos que a mesa."
            chips={["2–8 jogadores", "Online", "Contra bots"]}
            accent="#10b981"
            art={<ForcaArt />}
            delay={0.45}
            offline={offline}
            className="lg:col-span-2"
          />
        </div>
      </motion.div>

      <MatchHistory limit={6} />
    </div>
  );
}
