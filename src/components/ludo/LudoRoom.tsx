"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionProblem } from "@/components/ConnectionProblem";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { BOT_LEVEL_LABEL } from "@/lib/ludo/bot";
import type { BotsSetup } from "@/lib/ludo/setup";
import LudoGame from "./LudoGame";
import LudoLobbyRoom from "./LudoLobbyRoom";
import { LudoUser, isSoloVsBots, useRemoteLudoSession } from "./useLudoSession";

// Depois desse tempo sem conectar, a tela deixa de só girar e diz o que está errado.
const SLOW_CONNECT_MS = 5000;

function Connecting({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-zinc-400">
      <Loader2 className="h-10 w-10 animate-spin text-red-500" />
      <p>{text}</p>
    </div>
  );
}

function LudoOnline({ roomId, user, setup }: { roomId: string; user: LudoUser; setup?: BotsSetup }) {
  const router = useRouter();
  const session = useRemoteLudoSession(roomId, user, setup);
  const [slow, setSlow] = useState(false);
  const hasState = !!session.state;

  useEffect(() => {
    if (hasState) return;
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [hasState]);

  const exit = () => {
    session.send({ type: "leave" });
    router.push("/lobby/ludo");
  };

  if (session.status === "kicked") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <UserX className="h-12 w-12 text-red-400" />
        <p className="text-xl font-bold text-white">O host removeu você da sala.</p>
        <Button onClick={() => router.push("/lobby/ludo")}>Voltar ao menu do Ludo</Button>
      </div>
    );
  }
  if (!session.state) {
    if (slow || session.status === "unauthorized" || session.status === "auth_unavailable") {
      return (
        <ConnectionProblem
          roomLabel={`sala ${roomId}`}
          status={session.status}
          backHref="/lobby/ludo"
          backLabel="Voltar ao menu do Ludo"
        />
      );
    }
    return <Connecting text={`Conectando à sala ${roomId}...`} />;
  }
  if (session.state.phase === "lobby") return <LudoLobbyRoom session={session} roomId={roomId} onExit={exit} />;

  // "Eu contra bots" é uma sala como as outras — só muda o título.
  let title = `Sala ${roomId}`;
  if (isSoloVsBots(session.state, session.me)) {
    const bots = session.state.players.filter((p) => p.bot);
    title = `Contra ${bots.length} ${bots.length === 1 ? "bot" : "bots"} · ${BOT_LEVEL_LABEL[bots[0].bot!]}`;
  }
  return <LudoGame session={session} onExit={exit} title={title} />;
}

export default function LudoRoom({ roomId, setup }: { roomId: string; setup?: BotsSetup }) {
  const { user, loading } = useAuthUser(true);
  if (loading || !user) return <Connecting text="Entrando na sala..." />;
  return <LudoOnline roomId={roomId} user={{ name: user.name, avatarUrl: user.avatarUrl }} setup={setup} />;
}
