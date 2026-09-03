"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, ArrowRight, Trophy, History, Bot } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export default function Lobby() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/");
        return;
      }
      // Pega o nome verdadeiro salvo no metadata
      setPlayerName(data.session.user.user_metadata.username || "Jogador");
    };

    const fetchHistory = async () => {
      const { data } = await supabase
        .from("match_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) {
        setHistory(data);
      }
    };

    fetchUser();
    fetchHistory();
  }, [router]);

  const generateRoomCode = () => {
    // Gera um código aleatório de 4 letras para a sala
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateRoom = async () => {
    setCreatingRoom(true);
    setCreateRoomError("");

    // Com apenas 26^4 códigos possíveis e salas que nunca expiram, colisão é
    // questão de tempo — tenta algumas vezes com um código novo se acontecer.
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = generateRoomCode();
      const { error } = await supabase.from("rooms").insert({ id: code });

      if (!error) {
        router.push(`/game/${code}`);
        return;
      }

      // 23505 = violação de unicidade no Postgres (código já existe): tenta outro.
      if (error.code !== "23505") {
        setCreateRoomError("Não foi possível criar a sala. Tente novamente.");
        setCreatingRoom(false);
        return;
      }
    }

    setCreateRoomError("Não foi possível gerar um código de sala único. Tente novamente.");
    setCreatingRoom(false);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    router.push(`/game/${roomCode.toUpperCase()}`);
  };

  const handleStartTestMode = () => {
    // Não precisa criar a linha da sala aqui — o room server faz upsert
    // sozinho na primeira jogada. Mesmo formato de código das salas normais,
    // só que ninguém mais vai usar esse (o Modo Teste é só pra mim + bots).
    router.push(`/game/${generateRoomCode()}?test=1`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-white">LOBBY</h1>
          <p className="text-zinc-400">
            Bem-vindo(a), <span className="text-red-500 font-bold">{playerName}</span>!
          </p>
        </div>

        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-red-500" /> Nova Sala
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Crie uma sala e convide seus amigos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleCreateRoom}
              disabled={creatingRoom}
              className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold text-lg"
            >
              {creatingRoom ? "Criando..." : "Criar Sala"}
            </Button>
            {createRoomError && (
              <div className="text-red-500 text-sm font-bold bg-red-900/20 p-3 rounded-md border border-red-900/50">
                {createRoomError}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-4 py-2">
          <div className="h-px bg-zinc-800 flex-1" />
          <span className="text-zinc-500 font-medium uppercase text-sm">ou</span>
          <div className="h-px bg-zinc-800 flex-1" />
        </div>

        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" /> Entrar em Sala
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Já tem um código? Digite abaixo para jogar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-zinc-300">Código da Sala</Label>
                <div className="flex gap-2">
                  <Input 
                    id="code" 
                    placeholder="Ex: XF8K" 
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={4}
                    className="bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 h-12 text-lg uppercase tracking-widest font-mono"
                    autoComplete="off"
                  />
                  <Button 
                    type="submit" 
                    className="h-12 w-12 bg-white text-black hover:bg-zinc-200"
                    disabled={roomCode.length < 3}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-500" /> Modo Teste
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Você contra 3 IAs — elas embaralham, apostam e jogam totalmente ao acaso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleStartTestMode}
              variant="secondary"
              className="w-full h-12 font-bold text-lg"
            >
              Jogar contra IAs
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Histórico de Partidas */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full max-w-md mt-8 space-y-4"
      >
        <div className="flex items-center gap-2 text-white/80">
          <History className="w-5 h-5" />
          <h2 className="text-xl font-bold">Últimas Partidas</h2>
        </div>

        {history.length === 0 ? (
          <div className="text-zinc-500 text-center py-4 bg-black/40 rounded-xl border border-white/5">
            Nenhuma partida foi jogada ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((match) => (
              <div key={match.id} className="bg-black/40 p-4 rounded-xl border border-white/10 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-xs">Sala: {match.room_id}</span>
                  <span className="text-zinc-500 text-xs">
                    {new Date(match.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-white font-bold text-lg">{match.winner_name} venceu!</span>
                </div>
                <div className="text-sm text-zinc-400">
                  {match.players_summary.map((p: any) => `${p.name} (${p.score})`).join(" • ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
