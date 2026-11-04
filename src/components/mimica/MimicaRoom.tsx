"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallAudio } from "@/components/call/CallAudio";
import { ConnectionProblem } from "@/components/ConnectionProblem";
import { useCall } from "@/lib/call/useCall";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import type { PartyUser } from "@/lib/party/usePartyRoom";
import MimicaGame from "./MimicaGame";
import MimicaLobbyRoom from "./MimicaLobbyRoom";
import { useMimicaSession } from "./useMimicaSession";

// Depois desse tempo sem conectar, a tela deixa de só girar e diz o que está errado.
const SLOW_CONNECT_MS = 5000;

function Connecting({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-zinc-400">
      <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
      <p>{text}</p>
    </div>
  );
}

function MimicaOnline({ roomId, user }: { roomId: string; user: PartyUser }) {
  const router = useRouter();
  const session = useMimicaSession(roomId, user);
  const [slow, setSlow] = useState(false);
  const view = session.view;
  const hasState = !!view;

  // A videochamada mora aqui (e não no lobby ou na partida) pra seguir de pé quando a tela troca de um pro outro.
  // Só conecta com quem está na mesa; quem só assiste não entra na chamada.
  const seated = !!view?.players.some((p) => p.id === user.name);
  const peerKey = view && seated ? view.players.filter((p) => p.id !== user.name).map((p) => p.id).join("|") : "";
  const peers = useMemo(() => (peerKey ? peerKey.split("|") : []), [peerKey]);
  const inTurn = !!view && view.mimerId === user.name && (view.phase === "picking" || view.phase === "miming");
  const call = useCall({
    me: user.name,
    peers,
    sendSignal: session.sendSignal,
    subscribe: session.subscribeSignals,
    // Quem faz a mímica sobe o vídeo em qualidade e fica com o microfone cortado (sem som).
    highQuality: inTurn,
    micLocked: !!view && view.mimerId === user.name && view.phase === "miming",
  });

  useEffect(() => {
    if (hasState) return;
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [hasState]);

  const exit = () => {
    call.leave();
    session.send({ type: "leave" });
    router.push("/lobby/mimica");
  };

  if (session.status === "kicked") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <UserX className="h-12 w-12 text-red-400" />
        <p className="text-xl font-bold text-white">O host removeu você da sala.</p>
        <Button onClick={() => router.push("/lobby/mimica")}>Voltar ao menu da Mímica</Button>
      </div>
    );
  }
  if (!view) {
    if (slow || session.status === "unauthorized" || session.status === "auth_unavailable") {
      return <ConnectionProblem roomLabel={`sala ${roomId}`} status={session.status} backHref="/lobby/mimica" backLabel="Voltar ao menu da Mímica" />;
    }
    return <Connecting text={`Conectando à sala ${roomId}...`} />;
  }
  return (
    <>
      {/* o som da chamada mora aqui, de pé nas duas telas (lobby e partida) */}
      <CallAudio peers={call.peers} />
      {view.phase === "lobby" ? (
        <MimicaLobbyRoom session={session} call={call} roomId={roomId} onExit={exit} />
      ) : (
        <MimicaGame session={session} call={call} onExit={exit} title={`Sala ${roomId}`} />
      )}
    </>
  );
}

export default function MimicaRoom({ roomId }: { roomId: string }) {
  const { user, loading } = useAuthUser(true);
  if (loading || !user) return <Connecting text="Entrando na sala..." />;
  return <MimicaOnline roomId={roomId} user={{ name: user.name, avatarUrl: user.avatarUrl }} />;
}
