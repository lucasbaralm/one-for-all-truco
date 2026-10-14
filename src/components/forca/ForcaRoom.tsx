"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionProblem } from "@/components/ConnectionProblem";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import type { PartyUser } from "@/lib/party/usePartyRoom";
import { BOT_LEVEL_LABEL } from "@/lib/forca/labels";
import type { BotsSetup } from "@/lib/forca/setup";
import ForcaGame from "./ForcaGame";
import ForcaLobbyRoom from "./ForcaLobbyRoom";
import { isSoloVsBots, useForcaSession } from "./useForcaSession";

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

function ForcaOnline({ roomId, user, setup }: { roomId: string; user: PartyUser; setup?: BotsSetup }) {
  const router = useRouter();
  const session = useForcaSession(roomId, user, setup);
  const [slow, setSlow] = useState(false);
  const hasState = !!session.view;

  useEffect(() => {
    if (hasState) return;
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [hasState]);

  const exit = () => {
    session.send({ type: "leave" });
    router.push("/lobby/forca");
  };

  if (session.status === "kicked") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <UserX className="h-12 w-12 text-red-400" />
        <p className="text-xl font-bold text-white">O host removeu você da sala.</p>
        <Button onClick={() => router.push("/lobby/forca")}>Voltar ao menu da Forca</Button>
      </div>
    );
  }
  if (!session.view) {
    if (slow || session.status === "unauthorized" || session.status === "auth_unavailable") {
      return <ConnectionProblem roomLabel={`sala ${roomId}`} status={session.status} backHref="/lobby/forca" backLabel="Voltar ao menu da Forca" />;
    }
    return <Connecting text={`Conectando à sala ${roomId}...`} />;
  }
  if (session.view.phase === "lobby") return <ForcaLobbyRoom session={session} roomId={roomId} onExit={exit} />;

  // "Eu contra bots" é uma sala como as outras — só muda o título.
  let title = `Sala ${roomId}`;
  if (isSoloVsBots(session.view, session.me)) {
    const bots = session.view.players.filter((p) => p.bot);
    title = `Contra ${bots.length} ${bots.length === 1 ? "bot" : "bots"} · ${BOT_LEVEL_LABEL[bots[0].bot!]}`;
  }
  return <ForcaGame session={session} onExit={exit} title={title} />;
}

export default function ForcaRoom({ roomId, setup }: { roomId: string; setup?: BotsSetup }) {
  const { user, loading } = useAuthUser(true);
  if (loading || !user) return <Connecting text="Entrando na sala..." />;
  return <ForcaOnline roomId={roomId} user={{ name: user.name, avatarUrl: user.avatarUrl }} setup={setup} />;
}
