"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Crown, Loader2, Play } from "lucide-react";
import { motion } from "framer-motion";
import GameBoard from "./GameBoard";

export type PlayerPresence = {
  id: string;
  name: string;
  joinedAt: string;
};

export default function RoomManager({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState<"connecting" | "waiting" | "playing">("connecting");
  const [roomChannel, setRoomChannel] = useState<any>(null);

  useEffect(() => {
    let channel: any;
    // Em dev, o React StrictMode (e o Fast Refresh) monta/desmonta o efeito de
    // novo rapidinho — como setupRoom é async e cria o channel só depois de um
    // `await`, a limpeza da PRIMEIRA montagem pode rodar antes do channel sequer
    // existir (o `if (channel)` no cleanup não pega nada), deixando um channel
    // órfão e inscrito, o que quebra `.on()` em qualquer nova tentativa nele.
    // Esse guard garante que, se o efeito já foi limpo, a montagem descartada
    // nunca chega a criar/inscrever um channel de verdade.
    let cancelled = false;

    const setupRoom = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.push("/");
        return;
      }
      const name = data.session.user.user_metadata.username || "Jogador";
      setPlayerName(name);

      // Conectar ao Supabase Realtime via Channel
      channel = supabase.channel(`room:${roomId}`, {
        config: {
          presence: {
            key: name,
          },
        },
      });
      setRoomChannel(channel);

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const connectedPlayers: PlayerPresence[] = [];

          for (const [key, presencesValue] of Object.entries(state)) {
            const presences = presencesValue as any[];
            const p = presences[0] as { name: string; joinedAt: string };
            connectedPlayers.push({
              id: key,
              name: p.name,
              joinedAt: p.joinedAt,
            });
          }

          connectedPlayers.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
          setPlayers(connectedPlayers);

          if (connectedPlayers.length > 0 && connectedPlayers[0].name === name) {
            setIsHost(true);
          } else {
            setIsHost(false);
          }

          // Presença re-sincroniza sempre que QUALQUER jogador entra/sai/reconecta
          // (o evento "sync" do Supabase Presence dispara pra todo mundo no canal).
          // Se já estamos com o jogo em andamento, uma reconexão de outra pessoa não
          // pode nos jogar de volta pro lobby — só entra em "waiting" antes de "playing".
          setStatus((prev) => (prev === "playing" ? prev : "waiting"));
        })
        // ← CRITICAL: guests listen for the host's start signal
        .on("broadcast", { event: "start_game" }, () => {
          setStatus("playing");
        })
        // Also transition if a sync_state arrives while still in lobby
        // (handles: guest refreshes page after game already started)
        .on("broadcast", { event: "sync_state" }, () => {
          setStatus((prev) => prev === "waiting" ? "playing" : prev);
        })
        .subscribe(async (status: string) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            // joinedAt precisa ser estável entre reconexões (refresh, wifi caindo),
            // senão cada reconexão "reset" a posição do jogador pro fim da fila de
            // presença — o que embaralha a ordem de turno e troca o host à toa.
            // Guardamos no localStorage do navegador, por sala+nome, e reusamos.
            const storageKey = `fodinha:joinedAt:${roomId}:${name}`;
            let joinedAt = window.localStorage.getItem(storageKey);
            if (!joinedAt) {
              joinedAt = new Date().toISOString();
              window.localStorage.setItem(storageKey, joinedAt);
            }

            await channel.track({
              name: name,
              joinedAt,
            });
            if (cancelled) return;

            // Check if a game is already in progress (late joiner / page refresh)
            const { data } = await supabase.from('rooms').select('state').eq('id', roomId).single();
            if (cancelled) return;
            if (data?.state) {
              setStatus("playing");
            }
          }
        });
    };

    setupRoom();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, router]);


  const handleStartGame = () => {
    // Apenas o Host pode iniciar
    if (!isHost || !roomChannel) return;
    
    // Enviar mensagem de BROADCAST para todos iniciarem o jogo
    roomChannel.send({
      type: "broadcast",
      event: "start_game",
      payload: { timestamp: new Date().toISOString() },
    });
    
    // Muda a tela para "playing"
    setStatus("playing");
  };

  if (status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 flex-1 text-zinc-400">
        <Loader2 className="w-10 h-10 animate-spin text-red-500" />
        <p>Conectando à sala {roomId}...</p>
      </div>
    );
  }

  if (status === "playing") {
    return (
      <GameBoard 
        roomId={roomId} 
        playerName={playerName} 
        isHost={isHost} 
        initialPlayers={players} 
        channel={roomChannel}
      />
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white">Sala: {roomId}</h2>
          <p className="text-zinc-400">Aguardando jogadores...</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800">
          <Users className="w-5 h-5 text-zinc-400" />
          <span className="text-white font-bold">{players.length}</span>
        </div>
      </div>

      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Jogadores na Mesa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {players.map((p, idx) => (
              <motion.div 
                key={p.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-zinc-800 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-medium text-lg">{p.name} {p.name === playerName ? "(Você)" : ""}</span>
                </div>
                {idx === 0 && (
                  <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full text-sm font-bold">
                    <Crown className="w-4 h-4" /> Host
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isHost ? (
        <Button 
          onClick={handleStartGame}
          disabled={players.length < 2}
          className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-xl"
        >
          {players.length < 2 ? "Aguardando mais jogadores..." : (
            <span className="flex items-center gap-2"><Play className="w-5 h-5 fill-current" /> Iniciar Partida</span>
          )}
        </Button>
      ) : (
        <div className="text-center p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <Loader2 className="w-6 h-6 animate-spin text-red-500 mx-auto mb-2" />
          <p className="text-zinc-400">Aguardando o host iniciar a partida...</p>
        </div>
      )}
    </div>
  );
}
