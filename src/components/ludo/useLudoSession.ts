"use client";

import { useRef, useState } from "react";
import { LudoState } from "@/lib/ludo/engine";
import { LudoClientMessage, LudoServerMessage } from "@/lib/ludo/protocol";
import { BotsSetup, botsSetupMessages } from "@/lib/ludo/setup";
import { isFreshRoomOf } from "@/lib/party/roomRules";
import { FloatingEmoji, PartyUser, RoomStatus, useFloatingEmojis, usePartyRoom } from "@/lib/party/usePartyRoom";

export type { FloatingEmoji };

// Uma "sessão" de Ludo é tudo que a tela precisa: o estado da sala, quem sou
// eu e como mandar ações. Toda partida — inclusive "eu contra bots" — roda no
// room server (party/ludo.ts): o servidor rola o dado e joga pelos bots, e se
// o servidor de jogo estiver fora do ar a sala simplesmente não conecta (a tela avisa).

export interface LudoSession {
  state: LudoState | null;
  me: string;
  status: RoomStatus;
  send: (message: LudoClientMessage) => void;
  /** Código do último erro devolvido pelo servidor. */
  error: string | null;
  clearError: () => void;
  emojis: FloatingEmoji[];
  sendEmoji: (emoji: string) => void;
  /** Revanche: volta pro lobby da sala (e, contra bots, já começa outra partida). */
  playAgain: () => void;
}

export type LudoUser = PartyUser;

/** Só eu de gente de verdade na sala (o resto são bots): é uma partida "contra bots". */
export function isSoloVsBots(state: LudoState | null, me: string): boolean {
  if (!state) return false;
  const humans = state.players.filter((p) => !p.bot);
  return humans.length === 1 && humans[0].id === me && state.players.length > 1;
}

export function useRemoteLudoSession(roomId: string, user: LudoUser, setup?: BotsSetup): LudoSession {
  const [state, setState] = useState<LudoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { emojis, push: pushEmoji } = useFloatingEmojis();
  // Ref (não state): duas mensagens "state" seguidas, antes de renderizar de novo, não podem montar a partida duas vezes.
  const setupDone = useRef(false);

  const { status, send } = usePartyRoom<LudoServerMessage>({
    party: "ludo",
    room: roomId,
    user,
    onMessage: (message, reply) => {
      if (message.type === "state") {
        const s = message.state;
        setState(s);
        // Sala "contra bots" recém-criada: o dono monta a partida uma única vez
        // (cor, bots e começar). Depois de uma revanche (gameNumber > 0) ou
        // num reload (a partida já está rolando) isso não se repete.
        if (setup && !setupDone.current && isFreshRoomOf(s, user.name)) {
          setupDone.current = true;
          for (const m of botsSetupMessages(setup)) reply(m);
        }
      } else if (message.type === "error") setError(message.error);
      else if (message.type === "emoji") pushEmoji(message.emoji, message.fromPlayerId);
    },
  });

  return {
    state,
    me: user.name,
    status,
    send: send as (message: LudoClientMessage) => void,
    error,
    clearError: () => setError(null),
    emojis,
    sendEmoji: (emoji) => {
      pushEmoji(emoji, user.name); // otimista: aparece pra mim na hora
      send({ type: "emoji", emoji } satisfies LudoClientMessage);
    },
    playAgain: () => {
      send({ type: "rematch" } satisfies LudoClientMessage);
      // Só eu e bots: não há ninguém pra esperar no lobby, já começa de novo.
      if (isSoloVsBots(state, user.name)) send({ type: "start" } satisfies LudoClientMessage);
    },
  };
}
