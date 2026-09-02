"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  GameState,
  createInitialState,
  startNextRound,
  handleBet,
  handlePlayCard,
  handleShuffleAndDeal,
  voteToEndMatch,
  ShuffleStyle,
} from "@/lib/game/state-machine";
import { PlayerPresence } from "./RoomManager";
import { Card as GameCard, getWinningCardIndex } from "@/lib/game/rules";
import { resolveHostId } from "@/lib/game/host";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Spade, Heart, Club, Diamond, SmilePlus, ChevronDown, ChevronUp, LogOut, Flag, WifiOff, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const SHUFFLE_TYPE_LABELS: Record<string, string> = {
  cut: "✂️ Cortar",
  riffle: "🎴 Riffle",
  overhand: "🤌 Pilha",
  lucas: "👑 Supremo do Lucas",
};

const DISCONNECT_WAIT_MS = 5 * 60 * 1000;
// Quanto tempo a última vaza da rodada fica parada na mesa (sem voar pro
// vencedor) antes do placar aparecer — dá tempo de ver o que foi jogado.
const LAST_TRICK_REVEAL_MS = 3000;

interface GameBoardProps {
  roomId: string;
  playerName: string;
  isHost: boolean;
  initialPlayers: PlayerPresence[];
  channel: any;
}

interface TrickResult {
  winnerId: string;
  cards: { playerId: string; card: GameCard }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// GameBoard — single source of truth is Supabase DB.
// Host mutates state and writes to DB + broadcasts.
// Guests always accept state from broadcasts (and fall back to DB poll on reconnect).
// ─────────────────────────────────────────────────────────────────────────────
export default function GameBoard({
  roomId,
  playerName,
  isHost: presenceIsHost,
  initialPlayers,
  channel,
}: GameBoardProps) {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [emojis, setEmojis] = useState<{ id: string; emoji: string; fromPlayerId: string }[]>([]);
  const [trickResult, setTrickResult] = useState<TrickResult | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [disconnectTimer, setDisconnectTimer] = useState<{
    startedAt: number;
    dismissed: boolean;
    paused: boolean;
    pausedAt: number | null;
    pausedMsTotal: number;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now()); // atualizado 1x/seg pelo contador da desconexão
  const [shuffleAnnouncement, setShuffleAnnouncement] = useState<{ dealerName: string; label: string } | null>(null);
  const { theme } = useTheme();

  // Sempre a versão mais atual de initialPlayers, pra usar dentro de callbacks
  // de broadcast (cujo closure foi criado há um tempo) sem precisar re-registrar
  // os listeners do channel toda vez que a presença muda.
  const initialPlayersRef = useRef(initialPlayers);
  useEffect(() => {
    initialPlayersRef.current = initialPlayers;
  }, [initialPlayers]);

  // Quantos dos jogadores passados estão conectados agora (presença ao vivo).
  // Usado pra decidir a maioria da votação de encerrar a partida.
  const countConnected = useCallback((players: { id: string }[]) => {
    const connectedIds = new Set(initialPlayersRef.current.map((p) => p.id));
    return players.filter((p) => connectedIds.has(p.id)).length;
  }, []);

  // Unique key per round so layoutId doesn't conflict across rounds
  const roundKey = gameState?.currentRoundCards ?? 0;

  // Ao entrar em 'round_end', segura a mesa (mostrando a última vaza, parada)
  // por LAST_TRICK_REVEAL_MS antes de liberar o placar — em todo cliente,
  // não só no host, já que todo mundo recebe a mesma vaza final via sync.
  const [scoreboardReady, setScoreboardReady] = useState(false);
  useEffect(() => {
    if (gameState?.phase !== "round_end") {
      setScoreboardReady(false);
      return;
    }
    const t = setTimeout(() => setScoreboardReady(true), LAST_TRICK_REVEAL_MS);
    return () => clearTimeout(t);
  }, [gameState?.phase]);

  // ── Sticky host authority ────────────────────────────────────────────────
  // `presenceIsHost` (from RoomManager) is purely "who joined earliest and is
  // still connected" — it flips live on every reconnect, which would yank host
  // authority back and forth mid-game. Once a game exists, authority instead
  // follows `gameState.hostId`: it only moves on when the CURRENT host is no
  // longer present, and never reverts to a host who reconnects later.
  const myId = playerName;
  const isHost = useMemo(() => {
    if (!gameState) return presenceIsHost; // Antes do primeiro fetch: usa o fallback de presença
    return resolveHostId(gameState.hostId, initialPlayers) === myId;
  }, [gameState, initialPlayers, presenceIsHost, myId]);

  // Assim que este cliente se torna o host efetivo, grava isso no estado
  // compartilhado para que os outros clientes também convirjam.
  useEffect(() => {
    if (!gameState || !isHost || gameState.hostId === myId) return;
    const next = { ...gameState, hostId: myId };
    setGameState(next);
    supabase.from("rooms").update({ state: next }).eq("id", roomId).then();
    channel.send({ type: "broadcast", event: "sync_state", payload: next });
  }, [gameState, isHost, myId, roomId, channel]);

  // ── Persist + broadcast ──────────────────────────────────────────────────
  const persistAndBroadcast = useCallback(
    (newState: GameState, delay = 0) => {
      supabase.from("rooms").update({ state: newState }).eq("id", roomId).then();
      if (delay > 0) {
        setTimeout(() => {
          channel.send({ type: "broadcast", event: "sync_state", payload: newState });
        }, delay);
      } else {
        channel.send({ type: "broadcast", event: "sync_state", payload: newState });
      }
    },
    [roomId, channel]
  );

  // ── Accept any authoritative state update ────────────────────────────────
  const applyState = useCallback((incoming: GameState) => {
    setGameState((prev) => {
      // Only apply if incoming is actually different (avoid unnecessary re-renders)
      if (JSON.stringify(prev) === JSON.stringify(incoming)) return prev;
      return incoming;
    });
  }, []);

  // ── Floating emoji (from sender's portrait to table center, then fades) ──
  const addFloatingEmoji = useCallback((emoji: string, fromPlayerId: string) => {
    const id = Math.random().toString();
    setEmojis((prev) => [...prev, { id, emoji, fromPlayerId }]);
    setTimeout(() => setEmojis((prev) => prev.filter((e) => e.id !== id)), 1800);
  }, []);

  // ── Host: apply action, save, broadcast ──────────────────────────────────
  const hostAction = useCallback(
    (action: (prev: GameState) => GameState, broadcastDelay = 0) => {
      if (!isHost) return;
      setGameState((prev) => {
        if (!prev) return prev;
        const next = action(prev);
        persistAndBroadcast(next, broadcastDelay);

        // Save match history on game over
        if (next.phase === "game_over" && prev.phase !== "game_over") {
          const sorted = [...next.players].sort((a, b) => a.score - b.score);
          supabase
            .from("match_history")
            .insert({
              room_id: roomId,
              winner_name: sorted[0].name,
              players_summary: sorted.map((p) => ({ name: p.name, score: p.score })),
            })
            .then();
        }
        return next;
      });
    },
    [isHost, persistAndBroadcast, roomId]
  );

  // ── Unified card play processor (Host Only) ──────────────────────────────
  const processCardPlay = useCallback((playerId: string, cardIndex: number) => {
    setGameState((prev) => {
      if (!prev || prev.phase !== "playing") return prev;
      const currentPlayer = prev.players[prev.currentPlayerIndex];
      if (currentPlayer.id !== playerId) return prev;

      const next = handlePlayCard(prev, playerId, cardIndex);

      // Trick-end animation: show cards briefly before they fly to winner
      const trickJustEnded =
        prev.tableCards.length === prev.players.length - 1 &&
        next.tableCards.length === 0;

      if (trickJustEnded && prev.vira) {
        const lastCard = prev.players
          .find((p) => p.id === playerId)
          ?.cards[cardIndex];
        if (lastCard) {
          const completedCards = [
            ...prev.tableCards,
            { playerId, card: lastCard },
          ];
          const winIdx = getWinningCardIndex(completedCards.map((tc) => tc.card), prev.vira);
          const winnerId = completedCards[winIdx]?.playerId;
          if (winnerId) {
            setTrickResult({ winnerId, cards: completedCards });
            setTimeout(() => setTrickResult(null), 1200);
          }
        }
      }

      // Persist and broadcast with appropriate delay
      const delay = next.phase === "round_end" ? 1500 : trickJustEnded ? 1200 : 0;
      supabase.from("rooms").update({ state: next }).eq("id", roomId).then();
      setTimeout(() => {
        channel.send({ type: "broadcast", event: "sync_state", payload: next });
      }, delay);

      // Save match history on game over
      if ((next as GameState).phase === "game_over" && String(prev.phase) !== "game_over") {
        const sorted = [...next.players].sort((a, b) => a.score - b.score);
        supabase.from("match_history").insert({
          room_id: roomId,
          winner_name: sorted[0].name,
          players_summary: sorted.map((p) => ({ name: p.name, score: p.score })),
        }).then();
      }

      // Auto-advance from round_end → next round. First LAST_TRICK_REVEAL_MS shows
      // the final trick as it was played, then the scoreboard for 3s, then advances.
      if (next.phase === "round_end") {
        setTimeout(() => {
          setGameState((cur) => {
            if (!cur || cur.phase !== "round_end") return cur;
            const advanced = startNextRound(cur);
            supabase.from("rooms").update({ state: advanced }).eq("id", roomId).then();
            channel.send({ type: "broadcast", event: "sync_state", payload: advanced });
            return advanced;
          });
        }, LAST_TRICK_REVEAL_MS + 3000);
      }

      return next;
    });
  }, [roomId, channel]);

  // ── Initialization ───────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Always fetch current state from DB on mount (works for host, guests, and page refreshes)
      const { data } = await supabase.from("rooms").select("state").eq("id", roomId).single();

      if (!mounted) return;

      if (data?.state) {
        // Resume existing game
        applyState(data.state as GameState);
        // Host re-broadcasts so any guests who just joined get state immediately
        if (isHost) {
          channel.send({ type: "broadcast", event: "sync_state", payload: data.state });
        }
      } else if (isHost) {
        // First run: create the game. Uses upsert (not update) because the room
        // row may not exist yet — e.g. someone joined via a hand-typed code that
        // was never created through "Criar Sala"; an update would silently match
        // zero rows and the game would never actually get persisted.
        const newState = startNextRound(createInitialState(initialPlayers));
        await supabase.from("rooms").upsert({ id: roomId, state: newState });
        if (!mounted) return;
        applyState(newState);
        channel.send({ type: "broadcast", event: "sync_state", payload: newState });
      }
    };

    init();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Channel listeners ────────────────────────────────────────────────────
  useEffect(() => {
    // All players (including host) accept sync_state
    channel.on("broadcast", { event: "sync_state" }, (res: any) => {
      applyState(res.payload as GameState);
    });

    channel.on("broadcast", { event: "emoji" }, (res: any) => {
      // Já foi adicionado otimisticamente na hora do clique, no meu próprio cliente.
      // (playerId === playerName nesse app: a chave de presença É o nome.)
      if (res.payload.fromPlayerId === playerName) return;
      addFloatingEmoji(res.payload.emoji, res.payload.fromPlayerId);
    });

    // Guest → host: bet relay
    channel.on("broadcast", { event: "player_bet" }, (res: any) => {
      if (!isHost) return;
      hostAction((prev) => handleBet(prev, res.payload.playerId, res.payload.bet));
    });

    // Guest → host: play card relay
    channel.on("broadcast", { event: "play_card" }, (res: any) => {
      if (!isHost) return;
      processCardPlay(res.payload.playerId, res.payload.cardIndex);
    });

    // Guest → host: shuffle relay (the dealer rotates every round and is often
    // NOT the host — host is who's allowed to write to the DB, dealer is a game
    // rule. Without this relay, a non-host dealer's shuffle click did nothing).
    channel.on("broadcast", { event: "player_shuffle" }, (res: any) => {
      if (!isHost) return;
      hostAction((prev) => handleShuffleAndDeal(prev, res.payload.playerId, res.payload.style));
    });

    // Anuncia pra mesa toda qual método de embaralhar foi escolhido (puramente
    // informativo — a lógica do jogo já trata todos os tipos exceto "lucas" como
    // um shuffle de verdade, isso aqui é só pra deixar público quem escolheu o quê).
    channel.on("broadcast", { event: "shuffle_announce" }, (res: any) => {
      setShuffleAnnouncement({ dealerName: res.payload.dealerName, label: res.payload.label });
      setTimeout(() => setShuffleAnnouncement((cur) => (cur?.dealerName === res.payload.dealerName ? null : cur)), 4000);
    });

    // Guest → host: voto para encerrar a partida antes da hora
    channel.on("broadcast", { event: "player_vote_end" }, (res: any) => {
      if (!isHost) return;
      hostAction((prev) => voteToEndMatch(prev, res.payload.playerId, countConnected(prev.players)));
    });

    // Periodic DB resync for guests (catch missed broadcasts)
    const resyncInterval = setInterval(async () => {
      if (isHost) return;
      const { data } = await supabase.from("rooms").select("state").eq("id", roomId).single();
      if (data?.state) applyState(data.state as GameState);
    }, 5000);

    return () => {
      clearInterval(resyncInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost]);

  // ── Disconnect detection: quem está no jogo mas sumiu da presença ao vivo ──
  const connectedIds = new Set(initialPlayers.map((p) => p.id));
  const missingPlayers = gameState ? gameState.players.filter((p) => !connectedIds.has(p.id)) : [];
  const missingKey = missingPlayers.map((p) => p.id).sort().join(",");

  useEffect(() => {
    if (missingKey) {
      setDisconnectTimer((prev) => prev ?? { startedAt: Date.now(), dismissed: false, paused: false, pausedAt: null, pausedMsTotal: 0 });
    } else {
      setDisconnectTimer(null);
    }
  }, [missingKey]);

  useEffect(() => {
    if (!disconnectTimer || disconnectTimer.dismissed) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [disconnectTimer]);

  const toggleDisconnectPause = () => {
    setDisconnectTimer((prev) => {
      if (!prev) return prev;
      if (prev.paused) {
        // Retoma: soma o tempo que passou pausado ao total já acumulado.
        return {
          ...prev,
          paused: false,
          pausedAt: null,
          pausedMsTotal: prev.pausedMsTotal + (Date.now() - (prev.pausedAt ?? Date.now())),
        };
      }
      return { ...prev, paused: true, pausedAt: Date.now() };
    });
  };

  const disconnectElapsedMs = disconnectTimer
    ? (disconnectTimer.paused ? (disconnectTimer.pausedAt ?? now) : now) - disconnectTimer.startedAt - disconnectTimer.pausedMsTotal
    : 0;
  const disconnectMsRemaining = disconnectTimer ? Math.max(0, DISCONNECT_WAIT_MS - disconnectElapsedMs) : 0;
  const showDisconnectOverlay =
    !!gameState &&
    missingPlayers.length > 0 &&
    !!disconnectTimer &&
    !disconnectTimer.dismissed &&
    disconnectMsRemaining > 0 &&
    ["shuffling", "betting", "playing"].includes(gameState.phase);

  // ── Guard: waiting for state ─────────────────────────────────────────────
  if (!gameState) {
    return (
      <div className="text-white flex flex-col items-center justify-center flex-1 gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full" />
        <span className="text-zinc-400">Carregando a mesa...</span>
      </div>
    );
  }

  // ── Round end scoreboard (shown 3s, then auto-advances) ──────────────────
  // Antes disso, gameState.phase já é "round_end" mas scoreboardReady ainda não
  // — nesse intervalo cai pro render principal, que mostra a última vaza parada
  // na mesa (ver LAST_TRICK_REVEAL_MS acima).
  if (gameState.phase === "round_end" && scoreboardReady) {
    const sorted = [...gameState.players].sort((a, b) => a.score - b.score);
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-white space-y-6">
        <motion.h2 initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
          className="text-4xl font-black text-yellow-400">
          🃏 FIM DO ROUND {gameState.currentRoundCards}
        </motion.h2>
        <p className="text-zinc-400 text-sm">Próximo round em 3 segundos...</p>
        <div className="bg-zinc-900/80 p-6 rounded-2xl border border-zinc-800 w-full max-w-md shadow-2xl space-y-3">
          <h3 className="text-lg font-bold text-zinc-300 text-center mb-4">PLACAR PARCIAL</h3>
          {sorted.map((p, idx) => {
            const acertou = p.bet !== null && p.bet === p.tricks;
            return (
              <motion.div key={p.id} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-black text-zinc-600">#{idx + 1}</span>
                  <div>
                    <div className="font-bold text-white">{p.name} {p.name === playerName ? "(Você)" : ""}</div>
                    <div className="text-xs text-zinc-500">
                      Apostou {p.bet} · Fez {p.tricks} · {acertou ? "✅ Acertou!" : `❌ Errou +${Math.abs((p.bet ?? 0) - p.tricks)}pts`}
                    </div>
                  </div>
                </div>
                <span className={`text-xl font-bold ${idx === 0 ? "text-green-400" : "text-red-400"}`}>
                  💀 {p.score}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Game over screen ─────────────────────────────────────────────────────
  if (gameState.phase === "game_over") {
    const sorted = [...gameState.players].sort((a, b) => a.score - b.score);
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-white space-y-8">
        <motion.h1 initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}
          className="text-5xl font-black text-red-500 mb-6">
          FIM DE JOGO
        </motion.h1>
        <div className="bg-zinc-900/80 p-8 rounded-2xl border border-zinc-800 w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-bold mb-6 text-center text-zinc-300">
            PLACAR FINAL (Menos Pontos Vence)
          </h2>
          <div className="space-y-4">
            {sorted.map((p, index) => (
              <motion.div key={p.id} initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className="flex justify-between items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black text-zinc-600">#{index + 1}</span>
                  <span className="text-xl font-bold">
                    {p.name} {p.name === playerName ? "(Você)" : ""}
                  </span>
                </div>
                <span className={`text-xl font-bold ${index === 0 ? "text-green-500" : "text-red-500"}`}>
                  {p.score} pts
                </span>
              </motion.div>
            ))}
          </div>
        </div>
        {isHost && (
          <Button
            onClick={() => {
              hostAction(() => startNextRound(createInitialState(initialPlayers)));
            }}
            className="w-full max-w-md h-14 text-lg font-bold bg-white text-black hover:bg-zinc-200">
            Começar Nova Partida
          </Button>
        )}
        <Button variant="secondary" onClick={() => router.push("/lobby")} className="w-full max-w-md">
          <LogOut className="w-4 h-4" /> Voltar ao Menu
        </Button>
      </div>
    );
  }


  // ── Derived state ────────────────────────────────────────────────────────
  const me = gameState.players.find((p) => p.name === playerName);
  const others = gameState.players.filter((p) => p.name !== playerName);
  // Com 4+ adversários encolhe mais os avatares/gap, pra caber mais gente por
  // linha e precisar de menos (ou nenhuma) quebra de linha — em mobile e desktop.
  const manyOpponents = others.length >= 4;
  const isBlindRound = gameState.currentRoundCards === 1;
  // Quórum da votação de encerrar: metade de quem está CONECTADO agora, não da mesa toda.
  // (usa a prop initialPlayers direto, não a ref — isso aqui é render, não callback assíncrono)
  const connectedIdsForQuorum = new Set(initialPlayers.map((p) => p.id));
  const endVoteQuorum = Math.ceil(gameState.players.filter((p) => connectedIdsForQuorum.has(p.id)).length / 2);
  const isMyTurn =
    gameState.phase === "playing" &&
    gameState.players[gameState.currentPlayerIndex]?.name === playerName;

  // Quem está ativo agora e o que essa pessoa está fazendo — cobre as 3 fases
  // com jogador da vez (embaralhar/apostar/jogar), pra dar um destaque igual
  // pra todo mundo (inclusive eu mesmo apostando, que antes não tinha marca).
  const activePlayerId =
    gameState.phase === "shuffling" ? gameState.players[gameState.dealerIndex]?.id
    : gameState.phase === "betting" || gameState.phase === "playing" ? gameState.players[gameState.currentPlayerIndex]?.id
    : null;
  const activeActionLabel =
    gameState.phase === "shuffling" ? "🔀 Embaralhando"
    : gameState.phase === "betting" ? "💭 Apostando"
    : gameState.phase === "playing" ? "🎯 Escolhendo carta"
    : null;
  const isMeActive = !!me && activePlayerId === me.id;

  let winningTableCardIndex = -1;
  if (gameState.tableCards.length > 0 && gameState.vira) {
    winningTableCardIndex = getWinningCardIndex(
      gameState.tableCards.map((tc) => tc.card),
      gameState.vira
    );
  }

  // Regra do "fechamento": quem faz a última aposta da rodada não pode deixar
  // a soma das apostas igual à quantidade de cartas — um valor fica bloqueado.
  const isClosingBet = gameState.players.filter((p) => p.bet === null).length === 1;
  const forbiddenBet =
    gameState.phase === "betting" && isClosingBet
      ? gameState.currentRoundCards -
        gameState.players.reduce((sum, p) => sum + (p.bet ?? 0), 0)
      : null;

  // ── Action helpers ────────────────────────────────────────────────────────
  const sendBet = (bet: number) => {
    if (isHost) {
      hostAction((prev) => handleBet(prev, me!.id, bet));
    } else {
      channel.send({ type: "broadcast", event: "player_bet", payload: { playerId: me!.id, bet } });
    }
  };

  const sendPlayCard = (cardIndex: number) => {
    if (!isMyTurn) return;
    if (isHost) {
      processCardPlay(me!.id, cardIndex);
    } else {
      channel.send({ type: "broadcast", event: "play_card", payload: { playerId: me!.id, cardIndex } });
    }
  };

  const sendEmoji = (emoji: string) => {
    if (!me) return;
    addFloatingEmoji(emoji, me.id); // otimista: aparece pra mim na hora, sem esperar o broadcast
    channel.send({ type: "broadcast", event: "emoji", payload: { emoji, fromPlayerId: me.id } });
  };

  const sendEndVote = () => {
    if (!me) return;
    if (isHost) {
      hostAction((prev) => voteToEndMatch(prev, me.id, countConnected(prev.players)));
    } else {
      channel.send({ type: "broadcast", event: "player_vote_end", payload: { playerId: me.id } });
    }
  };

  const handleLeaveConfirmed = () => {
    router.push("/lobby");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <LayoutGroup>
      {/* min-h (não h fixo) + overflow-x só: com 4+ jogadores os oponentes podem
          quebrar em mais de uma linha — deixa a página crescer/rolar em vez de
          cortar conteúdo, mas nunca estoura a largura pros lados. */}
      <div className="flex flex-col flex-1 justify-between relative overflow-x-hidden">

        {/* ── FLOATING EMOJIS: fly from whoever sent it, in to the table center ── */}
        {/* z-[60]: acima do popup do emoji picker (z-50), senão fica escondido atrás dele */}
        <div className="absolute inset-0 pointer-events-none z-[60] overflow-hidden">
          {emojis.map((e) => {
            const senderIsMe = e.fromPlayerId === me?.id;
            const senderIndex = others.findIndex((p) => p.id === e.fromPlayerId);
            const startLeft = senderIsMe
              ? 50
              : senderIndex === -1
              ? 50
              : others.length > 1
              ? 15 + (senderIndex / (others.length - 1)) * 70
              : 50;
            const startTop = senderIsMe ? 92 : 10;
            return (
              <motion.div key={e.id}
                initial={{ left: `${startLeft}%`, top: `${startTop}%`, opacity: 1, scale: 0.6, x: "-50%", y: "-50%" }}
                animate={{ left: "50%", top: "50%", opacity: 0, scale: 1.8 }}
                transition={{ duration: 1.6, ease: "easeIn" }}
                className="absolute text-4xl">
                {e.emoji}
              </motion.div>
            );
          })}
        </div>

        {/* ── TOOLBAR: voltar ao menu + votar para encerrar ── */}
        {/* No mobile fica numa 2ª linha, embaixo do seletor de tema (que ocupa o
            canto direito inteiro) — em telas largas os dois cabem lado a lado. */}
        <div className="absolute top-9 left-1 sm:top-2 sm:left-2 z-30 flex items-center gap-1 sm:gap-2 max-w-[70vw] sm:max-w-none">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="flex items-center gap-1 sm:gap-1.5 bg-black/50 hover:bg-black/70 border border-white/10 text-zinc-300 hover:text-white text-[10px] sm:text-xs font-bold px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl backdrop-blur-sm transition-all shrink-0">
            <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Menu
          </button>
          <button
            onClick={sendEndVote}
            disabled={!!me && !!gameState.endVote?.votes.includes(me.id)}
            className="flex items-center gap-1 sm:gap-1.5 bg-black/50 hover:bg-red-900/40 border border-white/10 hover:border-red-500/50 text-zinc-300 hover:text-white text-[10px] sm:text-xs font-bold px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl backdrop-blur-sm transition-all disabled:opacity-60 disabled:cursor-default min-w-0 truncate">
            <Flag className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="truncate">
              {gameState.endVote
                ? `Encerrar (${gameState.endVote.votes.length}/${endVoteQuorum})`
                : "Votar p/ Encerrar"}
            </span>
          </button>
        </div>

        {/* ── Leave confirmation modal ── */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
                <h3 className="text-white font-bold text-lg">Voltar ao menu principal?</h3>
                <p className="text-zinc-400 text-sm">Você vai sair da partida em andamento. Os outros jogadores continuam a mesa sem você.</p>
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setShowLeaveConfirm(false)}>Cancelar</Button>
                  <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handleLeaveConfirmed}>Sair</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Shuffle method announcement (público pra mesa toda) ── */}
        <AnimatePresence>
          {shuffleAnnouncement && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-black/60 border border-yellow-500/40 text-yellow-200 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm whitespace-nowrap">
              {shuffleAnnouncement.dealerName} embaralhou com {shuffleAnnouncement.label}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Disconnect wait overlay ── */}
        <AnimatePresence>
          {showDisconnectOverlay && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
                <WifiOff className="w-10 h-10 text-red-400 mx-auto" />
                <h3 className="text-white font-bold text-lg">
                  {missingPlayers.map((p) => p.name).join(", ")} desconectou{missingPlayers.length > 1 ? "ram" : ""}
                </h3>
                <p className="text-zinc-400 text-sm">
                  {disconnectTimer?.paused ? "Contagem pausada" : "Aguardando reconexão..."}
                </p>
                <div className={`text-3xl font-black tabular-nums ${disconnectTimer?.paused ? "text-zinc-500" : "text-red-400"}`}>
                  {String(Math.floor(disconnectMsRemaining / 60000)).padStart(2, "0")}:
                  {String(Math.floor((disconnectMsRemaining % 60000) / 1000)).padStart(2, "0")}
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="secondary" onClick={toggleDisconnectPause}>
                    {disconnectTimer?.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    {disconnectTimer?.paused ? "Retomar contagem" : "Pausar contagem"}
                  </Button>
                  <Button variant="secondary" onClick={sendEndVote}
                    disabled={!!me && !!gameState.endVote?.votes.includes(me.id)}>
                    <Flag className="w-4 h-4" />
                    {gameState.endVote
                      ? `Votar p/ encerrar (${gameState.endVote.votes.length}/${endVoteQuorum})`
                      : "Votar para encerrar a partida"}
                  </Button>
                  {isHost && (
                    <Button className="bg-yellow-600 hover:bg-yellow-700 text-white"
                      onClick={() => setDisconnectTimer((prev) => prev ? { ...prev, dismissed: true } : prev)}>
                      Continuar mesmo assim
                    </Button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── OPPONENTS ── */}
        <div className={`flex justify-center flex-wrap px-1 pt-16 sm:pt-2 ${manyOpponents ? "gap-1 sm:gap-3" : "gap-2 sm:gap-8"}`}>
          {others.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1 sm:gap-2">
              {/* Won-cards piles */}
              {p.wonCards && p.wonCards.length > 0 && (
                <div className="hidden sm:flex gap-1">
                  {p.wonCards.map((trick, trickIdx) => (
                    <motion.div key={trickIdx} initial={{ scale: 0, y: -20 }}
                      animate={{ scale: 0.45, y: 0 }} className="relative w-24 h-36 origin-top-left">
                      {trick.map((c, cIdx) => (
                        <div key={cIdx} className="absolute top-0 left-0"
                          style={{ transform: `rotate(${(cIdx - trick.length / 2) * 6}deg)`, zIndex: cIdx }}>
                          <PlayingCard card={c} theme={theme} />
                        </div>
                      ))}
                    </motion.div>
                  ))}
                </div>
              )}

              {activePlayerId === p.id && <ActiveArrow direction="down" />}

              {/* Avatar — w-fit com min-w: cresce se o conteúdo (badge "APOSTANDO"
                  etc.) não couber no tamanho padrão, em vez de cortar/estourar. */}
              <div className={`bg-zinc-900 border rounded-lg sm:rounded-xl p-1.5 sm:p-3 text-center shadow-lg transition-all w-fit max-w-[40vw] sm:max-w-none ${manyOpponents ? "min-w-16 sm:min-w-24" : "min-w-20 sm:min-w-32"} ${
                activePlayerId === p.id
                  ? "border-yellow-400 shadow-yellow-400/30"
                  : "border-zinc-800"
              }`}>
                <div className="font-bold text-white text-[11px] sm:text-sm whitespace-nowrap">{p.name}</div>
                {activePlayerId === p.id && activeActionLabel && (
                  <div className="flex justify-center"><ActiveBadge label={activeActionLabel} /></div>
                )}
                <div className="text-red-400 text-[10px] sm:text-xs font-bold">💀 {p.score} pts</div>
                <div className="text-zinc-500 text-[10px] sm:text-xs">Aposta: {p.bet !== null ? p.bet : "?"}</div>
                <div className="text-zinc-400 text-[10px] sm:text-xs">✅ {p.tricks}/{p.bet ?? "?"}</div>
                {isBlindRound && p.cards.length > 0 ? (
                  <div className="mt-1 sm:mt-2 flex justify-center scale-75 sm:scale-75 origin-top">
                    {/* Rodada cega: você vê a carta dos outros, só não a sua */}
                    <PlayingCard card={p.cards[0]} theme={theme} />
                  </div>
                ) : (
                  <div className="text-zinc-500 text-[10px] sm:text-xs mt-1">🃏 {p.cards.length} cartas</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── TABLE CENTER ── */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Vira card */}
          {gameState.vira && (
            <div className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
              <span className="text-zinc-400 font-bold mb-1 uppercase tracking-widest text-[10px] sm:text-xs">Vira</span>
              <PlayingCard card={gameState.vira} theme={theme} />
            </div>
          )}

          {/* Shuffle phase */}
          {gameState.phase === "shuffling" && (
            <ShufflePanel
              isDealer={gameState.players[gameState.dealerIndex]?.name === playerName}
              dealerName={gameState.players[gameState.dealerIndex]?.name ?? ""}
              onShuffle={(type) => {
                if (!me) return;
                const style: ShuffleStyle = type === "lucas" ? "lucas_supreme" : "random";
                // Torna público pra mesa toda qual método foi escolhido (só informativo).
                const announcePayload = { dealerName: me.name, label: SHUFFLE_TYPE_LABELS[type] ?? type };
                setShuffleAnnouncement(announcePayload);
                setTimeout(() => setShuffleAnnouncement((cur) => (cur?.dealerName === announcePayload.dealerName ? null : cur)), 4000);
                channel.send({ type: "broadcast", event: "shuffle_announce", payload: announcePayload });
                if (isHost) {
                  hostAction((prev) => handleShuffleAndDeal(prev, me.id, style));
                } else {
                  channel.send({ type: "broadcast", event: "player_shuffle", payload: { playerId: me.id, style } });
                }
              }}
            />
          )}

          {/* Última vaza da rodada, parada na mesa antes do placar aparecer */}
          {gameState.phase === "round_end" && !scoreboardReady && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 text-yellow-300 text-xs font-bold uppercase tracking-wide whitespace-nowrap">
              Última jogada da rodada
            </motion.div>
          )}

          {/* Table cards (current trick) */}
          <div
            className="relative flex items-center justify-center w-44 h-44 sm:w-72 sm:h-72 rounded-full border-2 border-dashed border-zinc-700/50 bg-cover bg-center overflow-hidden"
            style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${TABLE_BG[theme] ?? TABLE_BG.aquarium})` }}
          >
            {gameState.tableCards.length === 0 && gameState.phase !== "shuffling" && (
              <span className="text-zinc-600 font-bold opacity-50 text-sm">MESA VAZIA</span>
            )}

            {gameState.tableCards.map((tc, idx) => {
              const isWinning = idx === winningTableCardIndex;
              return (
                <motion.div
                  key={`table-${roundKey}-${tc.playerId}`}
                  layoutId={`card-${roundKey}-${tc.card.suit}-${tc.card.value}`}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{
                    opacity: 1,
                    scale: isWinning ? 1.12 : 1,
                    y: isWinning ? -14 : 0,
                    x: (idx - (gameState.tableCards.length - 1) / 2) * (typeof window !== "undefined" && window.innerWidth < 640 ? 20 : 30),
                    rotate: (idx - 1) * 7,
                    zIndex: isWinning ? 50 : idx,
                  }}
                  transition={{ type: "spring", stiffness: 250, damping: 22 }}
                  className="absolute">
                  <PlayingCard card={tc.card} theme={theme} />
                  {isWinning && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-yellow-400 font-bold whitespace-nowrap">
                      ⭐ ganhando
                    </motion.div>
                  )}
                </motion.div>
              );
            })}

            {/* Trick flyout animation */}
            <AnimatePresence>
              {trickResult && (
                <motion.div key="trick-flyout" initial={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.1, y: trickResult.winnerId === me?.id ? 200 : -200 }}
                  transition={{ duration: 0.8, ease: "easeIn" }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {trickResult.cards.map((tc, idx) => (
                    <div key={idx} className="absolute" style={{ transform: `rotate(${idx * 12}deg)` }}>
                      <PlayingCard card={tc.card} theme={theme} />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── MY AREA ── */}
        {me && (
          <div className="flex flex-col items-center gap-1 sm:gap-2 pb-1 sm:pb-2">
            {/* Bet prompt */}
            {gameState.phase === "betting" &&
              gameState.players[gameState.currentPlayerIndex]?.name === playerName && (
                <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  className="bg-red-900/40 border border-red-500 p-2 sm:p-4 rounded-xl text-center space-y-2 sm:space-y-3 shadow-[0_0_30px_rgba(220,38,38,0.2)] mx-2">
                  <h3 className="text-white font-bold text-sm sm:text-lg">Sua vez! Quantas você faz?</h3>
                  {forbiddenBet !== null && forbiddenBet >= 0 && forbiddenBet <= me.cards.length && (
                    <p className="text-red-300 text-[10px] sm:text-xs">Você não pode fechar a rodada apostando {forbiddenBet}</p>
                  )}
                  <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center">
                    {Array.from({ length: me.cards.length + 1 }).map((_, i) => (
                      <Button key={i} onClick={() => sendBet(i)} variant="secondary" disabled={i === forbiddenBet}
                        className="w-8 h-8 sm:w-10 sm:h-10 text-sm sm:text-base font-bold disabled:opacity-30 disabled:cursor-not-allowed">{i}</Button>
                    ))}
                  </div>
                </motion.div>
              )}

            <div className="flex items-end gap-1 sm:gap-4 w-full justify-center px-1 sm:px-4">
              {/* Won-cards pile */}
              <div className="hidden sm:flex gap-1 items-end min-w-[60px]">
                <AnimatePresence>
                  {me.wonCards && me.wonCards.map((trick, trickIdx) => (
                    <motion.div key={trickIdx} initial={{ scale: 0, y: 20 }} animate={{ scale: 0.5, y: 0 }}
                      exit={{ scale: 0 }} className="relative w-24 h-36 origin-bottom-left">
                      {trick.map((c, cIdx) => (
                        <div key={cIdx} className="absolute bottom-0 left-0"
                          style={{ transform: `rotate(${(cIdx - trick.length / 2) * 6}deg)`, zIndex: cIdx }}>
                          <PlayingCard card={c} theme={theme} />
                        </div>
                      ))}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* My avatar */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                {isMeActive && <ActiveArrow direction="down" />}
                <div className={`bg-zinc-900 p-1.5 sm:p-3 rounded-t-lg sm:rounded-t-xl border-t border-l border-r w-fit min-w-24 sm:min-w-44 max-w-[55vw] sm:max-w-none text-center relative z-20 transition-all ${
                  isMeActive ? "border-yellow-400 shadow-yellow-400/20 shadow-lg" : "border-zinc-800"
                }`}>
                  {/* Emoji picker */}
                  <div className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4">
                    <Popover>
                      <PopoverTrigger className="rounded-full w-7 h-7 sm:w-9 sm:h-9 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white shadow-lg flex items-center justify-center">
                        <SmilePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2 bg-zinc-900 border-zinc-800 flex gap-2" side="top">
                        {["😂", "🤡", "😡", "💀", "🍻", "🔥"].map((emoji) => (
                          <button key={emoji}
                            onClick={() => sendEmoji(emoji)}
                            className="text-2xl hover:scale-125 transition-transform">
                            {emoji}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="text-[11px] sm:text-base font-bold text-white whitespace-nowrap">
                    {me.name}
                  </div>
                  {isMeActive && activeActionLabel && (
                    <div className="flex justify-center"><ActiveBadge label={activeActionLabel} /></div>
                  )}
                  <div className="text-red-400 font-bold text-[10px] sm:text-sm">💀 {me.score} pts</div>
                  <div className="text-zinc-400 text-[10px] sm:text-xs">Vazas: {me.tricks} / {me.bet !== null ? me.bet : "?"}</div>
                </div>
              </div>

              {/* Hand cards — layoutId enables card-fly-to-table animation */}
              <div className="flex -space-x-4 sm:-space-x-6 z-30 relative">
                {me.cards.map((c, i) => (
                  <motion.div
                    key={`hand-${roundKey}-${c.suit}-${c.value}`}
                    layoutId={`card-${roundKey}-${c.suit}-${c.value}`}
                    whileHover={isMyTurn ? { y: -24, scale: 1.05, zIndex: 50 } : {}}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    onClick={() => sendPlayCard(i)}
                    className={`relative ${isMyTurn ? "cursor-pointer hover:shadow-2xl hover:shadow-yellow-400/30" : "cursor-not-allowed opacity-80"}`}>
                    <PlayingCard card={c} hidden={isBlindRound} theme={theme} backIndex={i} />
                    {isMyTurn && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full" />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE-PLAYER BADGE — small pulsing label showing what the active player is
// doing right now (embaralhando / apostando / escolhendo carta).
// ─────────────────────────────────────────────────────────────────────────────
function ActiveBadge({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: [0.75, 1, 0.75], y: 0 }}
      transition={{ opacity: { repeat: Infinity, duration: 1.4 }, y: { duration: 0.2 } }}
      className="mt-1 inline-flex items-center gap-1 bg-yellow-400/15 border border-yellow-400/50 text-yellow-300 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap">
      {label}
    </motion.div>
  );
}

// Seta que aponta pro portrait de quem está ativo — "direction" é de onde a
// seta aponta: "down" fica em cima do avatar (oponentes), "up" fica embaixo
// (minha área, que já está na parte de baixo da tela).
function ActiveArrow({ direction }: { direction: "down" | "up" }) {
  const Icon = direction === "down" ? ChevronDown : ChevronUp;
  return (
    <motion.div
      animate={{ y: direction === "down" ? [0, 6, 0] : [0, -6, 0] }}
      transition={{ repeat: Infinity, duration: 0.8 }}
      className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
      <Icon className="w-9 h-9 sm:w-11 sm:h-11" strokeWidth={3} />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHUFFLE PANEL
// ─────────────────────────────────────────────────────────────────────────────
type ShuffleType = "cut" | "riffle" | "overhand" | "lucas";

function ShufflePanel({
  isDealer,
  dealerName,
  onShuffle,
}: {
  isDealer: boolean;
  dealerName: string;
  onShuffle: (t: ShuffleType) => void;
}) {
  const [preview, setPreview] = useState<ShuffleType | null>(null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="absolute inset-0 flex items-center justify-center flex-col z-50 bg-black/70 rounded-full backdrop-blur-md gap-4 px-4">
      {isDealer ? (
        <>
          <span className="text-white font-black text-sm sm:text-lg text-center px-2">Sua vez de embaralhar!</span>
          <span className="text-zinc-400 text-xs sm:text-sm text-center px-2">Escolha como quer embaralhar:</span>
          <div className="flex gap-1.5 sm:gap-3 flex-wrap justify-center px-2">
            {[
              { type: "cut" as ShuffleType, label: "✂️ Cortar", desc: "Divide ao meio" },
              { type: "riffle" as ShuffleType, label: "🎴 Riffle", desc: "Entrelaçar" },
              { type: "overhand" as ShuffleType, label: "🤌 Pilha", desc: "Mover por cima" },
              { type: "lucas" as ShuffleType, label: "👑 Supremo do Lucas", desc: "Não embaralha nada" },
            ].map(({ type, label, desc }) => (
              <motion.button key={type} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                onHoverStart={() => setPreview(type)} onHoverEnd={() => setPreview(null)}
                onClick={() => onShuffle(type)}
                className={`flex flex-col items-center gap-0.5 sm:gap-1 bg-zinc-900 border px-2.5 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl transition-all text-white w-[76px] sm:w-auto ${
                  type === "lucas"
                    ? "border-yellow-600 hover:border-yellow-400 hover:bg-yellow-900/20"
                    : "border-zinc-700 hover:border-red-500 hover:bg-red-900/20"
                }`}>
                <span className="text-lg sm:text-2xl">{label.split(" ")[0]}</span>
                <span className="font-bold text-[10px] sm:text-sm text-center leading-tight">{label.split(" ").slice(1).join(" ")}</span>
                <span className="text-zinc-500 text-[9px] sm:text-xs hidden sm:block">{desc}</span>
              </motion.button>
            ))}
          </div>
          <div className="hidden sm:block">
            <AnimatePresence mode="wait">
              {preview && <DeckAnimation type={preview} key={preview} />}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-5xl">🃏</motion.div>
          <span className="text-white font-bold text-center">{dealerName} está embaralhando...</span>
        </div>
      )}
    </motion.div>
  );
}

function DeckAnimation({ type }: { type: ShuffleType }) {
  const cards = [0, 1, 2, 3, 4];
  if (type === "cut") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex gap-8 h-20 items-end">
        {[cards.slice(0, 3), cards.slice(3)].map((half, hi) => (
          <motion.div key={hi} className="relative flex"
            animate={{ x: hi === 0 ? -10 : 10 }} transition={{ type: "spring", stiffness: 200 }}>
            {half.map((_, i) => (
              <div key={i} className="w-8 h-12 bg-gradient-to-br from-red-700 to-red-900 border border-red-500 rounded-sm shadow absolute"
                style={{ bottom: i * 2, left: i * 0.5 }} />
            ))}
          </motion.div>
        ))}
      </motion.div>
    );
  }
  if (type === "riffle") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="relative flex h-20 items-end w-32 justify-center">
        {cards.map((_, i) => (
          <motion.div key={i}
            className="absolute w-8 h-12 bg-gradient-to-br from-red-700 to-red-900 border border-red-500 rounded-sm shadow"
            animate={{ rotate: [0, i % 2 === 0 ? 20 : -20, 0], x: [0, i % 2 === 0 ? -12 : 12, 0] }}
            transition={{ duration: 0.8, delay: i * 0.05, repeat: Infinity, repeatDelay: 0.5 }}
            style={{ bottom: i * 2 }} />
        ))}
      </motion.div>
    );
  }
  if (type === "lucas") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="relative flex flex-col items-center h-20 justify-end w-32">
        <motion.span className="text-2xl mb-1"
          animate={{ y: [0, -6, 0], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1, repeat: Infinity }}>
          👑
        </motion.span>
        <div className="relative w-8 h-12">
          {cards.map((_, i) => (
            <div key={i}
              className="absolute w-8 h-12 bg-gradient-to-br from-yellow-600 to-yellow-800 border border-yellow-400 rounded-sm shadow"
              style={{ bottom: i * 1.5, left: i * 1.5 }} />
          ))}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="relative flex h-20 items-end w-32 justify-center">
      {cards.map((_, i) => (
        <motion.div key={i}
          className="absolute w-8 h-12 bg-gradient-to-br from-red-700 to-red-900 border border-red-500 rounded-sm shadow"
          animate={{ y: [0, -20, 0], x: [0, 8, 0] }}
          transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 0.6 }}
          style={{ bottom: i * 2, left: i * 2 }} />
      ))}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYING CARD
// ─────────────────────────────────────────────────────────────────────────────
// Cada tema pode ter mais de uma imagem de verso — a carta N da mão usa
// images[N % images.length], ou seja, alterna: 1ª carta pega a 1ª imagem, 2ª
// carta pega a 2ª, e assim por diante, repetindo do início quando acabam.
const CARD_BACKS: Record<string, string[]> = {
  candy: ["/themes/card_back_candy.jpg"],
  adventure: ["/themes/card_back_adventure.jpg"],
  pedro: ["/themes/card_back_pedro.png"],
  aquarium: ["/themes/card_back_aquarium.jpg"],
  lotr: ["/themes/card_back_lotr.jpg"],
  mpb: ["/themes/card_back_mpb.jpg"],
  lgbt: ["/themes/card_back_lgbt.jpg"],
  olivia: ["/themes/card_back_olivia_1.png", "/themes/card_back_olivia_2.png", "/themes/card_back_olivia_3.jpg"],
  gatos: ["/themes/card_back_gatos_1.jpg", "/themes/card_back_gatos_2.jpg"],
  mamadores: ["/themes/card_back_mamadores_1.jpg", "/themes/card_back_mamadores_2.jpg"],
  jessie: ["/themes/card_back_jessie_1.jpg"],
};

// Fundo da mesa (a "vaza"), mesma imagem de fundo do tema — só recortada em círculo.
const TABLE_BG: Record<string, string> = {
  candy: "/themes/bg_candy.jpg",
  adventure: "/themes/bg_adventure.jpg",
  pedro: "/themes/bg_pedro.jpg",
  aquarium: "/themes/bg_aquarium.jpg",
  lotr: "/themes/bg_lotr.jpg",
  mpb: "/themes/bg_mpb.jpg",
  lgbt: "/themes/bg_lgbt.jpg",
  olivia: "/themes/bg_olivia.png",
  gatos: "/themes/bg_gatos.jpg",
  mamadores: "/themes/bg_mamadores.jpg",
  jessie: "/themes/bg_jessie.jpg",
};

const CARD_BORDERS: Record<string, [string, string]> = {
  aquarium: ["border-red-400", "border-cyan-400"],
  candy: ["border-pink-400", "border-purple-400"],
  adventure: ["border-orange-400", "border-green-500"],
  pedro: ["border-yellow-400", "border-zinc-400"],
  lotr: ["border-amber-500", "border-stone-400"],
  mpb: ["border-orange-600", "border-teal-600"],
  lgbt: ["border-rose-500", "border-indigo-500"],
  olivia: ["border-orange-400", "border-amber-700"],
  gatos: ["border-purple-400", "border-slate-500"],
  mamadores: ["border-red-400", "border-yellow-500"],
  jessie: ["border-rose-400", "border-pink-600"],
};

function PlayingCard({
  card,
  hidden = false,
  theme = "aquarium",
  backIndex = 0,
}: {
  card: GameCard;
  hidden?: boolean;
  theme?: string;
  // Posição da carta na mão (0 = 1ª carta) — decide qual verso mostrar, quando
  // o tema tem mais de uma imagem de verso (ver CARD_BACKS acima).
  backIndex?: number;
}) {
  if (hidden) {
    const backs = CARD_BACKS[theme] ?? CARD_BACKS.aquarium;
    const back = backs[backIndex % backs.length];
    return (
      <div
        className="w-12 h-16 sm:w-20 sm:h-28 rounded-lg sm:rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.6)] border-2 border-white/20 bg-cover bg-center overflow-hidden select-none"
        style={{ backgroundImage: `url(${back})` }}
      />
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const Icon = { hearts: Heart, spades: Spade, diamonds: Diamond, clubs: Club }[card.suit];
  const [redBorder, blackBorder] = CARD_BORDERS[theme] ?? CARD_BORDERS.aquarium;

  return (
    <div
      className={`w-12 h-16 sm:w-20 sm:h-28 bg-white/96 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.5)] flex flex-col justify-between p-1 sm:p-1.5 border-2 ${isRed ? redBorder : blackBorder} ${isRed ? "text-red-600" : "text-zinc-900"} select-none`}>
      <div className="text-[10px] sm:text-base font-bold leading-none">{card.value}</div>
      <div className="flex-1 flex items-center justify-center">
        <Icon className="w-4 h-4 sm:w-8 sm:h-8 fill-current" />
      </div>
      <div className="text-[10px] sm:text-base font-bold leading-none rotate-180">{card.value}</div>
    </div>
  );
}
