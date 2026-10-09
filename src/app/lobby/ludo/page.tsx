"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Bot, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileHeader } from "@/components/lobby/ProfileHeader";
import { MatchHistory } from "@/components/lobby/MatchHistory";
import { LUDO_COLORS } from "@/components/ludo/colors";
import { LudoRulesList } from "@/components/ludo/LudoRules";
import { COLORS, COLOR_LABEL, LudoColor } from "@/lib/ludo/board";
import { BOT_LEVEL_LABEL } from "@/lib/ludo/bot";
import type { BotLevel } from "@/lib/ludo/engine";

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];
const LEVEL_HINT: Record<BotLevel, string> = {
  easy: "Joga ao acaso",
  medium: "Captura e foge do óbvio",
  hard: "Calcula riscos e persegue você",
};

function generateRoomCode(length = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export default function LudoLobby() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState<BotLevel>("medium");
  const [color, setColor] = useState<LudoColor>("red");

  // Salas online não precisam ser "criadas": o código é só o nome do room no
  // servidor, que nasce na primeira conexão.
  const handleCreateRoom = () => router.push(`/ludo/${generateRoomCode()}`);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim().length >= 3) router.push(`/ludo/${roomCode.toUpperCase()}`);
  };

  // "Contra bots" também é uma sala no servidor (como o Modo Teste da Fodinha):
  // código de 6 letras pra não esbarrar numa sala de amigos, e a própria sala
  // monta a partida a partir dos parâmetros. Recarregar a página retoma de onde parou.
  const handlePlayBots = () => {
    router.push(`/ludo/${generateRoomCode(6)}?bots=${bots}&level=${level}&color=${color}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 py-10">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-6"
      >
        <Link href="/lobby" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Todos os jogos
        </Link>

        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-black text-white">LUDO</h1>
          <ProfileHeader />
        </div>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Bot className="h-5 w-5 text-emerald-500" /> Contra Bots
            </CardTitle>
            <CardDescription className="text-zinc-400">Jogue agora, sozinho: o servidor joga pelos bots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-zinc-300">Quantos bots?</Label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setBots(n)}
                    className={`h-11 rounded-xl border text-lg font-black transition-all ${
                      bots === n ? "border-white bg-white text-black" : "border-zinc-700 bg-black/30 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Dificuldade</Label>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`h-11 rounded-xl border text-sm font-bold transition-all ${
                      level === l ? "border-white bg-white text-black" : "border-zinc-700 bg-black/30 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {BOT_LEVEL_LABEL[l]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">{LEVEL_HINT[level]}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Sua cor</Label>
              <div className="flex gap-3">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={COLOR_LABEL[c]}
                    title={COLOR_LABEL[c]}
                    className="h-11 w-11 rounded-full border-4 transition-transform hover:scale-110"
                    style={{
                      background: LUDO_COLORS[c].main,
                      borderColor: color === c ? "#fff" : "transparent",
                      boxShadow: color === c ? `0 0 16px ${LUDO_COLORS[c].main}` : "none",
                      transform: color === c ? "scale(1.12)" : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            <Button onClick={handlePlayBots} className="h-12 w-full bg-emerald-600 text-lg font-bold text-white hover:bg-emerald-700">
              Jogar contra {bots} {bots === 1 ? "bot" : "bots"}
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-center gap-4 py-1">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-sm font-medium uppercase text-zinc-500">com amigos</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Plus className="h-5 w-5 text-red-500" /> Nova Sala
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Crie uma sala, mande o link e, se faltar gente, complete com bots.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCreateRoom} className="h-12 w-full bg-red-600 text-lg font-bold text-white hover:bg-red-700">
              Criar Sala
            </Button>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-blue-500" /> Entrar em Sala
            </CardTitle>
            <CardDescription className="text-zinc-400">Já tem um código? Digite abaixo para jogar.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinRoom} className="space-y-2">
              <Label htmlFor="ludo-code" className="text-zinc-300">Código da Sala</Label>
              <div className="flex gap-2">
                <Input
                  id="ludo-code"
                  placeholder="Ex: XF8K"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="h-12 border-zinc-800 bg-zinc-950/50 font-mono text-lg uppercase tracking-widest text-white placeholder:text-zinc-600"
                  autoComplete="off"
                />
                <Button type="submit" className="h-12 w-12 bg-white text-black hover:bg-zinc-200" disabled={roomCode.length < 3}>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Como jogar</CardTitle>
          </CardHeader>
          <CardContent>
            <LudoRulesList />
          </CardContent>
        </Card>
      </motion.div>

      <MatchHistory game="ludo" />
    </div>
  );
}
