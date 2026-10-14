"use client";

import { useRef, useState } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import type { UnoView } from "@/lib/uno/engine";
import { diffUno } from "@/lib/uno/feed";
import type { UnoClientMessage, UnoServerMessage } from "@/lib/uno/protocol";
import { BotsSetup, botsSetupMessages } from "@/lib/uno/setup";
import { isFreshRoomOf } from "@/lib/party/roomRules";
import { FloatingEmoji, PartyUser, RoomStatus, useFloatingEmojis, usePartyRoom } from "@/lib/party/usePartyRoom";

// Sessão do Uno: a MINHA visão da sala (a minha mão, a contagem das outras), quem
// sou eu e como mandar ações — tudo via o room server (party/uno.ts), inclusive
// nas partidas contra bots. O histórico é montado aqui, a cada mensagem que chega
// (e não num efeito da tela): duas jogadas seguidas, antes de a tela redesenhar,
// não podem deixar linhas pra trás.

export interface UnoSession {
  view: UnoView | null;
  me: string;
  status: RoomStatus;
  send: (message: UnoClientMessage) => void;
  /** Código do último erro devolvido pelo servidor. */
  error: string | null;
  clearError: () => void;
  emojis: FloatingEmoji[];
  sendEmoji: (emoji: string) => void;
  /** Linhas do histórico da partida. */
  feed: ReturnType<typeof useEventFeed>["entries"];
  /** Revanche: volta pro lobby da sala (e, contra bots, já começa outra partida). */
  playAgain: () => void;
}

/** Só eu de gente de verdade na sala (o resto são bots). */
export function isSoloVsBots(view: UnoView | null, me: string): boolean {
  if (!view) return false;
  const humans = view.players.filter((p) => !p.bot);
  return humans.length === 1 && humans[0].id === me && view.players.length > 1;
}

export function useUnoSession(roomId: string, user: PartyUser, setup?: BotsSetup): UnoSession {
  const [view, setView] = useState<UnoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { emojis, push: pushEmoji } = useFloatingEmojis();
  const { entries, push: pushFeed, reset: resetFeed } = useEventFeed();
  const lastView = useRef<UnoView | null>(null);
  // Ref (não state): duas mensagens "state" seguidas não podem montar a partida duas vezes.
  const setupDone = useRef(false);

  const { status, send } = usePartyRoom<UnoServerMessage>({
    party: "uno",
    room: roomId,
    user,
    onMessage: (message, reply) => {
      if (message.type === "state") {
        const v = message.state;
        const d = diffUno(lastView.current, v, { me: user.name });
        lastView.current = v;
        if (d.reset) resetFeed(d.items);
        else pushFeed(d.items);
        setView(v);
        // Sala "contra bots" recém-criada: o dono monta a partida uma única vez.
        if (setup && !setupDone.current && isFreshRoomOf(v, user.name)) {
          setupDone.current = true;
          for (const m of botsSetupMessages(setup)) reply(m);
        }
      } else if (message.type === "error") setError(message.error);
      else if (message.type === "emoji") pushEmoji(message.emoji, message.fromPlayerId);
    },
  });

  const sendMessage = send as (message: UnoClientMessage) => void;

  return {
    view,
    me: user.name,
    status,
    send: sendMessage,
    error,
    clearError: () => setError(null),
    emojis,
    sendEmoji: (emoji) => {
      pushEmoji(emoji, user.name);
      sendMessage({ type: "emoji", emoji });
    },
    feed: entries,
    playAgain: () => {
      sendMessage({ type: "rematch" });
      if (isSoloVsBots(view, user.name)) sendMessage({ type: "start" });
    },
  };
}
