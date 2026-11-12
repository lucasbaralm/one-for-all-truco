"use client";

import { useCallback, useRef, useState } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import { parseRtcMessage } from "@/lib/call/signaling";
import type { CallSignal } from "@/lib/call/signaling";
import type { MimicaView } from "@/lib/mimica/engine";
import { diffMimica } from "@/lib/mimica/feed";
import type { MimicaClientMessage, MimicaServerMessage } from "@/lib/mimica/protocol";
import { FloatingEmoji, PartyUser, RoomStatus, useFloatingEmojis, usePartyRoom } from "@/lib/party/usePartyRoom";

// Sessão da Mímica: a MINHA visão da sala (a carta e a música só aparecem pra quem faz a mímica), quem
// sou eu e como mandar ações — tudo via o room server (party/mimica.ts). O histórico é montado aqui, a
// cada mensagem que chega (e não num efeito da tela): duas jogadas seguidas, antes de a tela redesenhar,
// não podem deixar linhas pra trás. A sinalização da videochamada passa pelo mesmo WebSocket: o hook da
// chamada (useCall) assina `subscribeSignals` e manda pelo `sendSignal`.

type Listener = (from: string, signal: CallSignal) => void;

export interface MimicaSession {
  view: MimicaView | null;
  me: string;
  status: RoomStatus;
  send: (message: MimicaClientMessage) => void;
  /** Código do último erro devolvido pelo servidor. */
  error: string | null;
  clearError: () => void;
  emojis: FloatingEmoji[];
  sendEmoji: (emoji: string) => void;
  /** Linhas do histórico da partida. */
  feed: ReturnType<typeof useEventFeed>["entries"];
  /** Revanche: volta pro lobby da sala. */
  playAgain: () => void;
  /** Estimativa do relógio do servidor agora (os prazos são medidos nele). */
  serverNow: () => number;
  /** Videochamada: manda um sinal pra uma pessoa da mesa. */
  sendSignal: (to: string, signal: CallSignal) => void;
  /** Videochamada: escuta os sinais que chegam (devolve como parar de escutar). */
  subscribeSignals: (listener: Listener) => () => void;
}

export function useMimicaSession(roomId: string, user: PartyUser): MimicaSession {
  const [view, setView] = useState<MimicaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { emojis, push: pushEmoji } = useFloatingEmojis();
  const { entries, push: pushFeed, reset: resetFeed } = useEventFeed();
  const lastView = useRef<MimicaView | null>(null);
  // Diferença entre o relógio do servidor e o deste aparelho, medida a cada estado recebido.
  const clockOffset = useRef(0);
  const listeners = useRef(new Set<Listener>());

  const { status, send } = usePartyRoom<MimicaServerMessage>({
    party: "mimica",
    room: roomId,
    user,
    onMessage: (message) => {
      if (message.type === "state") {
        const v = message.state;
        clockOffset.current = message.now - Date.now();
        const d = diffMimica(lastView.current, v, { me: user.name });
        lastView.current = v;
        if (d.reset) resetFeed(d.items);
        else pushFeed(d.items);
        setView(v);
      } else if (message.type === "error") setError(message.error);
      else if (message.type === "emoji") pushEmoji(message.emoji, message.fromPlayerId);
      else if (message.type === "rtc") {
        const rtc = parseRtcMessage(message);
        if (rtc) for (const listener of listeners.current) listener(rtc.from, rtc.signal);
      }
    },
  });

  const sendMessage = send as (message: MimicaClientMessage) => void;
  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);
  const sendSignal = useCallback((to: string, signal: CallSignal) => sendMessage({ type: "rtc", to, signal }), [sendMessage]);
  const subscribeSignals = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);

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
    sendSignal,
    subscribeSignals,
  };
}
