"use client";

import { useRef, useState } from "react";
import { useEventFeed } from "@/components/feed/EventFeed";
import type { MonoView } from "@/lib/monopoly/engine";
import { diffMono } from "@/lib/monopoly/feed";
import type { MonoClientMessage, MonoServerMessage } from "@/lib/monopoly/protocol";
import { BotsSetup, botsSetupMessages } from "@/lib/monopoly/setup";
import { isFreshRoomOf } from "@/lib/party/roomRules";
import { FloatingEmoji, PartyUser, RoomStatus, useFloatingEmojis, usePartyRoom } from "@/lib/party/usePartyRoom";
import { EDITION_UI } from "./edition-ui";
import type { EditionId } from "@/lib/monopoly/editions";

// Sessão do Monopoly / Banco Imobiliário: a MINHA visão da sala (o que eu posso fazer agora vem
// pronto do servidor, em `view.me`), quem sou eu e como mandar ações — tudo via o room server
// (party/monopoly.ts), inclusive nas partidas contra bots. O histórico é montado aqui, a cada
// mensagem que chega (e não num efeito da tela): duas jogadas seguidas, antes de a tela redesenhar,
// não podem deixar linhas pra trás.

export interface MonopolySession {
  edition: EditionId;
  view: MonoView | null;
  me: string;
  status: RoomStatus;
  send: (message: MonoClientMessage) => void;
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
export function isSoloVsBots(view: MonoView | null, me: string): boolean {
  if (!view) return false;
  const humans = view.players.filter((p) => !p.bot);
  return humans.length === 1 && humans[0].id === me && view.players.length > 1;
}

export function useMonopolySession(edition: EditionId, roomId: string, user: PartyUser, setup?: BotsSetup): MonopolySession {
  const [view, setView] = useState<MonoView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { emojis, push: pushEmoji } = useFloatingEmojis();
  const { entries, push: pushFeed, reset: resetFeed } = useEventFeed();
  const lastView = useRef<MonoView | null>(null);
  // Ref (não state): duas mensagens "state" seguidas não podem montar a partida duas vezes.
  const setupDone = useRef(false);

  const { status, send } = usePartyRoom<MonoServerMessage>({
    party: EDITION_UI[edition].party,
    room: roomId,
    user,
    onMessage: (message, reply) => {
      if (message.type === "state") {
        const v = message.state;
        const d = diffMono(lastView.current, v, { me: user.name });
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

  const sendMessage = send as (message: MonoClientMessage) => void;

  return {
    edition,
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
