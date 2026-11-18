"use client";

import { useCallback, useRef, useState } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import type { ForcaView } from "@/lib/forca/engine";
import { diffForca } from "@/lib/forca/feed";
import type { ForcaClientMessage, ForcaServerMessage } from "@/lib/forca/protocol";
import { FloatingEmoji, PartyUser, RoomStatus, useFloatingEmojis, usePartyRoom } from "@/lib/party/usePartyRoom";

// Sessão da Forca: a MINHA visão da sala (a palavra só aparece inteira pra quem escolheu), quem
// sou eu e como mandar ações — tudo via o room server (party/forca.ts). O histórico é montado
// aqui, a cada mensagem que chega (e não num efeito da tela): duas jogadas seguidas, antes de a
// tela redesenhar, não podem deixar linhas pra trás.

export interface ForcaSession {
  view: ForcaView | null;
  me: string;
  status: RoomStatus;
  send: (message: ForcaClientMessage) => void;
  /** Código do último erro devolvido pelo servidor. */
  error: string | null;
  clearError: () => void;
  emojis: FloatingEmoji[];
  sendEmoji: (emoji: string) => void;
  /** Linhas do histórico da partida. */
  feed: ReturnType<typeof useEventFeed>["entries"];
  /** Revanche: volta pro lobby da sala. */
  playAgain: () => void;
  /** Estimativa do relógio do servidor agora (o tempo da vez é medido nele). */
  serverNow: () => number;
}

export function useForcaSession(roomId: string, user: PartyUser): ForcaSession {
  const [view, setView] = useState<ForcaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { emojis, push: pushEmoji } = useFloatingEmojis();
  const { entries, push: pushFeed, reset: resetFeed } = useEventFeed();
  const lastView = useRef<ForcaView | null>(null);
  // Diferença entre o relógio do servidor e o deste aparelho, medida a cada estado recebido.
  const clockOffset = useRef(0);

  const { status, send } = usePartyRoom<ForcaServerMessage>({
    party: "forca",
    room: roomId,
    user,
    onMessage: (message) => {
      if (message.type === "state") {
        const v = message.state;
        clockOffset.current = message.now - Date.now();
        const d = diffForca(lastView.current, v, { me: user.name });
        lastView.current = v;
        if (d.reset) resetFeed(d.items);
        else pushFeed(d.items);
        setView(v);
      } else if (message.type === "error") setError(message.error);
      else if (message.type === "emoji") pushEmoji(message.emoji, message.fromPlayerId);
    },
  });

  const sendMessage = send as (message: ForcaClientMessage) => void;
  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

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
    playAgain: () => sendMessage({ type: "rematch" }),
    serverNow,
  };
}
