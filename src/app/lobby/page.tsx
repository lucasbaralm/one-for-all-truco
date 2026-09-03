"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, ArrowRight, Trophy, History, Bot, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function Lobby() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [userId, setUserId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
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
      setUserId(data.session.user.id);
      setAvatarUrl(data.session.user.user_metadata.avatar_url ?? null);
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

  // Upload da foto de perfil: guarda no bucket "avatars" do Supabase Storage
  // (precisa existir e ter as policies certas — ver instruções no README/chat)
  // sob o path do próprio usuário, e salva a URL pública no user_metadata pra
  // ficar "salvo na conta pra sempre" e visível pros outros via presença.
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!file || !userId) return;

    setAvatarError("");

    if (!file.type.startsWith("image/")) {
      setAvatarError("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Imagem muito grande (máximo 5MB).");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setAvatarError("Não foi possível enviar a foto. Tente novamente.");
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust: o path não muda num re-upload (upsert), então sem isso o
      // navegador (e outros jogadores) continuariam vendo a imagem antiga em cache.
      const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      if (updateError) {
        setAvatarError("Foto enviada, mas não deu pra salvar no perfil. Tente de novo.");
        return;
      }

      setAvatarUrl(publicUrl);
    } catch {
      setAvatarError("Ocorreu um erro ao enviar a foto.");
    } finally {
      setUploadingAvatar(false);
    }
  };

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
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-black text-white">LOBBY</h1>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative group rounded-full disabled:cursor-wait"
              title="Trocar foto de perfil"
            >
              <PlayerAvatar avatarUrl={avatarUrl} name={playerName} className="w-20 h-20 text-2xl" />
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploadingAvatar ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </div>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            {avatarError && <p className="text-red-500 text-xs font-bold max-w-xs">{avatarError}</p>}
          </div>

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
