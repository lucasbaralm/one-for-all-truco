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
import { getEdition } from "@/lib/monopoly/editions";
import type { EditionId } from "@/lib/monopoly/editions";
import { BotLevel, LIMIT_OPTIONS, MAX_PLAYERS } from "@/lib/monopoly/engine";
import { BOT_LEVEL_LABEL, limitLabel, money } from "@/lib/monopoly/labels";
import { MAX_BOTS } from "@/lib/monopoly/setup";
import { EDITION_UI, roomHref } from "./edition-ui";
import { MonopolyRulesList } from "./Rules";

// O menu de uma edição: jogar contra bots (sala do servidor, montada pela URL), criar sala com amigos,
// entrar por código e ler as regras. As duas edições usam esta mesma tela — só mudam textos e cores.

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];
const LEVEL_HINT: Record<BotLevel, string> = {
  easy: "Compra ao acaso, constrói pouco e dá lances baixos",
  medium: "Compra com reserva, completa grupos de cor e constrói parelho",
  hard: "Foca em completar grupos, constrói rápido e dá lances agressivos",
};

function generateRoomCode(length = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

const pick = (active: boolean) => (active ? "border-white bg-white text-black" : "border-zinc-700 bg-black/30 text-zinc-300 hover:border-zinc-500");

export default function MonopolyLobby({ edition }: { edition: EditionId }) {
  const router = useRouter();
  const ui = EDITION_UI[edition];
  const ed = getEdition(edition);
  const [roomCode, setRoomCode] = useState("");
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState<BotLevel>("medium");
  // contra bots o padrão é 40 rodadas: os bots não propõem trocas, então "até a falência" pode demorar demais
  const [limit, setLimit] = useState(40);

  // Salas online não precisam ser "criadas": o código é só o nome do room no servidor.
  const handleCreateRoom = () => router.push(roomHref(edition, generateRoomCode()));

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim().length >= 3) router.push(roomHref(edition, roomCode.toUpperCase()));
  };

  // "Contra bots" também é uma sala no servidor: código de 6 letras pra não esbarrar numa sala
  // de amigos, e a própria sala monta a partida a partir dos parâmetros. Recarregar retoma.
  const handlePlayBots = () => router.push(`${roomHref(edition, generateRoomCode(6))}?bots=${bots}&level=${level}${limit > 0 ? `&limit=${limit}` : ""}`);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 py-10">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="w-full max-w-md space-y-6">
        <Link href="/lobby" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Todos os jogos
        </Link>

        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-black text-white">{ui.title.toUpperCase()}</h1>
          <p className="text-sm text-zinc-400">{ui.tagline}</p>
          <p className="text-xs text-zinc-500">
            {MAX_PLAYERS > 0 && `2 a ${MAX_PLAYERS} jogadores · cada um começa com ${money(edition, ed.startCash)}${ed.auction ? " · leilão" : " · sem leilão"}`}
          </p>
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
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: MAX_BOTS }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setBots(n)} data-mono-bots={String(n)} className={`h-11 rounded-xl border text-lg font-black transition-all ${pick(bots === n)}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Dificuldade</Label>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map((l) => (
                  <button key={l} onClick={() => setLevel(l)} data-mono-level={l} className={`h-11 rounded-xl border text-sm font-bold transition-all ${pick(level === l)}`}>
                    {BOT_LEVEL_LABEL[l]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">{LEVEL_HINT[level]}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Duração</Label>
              <div className="grid grid-cols-3 gap-2">
                {LIMIT_OPTIONS.map((l) => (
                  <button key={l} onClick={() => setLimit(l)} data-mono-duration={String(l)} className={`h-11 rounded-xl border px-1 text-xs font-bold transition-all sm:text-sm ${pick(limit === l)}`}>
                    {limitLabel(l)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">{limit === 0 ? "Vai até só sobrar um jogador." : "Quando as rodadas acabam, vence o maior patrimônio."}</p>
            </div>

            <Button onClick={handlePlayBots} className={`h-12 w-full text-lg font-bold text-white ${ui.accent}`} data-mono-play-bots="">
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
              <Plus className="h-5 w-5 text-red-400" /> Nova Sala
            </CardTitle>
            <CardDescription className="text-zinc-400">Crie uma sala (2 a {MAX_PLAYERS} jogadores), mande o link e, se faltar gente, complete com bots.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCreateRoom} className="h-12 w-full bg-red-600 text-lg font-bold text-white hover:bg-red-700" data-mono-create-room="">
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
              <Label htmlFor="mono-code" className="text-zinc-300">
                Código da Sala
              </Label>
              <div className="flex gap-2">
                <Input
                  id="mono-code"
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
            <MonopolyRulesList edition={edition} />
          </CardContent>
        </Card>
      </motion.div>

      <MatchHistory game={edition} />
    </div>
  );
}
