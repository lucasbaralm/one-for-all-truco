"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  GameState,
  createInitialState,
  startNextRound,
  handleBet,
  handlePlayCard,
  handleShuffleAndDeal,
  ShuffleStyle,
} from "@/lib/game/state-machine";
import { PlayerPresence } from "./RoomManager";
import { Card as GameCard, getWinningCardIndex } from "@/lib/game/rules";
import { resolveHostId } from "@/lib/game/host";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Spade, Heart, Club, Diamond, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [emojis, setEmojis] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [trickResult, setTrickResult] = useState<TrickResult | null>(null);
  const { theme } = useTheme();

  // Unique key per round so layoutId doesn't conflict across rounds
  const roundKey = gameState?.currentRoundCards ?? 0;

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

      // Auto-advance from round_end → next round after showing scoreboard
      if (next.phase === "round_end") {
        setTimeout(() => {
          setGameState((cur) => {
            if (!cur || cur.phase !== "round_end") return cur;
            const advanced = startNextRound(cur);
            supabase.from("rooms").update({ state: advanced }).eq("id", roomId).then();
            channel.send({ type: "broadcast", event: "sync_state", payload: advanced });
            return advanced;
          });
        }, 3000); // Show scoreboard for 3 seconds
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
      const id = Math.random().toString();
      const x = Math.random() * 80 + 10;
      setEmojis((prev) => [...prev, { id, emoji: res.payload.emoji, x }]);
      setTimeout(() => setEmojis((prev) => prev.filter((e) => e.id !== id)), 3000);
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

  // ── Guard: waiting for state ─────────────────────────────────────────────
  if (!gameState) {
    return (
      <div className="text-white flex flex-col items-center justify-center h-[90vh] gap-4">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full" />
        <span className="text-zinc-400">Carregando a mesa...</span>
      </div>
    );
  }

  // ── Round end scoreboard (shown 3s, then auto-advances) ──────────────────
  if (gameState.phase === "round_end") {
    const sorted = [...gameState.players].sort((a, b) => a.score - b.score);
    return (
      <div className="flex flex-col items-center justify-center h-[90vh] text-white space-y-6">
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
      <div className="flex flex-col items-center justify-center h-[90vh] text-white space-y-8">
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
      </div>
    );
  }


  // ── Derived state ────────────────────────────────────────────────────────
  const me = gameState.players.find((p) => p.name === playerName);
  const others = gameState.players.filter((p) => p.name !== playerName);
  const isBlindRound = gameState.currentRoundCards === 1;
  const isMyTurn =
    gameState.phase === "playing" &&
    gameState.players[gameState.currentPlayerIndex]?.name === playerName;

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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <LayoutGroup>
      <div className="flex flex-col h-[90vh] justify-between relative overflow-hidden">

        {/* ── OPPONENTS ── */}
        <div className="flex justify-center gap-8 pt-2 flex-wrap">
          {others.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-2">
              {/* Won-cards piles */}
              {p.wonCards && p.wonCards.length > 0 && (
                <div className="flex gap-1">
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

              {/* Avatar */}
              <div className={`bg-zinc-900 border rounded-xl p-3 text-center w-32 shadow-lg transition-all ${
                gameState.players[gameState.currentPlayerIndex]?.id === p.id
                  ? "border-yellow-400 shadow-yellow-400/30"
                  : "border-zinc-800"
              }`}>
                <div className="font-bold text-white truncate text-sm">{p.name}</div>
                <div className="text-red-400 text-xs font-bold">💀 {p.score} pts</div>
                <div className="text-zinc-500 text-xs">Aposta: {p.bet !== null ? p.bet : "?"}</div>
                <div className="text-zinc-400 text-xs">✅ {p.tricks}/{p.bet ?? "?"}</div>
                {isBlindRound && p.cards.length > 0 ? (
                  <div className="mt-2 flex justify-center scale-75 origin-top">
                    {/* Rodada cega: você vê a carta dos outros, só não a sua */}
                    <PlayingCard card={p.cards[0]} theme={theme} />
                  </div>
                ) : (
                  <div className="text-zinc-500 text-xs mt-1">🃏 {p.cards.length} cartas</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── TABLE CENTER ── */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Vira card */}
          {gameState.vira && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
              <span className="text-zinc-400 font-bold mb-1 uppercase tracking-widest text-xs">Vira</span>
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
                if (isHost) {
                  hostAction((prev) => handleShuffleAndDeal(prev, me.id, style));
                } else {
                  channel.send({ type: "broadcast", event: "player_shuffle", payload: { playerId: me.id, style } });
                }
              }}
            />
          )}

          {/* Table cards (current trick) */}
          <div className="relative flex items-center justify-center w-72 h-72 rounded-full border-2 border-dashed border-zinc-700/50">
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
                    x: (idx - (gameState.tableCards.length - 1) / 2) * 30,
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
          <div className="flex flex-col items-center gap-2 pb-2">
            {/* Bet prompt */}
            {gameState.phase === "betting" &&
              gameState.players[gameState.currentPlayerIndex]?.name === playerName && (
                <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  className="bg-red-900/40 border border-red-500 p-4 rounded-xl text-center space-y-3 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                  <h3 className="text-white font-bold text-lg">Sua vez! Quantas você faz?</h3>
                  {forbiddenBet !== null && forbiddenBet >= 0 && forbiddenBet <= me.cards.length && (
                    <p className="text-red-300 text-xs">Você não pode fechar a rodada apostando {forbiddenBet}</p>
                  )}
                  <div className="flex gap-2 flex-wrap justify-center">
                    {Array.from({ length: me.cards.length + 1 }).map((_, i) => (
                      <Button key={i} onClick={() => sendBet(i)} variant="secondary" disabled={i === forbiddenBet}
                        className="w-10 h-10 font-bold disabled:opacity-30 disabled:cursor-not-allowed">{i}</Button>
                    ))}
                  </div>
                </motion.div>
              )}

            <div className="flex items-end gap-4 w-full justify-center px-4">
              {/* Won-cards pile */}
              <div className="flex gap-1 items-end min-w-[60px]">
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
              <div className={`bg-zinc-900 p-3 rounded-t-xl border-t border-l border-r w-44 text-center relative z-20 transition-all ${
                isMyTurn ? "border-yellow-400 shadow-yellow-400/20 shadow-lg" : "border-zinc-800"
              }`}>
                {/* Floating emojis */}
                {emojis.map((e) => (
                  <motion.div key={e.id} initial={{ y: 0, opacity: 1, scale: 0.5 }}
                    animate={{ y: -200, opacity: 0, scale: 2 }} transition={{ duration: 2, ease: "easeOut" }}
                    className="absolute pointer-events-none text-4xl z-50"
                    style={{ left: `${e.x}%`, bottom: "100%" }}>
                    {e.emoji}
                  </motion.div>
                ))}

                {/* Emoji picker */}
                <div className="absolute -top-4 -right-4">
                  <Popover>
                    <PopoverTrigger className="rounded-full w-9 h-9 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-white shadow-lg flex items-center justify-center">
                      <SmilePlus className="w-4 h-4" />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2 bg-zinc-900 border-zinc-800 flex gap-2" side="top">
                      {["😂", "🤡", "😡", "💀", "🍻", "🔥"].map((emoji) => (
                        <button key={emoji}
                          onClick={() => channel.send({ type: "broadcast", event: "emoji", payload: { emoji } })}
                          className="text-2xl hover:scale-125 transition-transform">
                          {emoji}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="text-base font-bold text-white">
                  {me.name} {isMyTurn ? "🎯" : ""}
                </div>
                <div className="text-red-400 font-bold text-sm">💀 {me.score} pts</div>
                <div className="text-zinc-400 text-xs">Vazas: {me.tricks} / {me.bet !== null ? me.bet : "?"}</div>
              </div>

              {/* Hand cards — layoutId enables card-fly-to-table animation */}
              <div className="flex -space-x-6 z-30 relative">
                {me.cards.map((c, i) => (
                  <motion.div
                    key={`hand-${roundKey}-${c.suit}-${c.value}`}
                    layoutId={`card-${roundKey}-${c.suit}-${c.value}`}
                    whileHover={isMyTurn ? { y: -24, scale: 1.05, zIndex: 50 } : {}}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    onClick={() => sendPlayCard(i)}
                    className={`relative ${isMyTurn ? "cursor-pointer hover:shadow-2xl hover:shadow-yellow-400/30" : "cursor-not-allowed opacity-80"}`}>
                    <PlayingCard card={c} hidden={isBlindRound} theme={theme} />
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
          <span className="text-white font-black text-lg text-center">Sua vez de embaralhar!</span>
          <span className="text-zinc-400 text-sm text-center">Escolha como quer embaralhar:</span>
          <div className="flex gap-3 flex-wrap justify-center">
            {[
              { type: "cut" as ShuffleType, label: "✂️ Cortar", desc: "Divide ao meio" },
              { type: "riffle" as ShuffleType, label: "🎴 Riffle", desc: "Entrelaçar" },
              { type: "overhand" as ShuffleType, label: "🤌 Pilha", desc: "Mover por cima" },
              { type: "lucas" as ShuffleType, label: "👑 Supremo do Lucas", desc: "Não embaralha nada" },
            ].map(({ type, label, desc }) => (
              <motion.button key={type} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}
                onHoverStart={() => setPreview(type)} onHoverEnd={() => setPreview(null)}
                onClick={() => onShuffle(type)}
                className={`flex flex-col items-center gap-1 bg-zinc-900 border px-5 py-3 rounded-xl transition-all text-white ${
                  type === "lucas"
                    ? "border-yellow-600 hover:border-yellow-400 hover:bg-yellow-900/20"
                    : "border-zinc-700 hover:border-red-500 hover:bg-red-900/20"
                }`}>
                <span className="text-2xl">{label.split(" ")[0]}</span>
                <span className="font-bold text-sm">{label.split(" ").slice(1).join(" ")}</span>
                <span className="text-zinc-500 text-xs">{desc}</span>
              </motion.button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {preview && <DeckAnimation type={preview} key={preview} />}
          </AnimatePresence>
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
const CARD_BACKS: Record<string, string> = {
  candy: "/themes/card_back_candy.jpg",
  adventure: "/themes/card_back_adventure.jpg",
  pedro: "/themes/card_back_pedro.jpg",
  aquarium: "/themes/card_back_aquarium.jpg",
  lotr: "/themes/card_back_lotr.jpg",
  mpb: "/themes/card_back_mpb.jpg",
  lgbt: "/themes/card_back_lgbt.jpg",
};

const CARD_BORDERS: Record<string, [string, string]> = {
  aquarium: ["border-red-400", "border-cyan-400"],
  candy: ["border-pink-400", "border-purple-400"],
  adventure: ["border-orange-400", "border-green-500"],
  pedro: ["border-yellow-400", "border-zinc-400"],
  lotr: ["border-amber-500", "border-stone-400"],
  mpb: ["border-orange-600", "border-teal-600"],
  lgbt: ["border-rose-500", "border-indigo-500"],
};

function PlayingCard({
  card,
  hidden = false,
  theme = "aquarium",
}: {
  card: GameCard;
  hidden?: boolean;
  theme?: string;
}) {
  if (hidden) {
    return (
      <div
        className="w-20 h-28 rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.6)] border-2 border-white/20 bg-cover bg-center overflow-hidden select-none"
        style={{ backgroundImage: `url(${CARD_BACKS[theme] ?? CARD_BACKS.aquarium})` }}
      />
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const Icon = { hearts: Heart, spades: Spade, diamonds: Diamond, clubs: Club }[card.suit];
  const [redBorder, blackBorder] = CARD_BORDERS[theme] ?? CARD_BORDERS.aquarium;

  return (
    <div
      className={`w-20 h-28 bg-white/96 backdrop-blur-sm rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.5)] flex flex-col justify-between p-1.5 border-2 ${isRed ? redBorder : blackBorder} ${isRed ? "text-red-600" : "text-zinc-900"} select-none`}>
      <div className="text-base font-bold leading-none">{card.value}</div>
      <div className="flex-1 flex items-center justify-center">
        <Icon className="w-8 h-8 fill-current" />
      </div>
      <div className="text-base font-bold leading-none rotate-180">{card.value}</div>
    </div>
  );
}
