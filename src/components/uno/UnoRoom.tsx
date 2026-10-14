"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionProblem } from "@/components/ConnectionProblem";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import type { PartyUser } from "@/lib/party/usePartyRoom";
import { BOT_LEVEL_LABEL } from "@/lib/uno/labels";
import type { BotsSetup } from "@/lib/uno/setup";
import UnoGame from "./UnoGame";
import UnoLobbyRoom from "./UnoLobbyRoom";
import { isSoloVsBots, useUnoSession } from "./useUnoSession";

// Depois desse tempo sem conectar, a tela deixa de só girar e diz o que está errado.
const SLOW_CONNECT_MS = 5000;

function Connecting({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-zinc-400">
      <Loader2 className="h-10 w-10 animate-spin text-red-400" />
      <p>{text}</p>
    </div>
  );
}

function UnoOnline({ roomId, user, setup }: { roomId: string; user: PartyUser; setup?: BotsSetup }) {
  const router = useRouter();
  const session = useUnoSession(roomId, user, setup);
  const [slow, setSlow] = useState(false);
  const hasState = !!session.view;

  useEffect(() => {
    if (hasState) return;
    const timer = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => clearTimeout(timer);
  }, [hasState]);

  const exit = () => {
    session.send({ type: "leave" });
    router.push("/lobby/uno");
  };

  if (session.status === "kicked") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <UserX className="h-12 w-12 text-red-400" />
        <p className="text-xl font-bold text-white">O host removeu você da sala.</p>
        <Button onClick={() => router.push("/lobby/uno")}>Voltar ao menu do Uno</Button>
      </div>
    );
  }
  if (!session.view) {
    if (slow || session.status === "unauthorized" || session.status === "auth_unavailable") {
      return <ConnectionProblem roomLabel={`sala ${roomId}`} status={session.status} backHref="/lobby/uno" backLabel="Voltar ao menu do Uno" />;
    }
    return <Connecting text={`Conectando à sala ${roomId}...`} />;
  }
  if (session.view.phase === "lobby") return <UnoLobbyRoom session={session} roomId={roomId} onExit={exit} />;

  // "Eu contra bots" é uma sala como as outras — só muda o título.
  let title = `Sala ${roomId}`;
  if (isSoloVsBots(session.view, session.me)) {
    const bots = session.view.players.filter((p) => p.bot);
    title = `Contra ${bots.length} ${bots.length === 1 ? "bot" : "bots"} · ${BOT_LEVEL_LABEL[bots[0].bot!]}`;
  }
  return <UnoGame session={session} onExit={exit} title={title} />;
}

export default function UnoRoom({ roomId, setup }: { roomId: string; setup?: BotsSetup }) {
  const { user, loading } = useAuthUser(true);
  if (loading || !user) return <Connecting text="Entrando na sala..." />;
  return <UnoOnline roomId={roomId} user={{ name: user.name, avatarUrl: user.avatarUrl }} setup={setup} />;
}
