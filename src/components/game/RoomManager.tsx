"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Crown, Loader2, Play, GripVertical } from "lucide-react";
import { Reorder } from "framer-motion";
import GameBoard from "./GameBoard";
import { PlayerAvatar } from "./PlayerAvatar";

export type PlayerPresence = {
  id: string;
  name: string;
  joinedAt: string;
  avatarUrl?: string | null;
};

// Nomes só pra exibição dos 3 bots do Modo Teste — o id de verdade (que o
// room server usa pra saber quem controlar sozinho) é sempre "bot:N".
const BOT_NAMES = ["Robô 1", "Robô 2", "Robô 3"];

export default function RoomManager({ roomId, testMode = false }: { roomId: string; testMode?: boolean }) {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState<"connecting" | "waiting" | "playing">("connecting");
  const [roomChannel, setRoomChannel] = useState<any>(null);
  // Ordem de assentos que os jogadores escolheram arrastando na sala de espera
  // (null = ainda ninguém mexeu, usa a ordem natural de chegada). É só de
  // exibição/assento — puramente local + broadcast, não é regra de jogo nem
  // decide quem é host (isso continua vindo só da presença).
  const [seatOrder, setSeatOrder] = useState<string[] | null>(null);

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
      // avatar_url só existe no próprio user_metadata (o de cada um) — é por
      // isso que ele precisa viajar via presença/initialPlayers até os outros
      // jogadores, e não pode ser buscado direto do Supabase pra outro usuário.
      const avatarUrl: string | null = data.session.user.user_metadata.avatar_url ?? null;
      setPlayerName(name);

      // Modo Teste: eu vs 3 bots, sem presença nem outros jogadores de
      // verdade — pula direto pro jogo com uma lista de jogadores sintética
      // (o room server reconhece o prefixo "bot:" e joga por eles sozinho).
      if (testMode) {
        const now = new Date().toISOString();
        setPlayers([
          { id: name, name, joinedAt: now, avatarUrl },
          ...BOT_NAMES.map((botName, i) => ({ id: `bot:${i + 1}`, name: botName, joinedAt: now, avatarUrl: null })),
        ]);
        setStatus("playing");
        return;
      }

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
            const p = presences[0] as { name: string; joinedAt: string; avatarUrl?: string | null };
            connectedPlayers.push({
              id: key,
              name: p.name,
              joinedAt: p.joinedAt,
              avatarUrl: p.avatarUrl ?? null,
            });
          }

          connectedPlayers.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
          // Presence "sync" dispara toda hora (qualquer reconexão de QUALQUER
          // jogador no canal, keep-alives, etc.), sempre com objetos NOVOS —
          // mesmo quando nada realmente mudou. Sem esse guard, a lista (e os
          // objetos de cada jogador) trocavam de referência a cada sync, o
          // que confundia o Reorder.Item (que rastreia identidade por
          // referência) no meio de um arraste, fazendo o item "resetar".
          setPlayers((prev) => {
            const changed =
              prev.length !== connectedPlayers.length ||
              connectedPlayers.some((cp, i) => prev[i]?.id !== cp.id || prev[i]?.joinedAt !== cp.joinedAt || prev[i]?.avatarUrl !== cp.avatarUrl);
            return changed ? connectedPlayers : prev;
          });

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
        // Alguém arrastou pra trocar de assento na sala de espera — todo
        // mundo adota a mesma ordem, pra começar a partida com o assento
        // que foi combinado, não a ordem crua de chegada.
        .on("broadcast", { event: "seat_reorder" }, (res: any) => {
          if (Array.isArray(res.payload?.order)) setSeatOrder(res.payload.order);
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
              avatarUrl,
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
  }, [roomId, router, testMode]);

  // Reconcilia a ordem combinada (seatOrder) com quem está de fato presente:
  // mantém a ordem escolhida pra quem continua na sala, tira quem saiu, e
  // põe gente nova (quem ainda não foi arrastada por ninguém) no fim.
  const orderedPlayers = seatOrder
    ? [
        ...seatOrder.filter((id) => players.some((p) => p.id === id)).map((id) => players.find((p) => p.id === id)!),
        ...players.filter((p) => !seatOrder.includes(p.id)),
      ]
    : players;

  // Host "de verdade" pra fins de autoridade (quem chegou primeiro e segue
  // conectado) — independente de assento, que é só estética/ordem de turno.
  const trueHostName = players[0]?.name;

  // Alguém arrastou um assento: adota localmente e avisa a mesa toda, pra
  // todo mundo começar a partida com a mesma ordem combinada.
  const handleSeatReorder = (newOrder: PlayerPresence[]) => {
    const order = newOrder.map((p) => p.id);
    setSeatOrder(order);
    roomChannel?.send({ type: "broadcast", event: "seat_reorder", payload: { order } });
  };

  // Se alguém novo entra depois que já existia uma ordem combinada, reenvia
  // ela pra mesa (o recém-chegado ainda não tinha recebido nenhum broadcast
  // de reorder anterior — sem isso ele só veria a ordem crua de chegada).
  useEffect(() => {
    if (seatOrder && roomChannel) {
      roomChannel.send({ type: "broadcast", event: "seat_reorder", payload: { order: seatOrder } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length]);

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
        initialPlayers={orderedPlayers}
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

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Jogadores na Mesa</CardTitle>
          <p className="text-zinc-500 text-sm">Arraste pra trocar a ordem dos assentos antes de começar.</p>
        </CardHeader>
        <CardContent>
          <Reorder.Group as="div" axis="y" values={orderedPlayers} onReorder={handleSeatReorder} className="space-y-3">
            {orderedPlayers.map((p) => (
              <Reorder.Item
                as="div"
                key={p.id}
                value={p}
                whileDrag={{ scale: 1.03, boxShadow: "0 12px 28px rgba(0,0,0,0.45)", zIndex: 10 }}
                className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800/50 cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />
                  <PlayerAvatar avatarUrl={p.avatarUrl} name={p.name} />
                  <span className="text-white font-medium text-lg">{p.name} {p.name === playerName ? "(Você)" : ""}</span>
                </div>
                {p.name === trueHostName && (
                  <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full text-sm font-bold shrink-0">
                    <Crown className="w-4 h-4" /> Host
                  </div>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>
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
        <div className="text-center p-6 bg-zinc-900 rounded-xl border border-zinc-800">
          <Loader2 className="w-6 h-6 animate-spin text-red-500 mx-auto mb-2" />
          <p className="text-zinc-400">Aguardando o host iniciar a partida...</p>
        </div>
      )}
    </div>
  );
}
