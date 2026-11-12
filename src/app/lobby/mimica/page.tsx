"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileHeader } from "@/components/lobby/ProfileHeader";
import { MatchHistory } from "@/components/lobby/MatchHistory";
import { MimicaRulesList } from "@/components/mimica/MimicaRules";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/mimica/engine";

function generateRoomCode(length = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export default function MimicaLobby() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");

  // Salas online não precisam ser "criadas": o código é só o nome do room no servidor.
  const handleCreateRoom = () => router.push(`/mimica/${generateRoomCode()}`);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim().length >= 3) router.push(`/mimica/${roomCode.toUpperCase()}`);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 py-10">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="w-full max-w-md space-y-6">
        <Link href="/lobby" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Todos os jogos
        </Link>

        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-black text-white">MÍMICA LOVE SONGS</h1>
          <p className="text-sm text-zinc-400">Faça a mímica de uma música, a galera tenta adivinhar o título — tudo na videochamada do próprio jogo. 300 músicas do Brasil (muita MPB, rock nacional, pagode, sertanejo…) e 300 do mundo, dos últimos 40 anos.</p>
          <ProfileHeader />
        </div>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Plus className="h-5 w-5 text-pink-400" /> Nova Sala
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Crie uma sala ({MIN_PLAYERS} a {MAX_PLAYERS} pessoas), mande o link e entrem na videochamada: cada um faz a mímica de uma música da carta na sua vez.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCreateRoom} className="h-12 w-full bg-pink-600 text-lg font-bold text-white hover:bg-pink-700">
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
              <Label htmlFor="mimica-code" className="text-zinc-300">Código da Sala</Label>
              <div className="flex gap-2">
                <Input
                  id="mimica-code"
                  placeholder="Ex: XF8K"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
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
            <MimicaRulesList />
          </CardContent>
        </Card>
      </motion.div>

      <MatchHistory game="mimica" />
    </div>
  );
}
