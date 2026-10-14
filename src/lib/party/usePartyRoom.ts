"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePartySocket } from "partysocket/react";
import { supabase } from "@/lib/supabase/client";
import { partyHost } from "@/lib/services";
import { RoomStatus, statusAfterClose, statusAfterOpen } from "./roomRules";

export type { RoomStatus };

// Conexão com um room server (PartyServer) de um jogo com salas: cuida de tudo
// que é igual entre Ludo e Dobble — token do Supabase na URL, "join" ao abrir
// (e ao reconectar), e o que cada código de fechamento significa. O que é de
// cada jogo (estado, erros, reações) fica com quem usa o hook.

export interface FloatingEmoji {
  id: string;
  emoji: string;
  fromPlayerId: string;
}

/** Reações que sobem da foto de quem mandou e somem sozinhas. */
export function useFloatingEmojis() {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);
  const push = useCallback((emoji: string, fromPlayerId: string) => {
    const id = Math.random().toString(36).slice(2);
    setEmojis((prev) => [...prev, { id, emoji, fromPlayerId }]);
    setTimeout(() => setEmojis((prev) => prev.filter((e) => e.id !== id)), 2200);
  }, []);
  return { emojis, push };
}

export interface PartyUser {
  name: string;
  avatarUrl: string | null;
}

export function usePartyRoom<M extends { type: string }>({
  party,
  room,
  user,
  onMessage,
}: {
  party: string;
  room: string;
  user: PartyUser;
  /** Recebe cada mensagem do servidor (já em objeto) e uma função pra responder. */
  onMessage: (message: M, send: (message: object) => void) => void;
}) {
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const userRef = useRef(user);
  const handlerRef = useRef(onMessage);
  useEffect(() => {
    userRef.current = user;
    handlerRef.current = onMessage;
  }, [user, onMessage]);

  const socket = usePartySocket({
    host: partyHost(),
    party,
    room,
    query: async () => {
      const { data } = await supabase.auth.getSession();
      return { token: data.session?.access_token ?? "", playerId: userRef.current.name };
    },
    onOpen: () => {
      setStatus(statusAfterOpen);
      // Sempre entra ao abrir (também na reconexão): o servidor decide se vira
      // jogador (lobby com vaga / já era da partida) ou espectador.
      socket.send(JSON.stringify({ type: "join", name: userRef.current.name, avatarUrl: userRef.current.avatarUrl }));
    },
    onClose: (event) => {
      const { status: next, stopRetrying } = statusAfterClose(event.code);
      setStatus(next);
      if (stopRetrying) socket.close();
    },
    onMessage: (event) => {
      let message: M;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "state") setStatus("open");
      handlerRef.current(message, (m) => socket.send(JSON.stringify(m)));
    },
  });

  const send = useCallback((message: object) => socket.send(JSON.stringify(message)), [socket]);
  return { status, send };
}
