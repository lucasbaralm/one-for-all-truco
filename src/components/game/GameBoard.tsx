"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { GameState, createInitialState, startNextRound, handleBet, handlePlayCard } from "@/lib/game/state-machine";
import { PlayerPresence } from "./RoomManager";
import { Card as GameCard, Suit, Value } from "@/lib/game/rules";
import { motion } from "framer-motion";
import { Spade, Heart, Club, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GameBoardProps {
  roomId: string;
  playerName: string;
  isHost: boolean;
  initialPlayers: PlayerPresence[];
  channel: any;
}

export default function GameBoard({ roomId, playerName, isHost, initialPlayers, channel }: GameBoardProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    const initializeGame = async () => {
      if (isHost && !gameState) {
        // Tenta buscar snapshot salvo no banco primeiro
        const { data } = await supabase.from('rooms').select('state').eq('id', roomId).single();
        
        let stateToUse = null;
        if (data && data.state) {
          // Existe um save! Retomar a partida
          stateToUse = data.state as GameState;
        } else {
          // Novo jogo
          stateToUse = startNextRound(createInitialState(initialPlayers));
          // Grava o primeiro save
          await supabase.from('rooms').update({ state: stateToUse }).eq('id', roomId);
        }
        
        setGameState(stateToUse);
        
        // Delay pequeno para garantir que todos estão ouvindo
        setTimeout(() => {
          channel.send({
            type: "broadcast",
            event: "sync_state",
            payload: stateToUse,
          });
        }, 500);
      }
    };
    initializeGame();

    const stateHandler = channel.on("broadcast", { event: "sync_state" }, (res: any) => {
      if (!isHost) {
        setGameState(res.payload as GameState);
      }
    });

    // Aqui o host escuta ações de 'bet' e 'play_card' dos jogadores
    let betHandler: any;
    let playHandler: any;

    if (isHost) {
      betHandler = channel.on("broadcast", { event: "player_bet" }, (res: any) => {
        setGameState((prevState) => {
          if (!prevState) return prevState;
          const newState = handleBet(prevState, res.payload.playerId, res.payload.bet);
          channel.send({ type: "broadcast", event: "sync_state", payload: newState });
          
          // Salva Snapshot no banco asincronamente
          supabase.from('rooms').update({ state: newState }).eq('id', roomId).then();
          
          return newState;
        });
      });

      playHandler = channel.on("broadcast", { event: "play_card" }, (res: any) => {
        setGameState((prevState) => {
          if (!prevState) return prevState;
          const newState = handlePlayCard(prevState, res.payload.playerId, res.payload.cardIndex);
          
          // Salva Snapshot
          supabase.from('rooms').update({ state: newState }).eq('id', roomId).then();

          // Pequeno delay se o jogo for reiniciar
          if (newState.phase === 'round_end' || newState.tableCards.length === 0) {
            setTimeout(() => {
               channel.send({ type: "broadcast", event: "sync_state", payload: newState });
            }, 1000);
          } else {
             channel.send({ type: "broadcast", event: "sync_state", payload: newState });
          }
          return newState;
        });
      });
    }
    
    return () => {
      // Cleanup events
    };
  }, [roomId, isHost, initialPlayers, channel]);

  if (!gameState) {
    return <div className="text-white">Carregando a mesa...</div>;
  }

  if (gameState.phase === 'game_over') {
    // Quem tem MENOS pontos ganha
    const sortedPlayers = [...gameState.players].sort((a, b) => a.score - b.score);
    return (
      <div className="flex flex-col items-center justify-center h-[90vh] text-white space-y-8">
        <h1 className="text-5xl font-black text-red-500 mb-6">FIM DE JOGO</h1>
        <div className="bg-zinc-900/80 p-8 rounded-2xl border border-zinc-800 w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-bold mb-6 text-center text-zinc-300">PLACAR FINAL (Menos Pontos Vence)</h2>
          <div className="space-y-4">
            {sortedPlayers.map((p, index) => (
              <div key={p.id} className="flex justify-between items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black text-zinc-600">#{index + 1}</span>
                  <span className="text-xl font-bold">{p.name} {p.name === playerName ? "(Você)" : ""}</span>
                </div>
                <span className={`text-xl font-bold ${index === 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {p.score} pts
                </span>
              </div>
            ))}
          </div>
        </div>
        {isHost && (
          <Button 
            onClick={() => {
              const newState = startNextRound(createInitialState(initialPlayers));
              setGameState(newState);
              supabase.from('rooms').update({ state: newState }).eq('id', roomId).then();
              channel.send({
                type: "broadcast",
                event: "sync_state",
                payload: newState,
              });
            }}  
            className="w-full max-w-md h-14 text-lg font-bold bg-white text-black hover:bg-zinc-200"
          >
            Começar Nova Partida
          </Button>
        )}
      </div>
    );
  }

  const me = gameState.players.find(p => p.name === playerName);
  const others = gameState.players.filter(p => p.name !== playerName);
  const isBlindRound = gameState.currentRoundCards === 1;

  return (
    <div className="flex flex-col h-[90vh] justify-between relative">
      
      {/* Jogadores adversários (Topo) */}
      <div className="flex justify-center gap-4">
        {others.map(p => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center w-32 relative">
            <div className="font-bold text-white truncate">{p.name}</div>
            <div className="text-red-400 text-sm font-bold">Pontos: {p.score}</div>
            <div className="text-zinc-500 text-xs">Aposta: {p.bet !== null ? p.bet : '?'}</div>
            {isBlindRound && p.cards.length > 0 ? (
               <div className="mt-2 flex justify-center scale-75 origin-top">
                 <PlayingCard card={p.cards[0]} />
               </div>
            ) : (
               <div className="text-zinc-500 text-xs mt-1">Cartas: {p.cards.length}</div>
            )}
          </div>
        ))}
      </div>

      {/* Centro da Mesa */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Vira */}
        {gameState.vira && (
          <div className="absolute left-10 top-1/2 -translate-y-1/2 flex flex-col items-center">
            <span className="text-zinc-400 font-bold mb-2 uppercase tracking-widest text-xs">Vira</span>
            <PlayingCard card={gameState.vira} />
          </div>
        )}

        {/* Cartas jogadas na mesa */}
        <div className="w-64 h-64 bg-zinc-800/30 rounded-full border-2 border-dashed border-zinc-800 flex items-center justify-center relative">
          {gameState.tableCards.length === 0 && (
            <span className="text-zinc-500 font-bold opacity-50">MESA VAZIA</span>
          )}
          {/* Renderiza cartas na mesa com posições aleatórias */}
          {gameState.tableCards.map((tc, idx) => (
             <motion.div 
               key={idx}
               initial={{ scale: 0, rotate: Math.random() * 90 - 45 }}
               animate={{ scale: 1 }}
               className="absolute"
               style={{ 
                 left: `calc(50% - 40px + ${Math.random() * 40 - 20}px)`, 
                 top: `calc(50% - 60px + ${Math.random() * 40 - 20}px)` 
               }}
             >
               <PlayingCard card={tc.card} />
             </motion.div>
          ))}
        </div>
      </div>

      {/* Minha Área (Base) */}
      {me && (
        <div className="flex flex-col items-center gap-4">
          
          {/* Fase de Apostas */}
          {gameState.phase === 'betting' && gameState.players[gameState.currentPlayerIndex].name === playerName && (
            <div className="bg-red-900/40 border border-red-500 p-4 rounded-xl text-center space-y-3 mb-4 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
              <h3 className="text-white font-bold text-lg">Sua vez! Quantas você faz?</h3>
              <div className="flex gap-2">
                {Array.from({length: me.cards.length + 1}).map((_, i) => (
                  <Button 
                    key={i} 
                    onClick={() => {
                      // Se for o host, já roda direto
                      if (isHost) {
                        setGameState((prev) => {
                          if (!prev) return prev;
                          const newState = handleBet(prev, me.id, i);
                          supabase.from('rooms').update({ state: newState }).eq('id', roomId).then();
                          channel.send({ type: "broadcast", event: "sync_state", payload: newState });
                          return newState;
                        });
                      } else {
                        // Se não for, manda pro Host
                        channel.send({
                          type: "broadcast",
                          event: "player_bet",
                          payload: { playerId: me.id, bet: i }
                        });
                      }
                    }}
                    variant="secondary"
                  >
                    {i}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Status e Mão de Cartas */}
          <div className="flex items-end gap-6 w-full justify-between px-10">
            <div className="bg-zinc-900 p-4 rounded-t-xl border-t border-l border-r border-zinc-800 w-48 text-center">
              <div className="text-xl font-bold text-white">{me.name}</div>
              <div className="text-red-400 font-bold">Pontos (Dano): {me.score}</div>
              <div className="text-zinc-400 text-sm">Vazas: {me.tricks} / {me.bet !== null ? me.bet : '?'}</div>
            </div>

            <div className="flex -space-x-8">
              {me.cards.map((c, i) => (
                <motion.div 
                  key={i}
                  whileHover={{ y: -20, zIndex: 10 }}
                  onClick={() => {
                    // Só deixa clicar se for a fase certa e o meu turno
                    if (gameState.phase !== 'playing' || gameState.players[gameState.currentPlayerIndex].name !== playerName) return;
                    
                    if (isHost) {
                      setGameState((prev) => {
                        if (!prev) return prev;
                        const newState = handlePlayCard(prev, me.id, i);
                        supabase.from('rooms').update({ state: newState }).eq('id', roomId).then();
                        channel.send({ type: "broadcast", event: "sync_state", payload: newState });
                        return newState;
                      });
                    } else {
                      channel.send({
                        type: "broadcast",
                        event: "play_card",
                        payload: { playerId: me.id, cardIndex: i }
                      });
                    }
                  }}
                  className="relative transition-all cursor-pointer hover:shadow-2xl hover:shadow-red-500/20"
                >
                  <PlayingCard card={c} hidden={isBlindRound} />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayingCard({ card, hidden = false }: { card: GameCard, hidden?: boolean }) {
  if (hidden) {
    return (
      <div className="w-24 h-36 bg-zinc-900 rounded-xl shadow-xl flex flex-col justify-center items-center p-2 border-2 border-red-900 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black">
        <div className="w-full h-full border border-red-900/30 rounded-lg flex items-center justify-center">
          <div className="text-red-900/50 font-black text-4xl">?</div>
        </div>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const Icon = {
    'hearts': Heart,
    'spades': Spade,
    'diamonds': Diamond,
    'clubs': Club,
  }[card.suit];

  return (
    <div className={`w-24 h-36 bg-white rounded-xl shadow-xl flex flex-col justify-between p-2 border-2 ${isRed ? 'text-red-600 border-red-200' : 'text-zinc-900 border-zinc-200'}`}>
      <div className="text-lg font-bold leading-none">{card.value}</div>
      <div className="flex-1 flex items-center justify-center">
        <Icon className="w-10 h-10 fill-current" />
      </div>
      <div className="text-lg font-bold leading-none rotate-180">{card.value}</div>
    </div>
  );
}
