"use client";

import { useCallback, useRef, useState } from "react";
import type { DobbleView } from "@/lib/dobble/engine";
import type { DobbleClientMessage, DobbleServerMessage } from "@/lib/dobble/protocol";
import { BotsSetup, botsSetupMessages } from "@/lib/dobble/setup";
import { isFreshRoomOf } from "@/lib/party/roomRules";
import { FloatingEmoji, PartyUser, RoomStatus, useFloatingEmojis, usePartyRoom } from "@/lib/party/usePartyRoom";

// Sessão do Dobble: o estado público da sala (o que está virado pra cima), quem
// sou eu e como mandar ações — tudo via o room server (party/dobble.ts), inclusive
// nas partidas contra bots.

export interface DobbleSession {
  view: DobbleView | null;
  me: string;
  status: RoomStatus;
  send: (message: DobbleClientMessage) => void;
  /** Código do último erro devolvido pelo servidor. */
  error: string | null;
  clearError: () => void;
  emojis: FloatingEmoji[];
  sendEmoji: (emoji: string) => void;
  /** Revanche: volta pro lobby da sala (e, contra bots, já começa outra partida). */
  playAgain: () => void;
  /** Estimativa do relógio do servidor agora (os castigos são medidos nele). */
  serverNow: () => number;
}

/** Só eu de gente de verdade na sala (o resto são bots). */
export function isSoloVsBots(view: DobbleView | null, me: string): boolean {
  if (!view) return false;
  const humans = view.players.filter((p) => !p.bot);
  return humans.length === 1 && humans[0].id === me && view.players.length > 1;
}

export function useDobbleSession(roomId: string, user: PartyUser, setup?: BotsSetup): DobbleSession {
  const [view, setView] = useState<DobbleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { emojis, push: pushEmoji } = useFloatingEmojis();
  // Diferença entre o relógio do servidor e o deste aparelho, medida a cada estado recebido.
  const clockOffset = useRef(0);
  // Ref (não state): duas mensagens "state" seguidas não podem montar a partida duas vezes.
  const setupDone = useRef(false);

  const { status, send } = usePartyRoom<DobbleServerMessage>({
    party: "dobble",
    room: roomId,
    user,
    onMessage: (message, reply) => {
      if (message.type === "state") {
        const v = message.state;
        clockOffset.current = message.now - Date.now();
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

  const sendMessage = send as (message: DobbleClientMessage) => void;
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
    playAgain: () => {
      sendMessage({ type: "rematch" });
      if (isSoloVsBots(view, user.name)) sendMessage({ type: "start" });
    },
    serverNow,
  };
}
