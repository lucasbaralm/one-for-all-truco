"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  GameState,
  handleBet,
  handlePlayCard,
  voteToEndMatch,
  ShuffleStyle,
} from "@/lib/game/state-machine";
import { PlayerPresence } from "./RoomManager";
import { Card as GameCard, getWinningCardIndex } from "@/lib/game/rules";
import { ClientMessage, ServerMessage } from "@/lib/game/party-protocol";
import { usePartySocket } from "partysocket/react";
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
// (O hold de vazas NO MEIO da rodada é decidido pelo servidor — party/server.ts
// — e o cliente só reage ao que ele manda, sem precisar de um timer próprio.)
const LAST_TRICK_REVEAL_MS = 3000;

interface GameBoardProps {
  roomId: string;
  playerName: string;
  initialPlayers: PlayerPresence[];
}

interface TrickResult {
  winnerId: string;
  cards: { playerId: string; card: GameCard }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// GameBoard — o room server do PartyKit (party/server.ts) é a única
// autoridade: aplica cada ação, persiste em Postgres (rooms.state) e
// transmite o resultado pra todo mundo. Todo cliente aqui (sem distinção de
// "host") prevê sua própria ação localmente (mesma função pura que o
// servidor roda) pra sentir resposta instantânea, e recebe a confirmação
// autoritativa do servidor logo em seguida.
// ─────────────────────────────────────────────────────────────────────────────
export default function GameBoard({
  roomId,
  playerName,
  initialPlayers,
}: GameBoardProps) {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [emojis, setEmojis] = useState<{ id: string; emoji: string; fromPlayerId: string }[]>([]);
  const [trickResult, setTrickResult] = useState<TrickResult | null>(null);
  // Ordem em que EU escolhi organizar minha própria mão (arrastando) — puramente
  // visual/local, não é regra de jogo. Guarda "naipe+valor" (só existe uma
  // cópia de cada carta no baralho, então isso já é uma chave única e estável
  // mesmo quando o índice real da carta muda por causa de outras jogadas).
  const [handOrderKeys, setHandOrderKeys] = useState<string[]>([]);
  // Onde soltar uma carta arrastada pra jogar ela (a mesa) — medido via ref
  // pra comparar com a posição do dedo/mouse no fim do arraste.
  const tableDropRef = useRef<HTMLDivElement>(null);
  const handRowRef = useRef<HTMLDivElement>(null);
  const handCardElRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerHandCardRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) handCardElRefs.current.set(key, el);
    else handCardElRefs.current.delete(key);
  }, []);
  // Solta uma carta arrastada fora da mesa: reordena a mão pra posição mais
  // próxima de onde ela foi largada (compara com o centro das outras cartas).
  const handleHandReorder = useCallback((key: string, dropClientX: number) => {
    setHandOrderKeys((prev) => {
      const others = prev.filter((k) => k !== key);
      let insertAt = others.length;
      for (let i = 0; i < others.length; i++) {
        const el = handCardElRefs.current.get(others[i]);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (dropClientX < rect.left + rect.width / 2) {
          insertAt = i;
          break;
        }
      }
      others.splice(insertAt, 0, key);
      return others;
    });
  }, []);

  // Sincroniza handOrderKeys com as cartas atuais da minha mão: mantém a
  // ordem que eu escolhi pras cartas que continuam lá, tira as que já joguei,
  // e põe cartas novas (de um deal novo) no fim — nunca reseta a ordem toda
  // só porque uma carta foi jogada.
  useEffect(() => {
    const myCards = gameState?.players.find((p) => p.name === playerName)?.cards ?? [];
    const keys = myCards.map((c) => `${c.suit}-${c.value}`);
    setHandOrderKeys((prev) => {
      const kept = prev.filter((k) => keys.includes(k));
      const additions = keys.filter((k) => !kept.includes(k));
      if (kept.length === prev.length && additions.length === 0) return prev;
      return [...kept, ...additions];
    });
  }, [gameState, playerName]);
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

  // Largura real da viewport, só pra decidir o raio da elipse dos oponentes
  // (ver abaixo) — em telas estreitas um raio X grande empurra os assentos da
  // esquerda/direita pra fora da tela, já que a caixa do avatar tem uma
  // largura mínima que não encolhe com a tela.
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const myId = playerName;

  // Aplica handlePlayCard localmente e, se isso fechar uma vaza, monta o
  // trickResult (segura a vaza na tela / bloqueia cliques via o guard
  // `!trickResult` em isMyTurn, mais abaixo) — usado tanto pela previsão
  // otimista de quem jogou (abaixo) quanto pela mensagem "trick_result" que
  // o servidor manda pra todo mundo (inclusive quem já previu — se bateu,
  // não muda nada visualmente). trickResult é limpo quando o "state"
  // autoritativo do servidor chega (ver onMessage), não por um timer local
  // — assim nunca desalinha do hold de verdade que o servidor está fazendo.
  const applyPlayCardWithTrickReveal = useCallback((prev: GameState, playerId: string, cardIndex: number) => {
    const next = handlePlayCard(prev, playerId, cardIndex);
    const trickJustEnded =
      prev.tableCards.length === prev.players.length - 1 && next.tableCards.length === 0;

    if (trickJustEnded && prev.vira) {
      const lastCard = prev.players.find((p) => p.id === playerId)?.cards[cardIndex];
      if (lastCard) {
        const completedCards = [...prev.tableCards, { playerId, card: lastCard }];
        const winIdx = getWinningCardIndex(completedCards.map((tc) => tc.card), prev.vira);
        const winnerId = completedCards[winIdx]?.playerId;
        if (winnerId) setTrickResult({ winnerId, cards: completedCards });
      }
    }

    return next;
  }, []);

  // ── Floating emoji (from sender's portrait to table center, then fades) ──
  const addFloatingEmoji = useCallback((emoji: string, fromPlayerId: string) => {
    const id = Math.random().toString();
    setEmojis((prev) => [...prev, { id, emoji, fromPlayerId }]);
    setTimeout(() => setEmojis((prev) => prev.filter((e) => e.id !== id)), 1800);
  }, []);

  // ── Conexão com o room server (party/server.ts) — única autoridade ─────
  // Cada cliente (sem distinção de "host") manda sua ação e recebe de volta
  // o resultado autoritativo por essa mesma conexão. O token de acesso do
  // Supabase vai como query param pro servidor verificar quem é de verdade
  // antes de aceitar qualquer mensagem (ver onConnect em party/server.ts).
  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST,
    room: roomId,
    query: async () => {
      const { data } = await supabase.auth.getSession();
      return { token: data.session?.access_token ?? "", playerId: myId };
    },
    onOpen: () => {
      // Sempre tenta criar a partida ao conectar — se a sala já tiver uma
      // rolando, o servidor simplesmente ignora (idempotente); é assim que
      // qualquer jogador consegue "começar" sem precisar de host eleito.
      socket.send(
        JSON.stringify({
          type: "start_game",
          players: initialPlayersRef.current.map((p) => ({ id: p.id, name: p.name })),
        } satisfies ClientMessage)
      );
    },
    onMessage: (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "state") {
        setGameState(message.state);
        setTrickResult(null);
      } else if (message.type === "trick_result") {
        setTrickResult({ winnerId: message.winnerId, cards: message.cards });
      } else if (message.type === "emoji") {
        // Já foi adicionado otimisticamente na hora do clique, no meu próprio cliente.
        if (message.fromPlayerId === playerName) return;
        addFloatingEmoji(message.emoji, message.fromPlayerId);
      } else if (message.type === "shuffle_announce") {
        setShuffleAnnouncement({ dealerName: message.dealerName, label: message.label });
        setTimeout(
          () => setShuffleAnnouncement((cur) => (cur?.dealerName === message.dealerName ? null : cur)),
          4000
        );
      }
    },
  });

  const send = useCallback((message: ClientMessage) => socket.send(JSON.stringify(message)), [socket]);

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
        <Button
          onClick={() => {
            send({
              type: "start_game",
              players: initialPlayers.map((p) => ({ id: p.id, name: p.name })),
            });
          }}
          className="w-full max-w-md h-14 text-lg font-bold bg-white text-black hover:bg-zinc-200">
          Começar Nova Partida
        </Button>
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
    gameState.players[gameState.currentPlayerIndex]?.name === playerName &&
    // Enquanto a animação da vaza anterior ainda está na tela (só existe no
    // cliente do host, que é quem atualiza o estado localmente na hora, sem
    // esperar o broadcast), não libera clicar em outra carta ainda.
    !trickResult;

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
    : gameState.phase === "playing" ? "🎯 Escolhendo"
    : null;
  const isMeActive = !!me && activePlayerId === me.id;

  let winningTableCardIndex = -1;
  if (gameState.tableCards.length > 0 && gameState.vira) {
    winningTableCardIndex = getWinningCardIndex(
      gameState.tableCards.map((tc) => tc.card),
      gameState.vira
    );
  }

  // Posição (em % do container da mesa) do assento de um jogador qualquer —
  // "cruz" ao redor da mesa, com offset 0 (eu mesmo) sempre embaixo (180°).
  // Reusada tanto pra plotar os oponentes quanto pra mirar a animação da vaza
  // voando até o vencedor (inclusive quando o vencedor sou eu).
  // Raio X menor no mobile: a caixa do avatar tem largura mínima fixa (não
  // encolhe com a tela), então nos assentos da esquerda/direita um raio maior
  // empurrava a caixa pra fora da viewport.
  const isNarrowScreen = viewportWidth > 0 && viewportWidth < 640;
  const seatRadiusX = isNarrowScreen ? 32 : 40;
  // Menor no mobile: sobra menos altura livre acima de um assento no topo pra
  // caber a pilha de vazas ganhas (ver bottom-full logo abaixo) sem colidir
  // com a toolbar fixa.
  const seatRadiusY = isNarrowScreen ? 26 : 32;
  const getSeatPosition = (playerId: string) => {
    const totalPlayers = gameState.players.length;
    const myIndex = gameState.players.findIndex((pl) => pl.name === playerName);
    const theirIndex = gameState.players.findIndex((pl) => pl.id === playerId);
    const offset = (((theirIndex - myIndex) % totalPlayers) + totalPlayers) % totalPlayers;
    const angle = (180 + offset * (360 / totalPlayers)) % 360;
    const rad = (angle * Math.PI) / 180;
    return {
      left: 50 + seatRadiusX * Math.sin(rad),
      top: 50 - seatRadiusY * Math.cos(rad),
    };
  };

  // Minha mão, na ordem que EU escolhi (handOrderKeys) — não a ordem do
  // servidor. originalIndex é o que precisa ir pro state machine ao jogar.
  const orderedHandCards = me
    ? handOrderKeys.flatMap((key) => {
        const originalIndex = me.cards.findIndex((c) => `${c.suit}-${c.value}` === key);
        return originalIndex === -1 ? [] : [{ key, card: me.cards[originalIndex], originalIndex }];
      })
    : [];
  // Sobreposição entre cartas da mão escala com a quantidade, pra até ~13
  // caberem numa linha só sem cortar (o baralho de 40 cartas / 3 jogadores dá
  // no máximo 13 rodadas) — quanto mais cartas, mais elas se sobrepõem.
  const handCardWRem = isNarrowScreen ? 4.32 : 7.2;
  const handAvailableRem = isNarrowScreen ? 22 : 50;
  const handOverlapRem =
    orderedHandCards.length <= 1
      ? 0
      : Math.min(
          handCardWRem * 0.72,
          Math.max(handCardWRem * 0.22, handCardWRem - (handAvailableRem - handCardWRem) / (orderedHandCards.length - 1))
        );

  // Regra do "fechamento": quem faz a última aposta da rodada não pode deixar
  // a soma das apostas igual à quantidade de cartas — um valor fica bloqueado.
  const isClosingBet = gameState.players.filter((p) => p.bet === null).length === 1;
  const forbiddenBet =
    gameState.phase === "betting" && isClosingBet
      ? gameState.currentRoundCards -
        gameState.players.reduce((sum, p) => sum + (p.bet ?? 0), 0)
      : null;

  // ── Action helpers ────────────────────────────────────────────────────────
  // Manda a ação pro room server processar de verdade E aplica a mesma
  // função pura no estado LOCAL na hora — é a mesma lógica que o servidor
  // vai rodar, então o resultado já sai certo na tela sem esperar a
  // ida-e-volta pela rede. Quando o "state" autoritativo chegar (onMessage,
  // acima), ele só substitui o estado local — nada é persistido a partir
  // dessa previsão, então não tem risco de dado nenhum: se bateu não muda
  // nada visualmente, se não bateu só corrige.
  const sendBet = (bet: number) => {
    if (!me) return;
    send({ type: "bet", playerId: me.id, bet });
    setGameState((prev) => (prev ? handleBet(prev, me.id, bet) : prev));
  };

  const sendPlayCard = (cardIndex: number) => {
    if (!isMyTurn || !me) return;
    send({ type: "play_card", playerId: me.id, cardIndex });
    setGameState((prev) => (prev ? applyPlayCardWithTrickReveal(prev, me.id, cardIndex) : prev));
  };

  const sendEmoji = (emoji: string) => {
    if (!me) return;
    addFloatingEmoji(emoji, me.id); // otimista: aparece pra mim na hora, sem esperar o broadcast
    send({ type: "emoji", emoji, fromPlayerId: me.id });
  };

  const sendEndVote = () => {
    if (!me) return;
    send({ type: "vote_end", playerId: me.id });
    setGameState((prev) => (prev ? voteToEndMatch(prev, me.id, countConnected(prev.players)) : prev));
  };

  const handleLeaveConfirmed = () => {
    router.push("/lobby");
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <LayoutGroup>
      {/* min-h-0: sem isso um flex-1 nunca encolhe abaixo do tamanho do seu
          conteúdo, e o board vazava pra fora da tela em vez de caber nela.
          overflow-hidden nos dois eixos: a página inteira (page.tsx) já é
          h-dvh + overflow-hidden — isso aqui é a segunda camada, garantindo
          que nada aqui dentro force scroll mesmo se algo ficar um pouco alto
          demais (nesse caso só recorta, não estoura a tela). */}
      <div className="flex flex-col flex-1 min-h-0 justify-between relative overflow-hidden">

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
        {/* fixed (não absolute): o seletor de tema (ThemeSelector, montado no
            layout raiz) é posicionado direto contra a viewport, sem herdar
            padding de nenhum ancestral. Pra ficar na mesma linha que ele (em
            vez de mais pra baixo, empurrado pelo padding da página/board),
            isso aqui também precisa ser fixed contra a viewport. */}
        <div className="fixed top-1 left-1 sm:top-2 sm:left-2 z-30 flex items-center gap-1 sm:gap-2 max-w-[70vw] sm:max-w-none">
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
              className="absolute top-10 sm:top-2 left-1/2 -translate-x-1/2 z-30 bg-black/60 border border-yellow-500/40 text-yellow-200 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm whitespace-nowrap">
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
                  <Button className="bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={() => setDisconnectTimer((prev) => prev ? { ...prev, dismissed: true } : prev)}>
                    Continuar mesmo assim
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── MESA: oponentes distribuídos em cruz ao redor, como numa mesa de
             verdade — cada um a 360°/N graus de distância do seguinte, comigo
             sempre "embaixo" (180°). Nada de fileira, ninguém lado a lado. ── */}
        <div className="flex-1 min-h-0 relative pt-10 sm:pt-4 flex items-center justify-center">
          {others.map((p) => {
            const { left, top } = getSeatPosition(p.id);
            // Não centraliza verticalmente no ponto pra todo assento: um
            // assento perto do topo da elipse, com a caixa alta (pilha de
            // vazas + leque de cartas), podia crescer pra CIMA do próprio
            // ponto e sair da tela por cima da toolbar. Assentos de cima só
            // crescem pra baixo a partir do ponto; de baixo (com 5+
            // jogadores alguns passam do centro) só crescem pra cima; só os
            // realmente no meio (assento à esquerda/direita) ficam centralizados.
            const verticalAnchor = top < 42 ? "0%" : top > 58 ? "-100%" : "-50%";
            return (
              <div key={p.id}
                className="absolute z-10"
                style={{ left: `${left}%`, top: `${top}%`, transform: `translate(-50%, ${verticalAnchor})` }}>
                {/* relative: âncora local pra pilha de vazas + seta ficarem
                    "flutuando" acima da caixa do avatar via position:absolute,
                    em vez de fileira flex normal — assim elas NÃO entram na
                    altura total que -translate-y-1/2 usa pra centralizar no
                    ponto da elipse. Sem isso, um oponente com pilha de vazas
                    ganhava tanta altura extra que a pilha era empurrada pra
                    fora da tela por cima (bem acima da toolbar). */}
                <div className="relative flex flex-col items-center">
                  {(p.wonCards?.length > 0 || activePlayerId === p.id) && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col items-center gap-1 sm:gap-2">
                      {p.wonCards && p.wonCards.length > 0 && (
                        <div className="flex gap-0.5 sm:gap-1">
                          {p.wonCards.map((trick, trickIdx) => (
                            <motion.div key={trickIdx} initial={{ scale: 0, y: -20 }}
                              animate={{ scale: isNarrowScreen ? 0.22 : 0.45, y: 0 }}
                              className="relative w-5 h-7 sm:w-24 sm:h-36 origin-top-left">
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
                    </div>
                  )}

                  {/* Avatar — w-fit com min-w: cresce se o conteúdo (badge "APOSTANDO"
                      etc.) não couber no tamanho padrão, em vez de cortar/estourar. */}
                  <div className={`bg-zinc-900 border rounded-lg sm:rounded-xl p-1.5 sm:p-3 text-center shadow-lg transition-all w-fit max-w-[34vw] sm:max-w-none ${manyOpponents ? "min-w-14 sm:min-w-24" : "min-w-16 sm:min-w-32"} ${
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
                    ) : p.cards.length > 0 ? (
                      <div className="mt-1 flex flex-col items-center gap-0.5">
                        {/* Versos das cartas no tema escolhido — só pra imersão, não dá
                            pra ver o valor. Limita o leque a 6 versos mesmo com mais
                            cartas na mão, senão a caixa do avatar fica gigante. */}
                        <div className="flex -space-x-3 sm:-space-x-5 scale-[0.42] sm:scale-[0.55] origin-top">
                          {Array.from({ length: Math.min(p.cards.length, 6) }).map((_, i) => (
                            <PlayingCard key={i} card={p.cards[0]} hidden theme={theme} backIndex={i} />
                          ))}
                        </div>
                        <div className="text-zinc-500 text-[10px] sm:text-xs">🃏 {p.cards.length} cartas</div>
                      </div>
                    ) : (
                      <div className="text-zinc-500 text-[10px] sm:text-xs mt-1">🃏 0 cartas</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Última vaza da rodada, parada na mesa antes do placar aparecer */}
          {gameState.phase === "round_end" && !scoreboardReady && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 text-yellow-300 text-xs font-bold uppercase tracking-wide whitespace-nowrap">
              Última jogada da rodada
            </motion.div>
          )}

          {/* Table cards (current trick) — tableDropRef: onde soltar uma
              carta arrastada da mão pra jogar ela de verdade (ver HandCard).
              Reduzido de propósito: com 3+ jogadores um assento sempre cai
              perto do topo, e a mesa grande demais colidia com ele. */}
          <div
            ref={tableDropRef}
            className="relative flex items-center justify-center w-32 h-32 sm:w-64 sm:h-64 rounded-full border-2 border-dashed border-zinc-700/50 bg-cover bg-center overflow-hidden"
            style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${TABLE_BG[theme] ?? TABLE_BG.aquarium})` }}
          >
            {/* Vira — dentro do círculo da mesa (não é mais um elemento solto
                no canto da tela): assim nunca compete de espaço com um
                assento, não importa quantos jogadores ou o quão alta fique a
                caixa de algum oponente (ex: com pilha de vazas ganhas). */}
            {gameState.vira && (
              <div className="absolute top-1 left-1 sm:top-2 sm:left-2 flex flex-col items-center scale-[0.5] sm:scale-[0.65] origin-top-left z-10">
                <span className="text-zinc-400 font-bold mb-0.5 uppercase tracking-widest text-[9px] whitespace-nowrap">Vira</span>
                <PlayingCard card={gameState.vira} theme={theme} />
              </div>
            )}

            {gameState.tableCards.length === 0 && gameState.phase !== "shuffling" && (
              <span className="text-zinc-600 font-bold opacity-50 text-sm">MESA VAZIA</span>
            )}

            {/* Shuffle phase — só dentro do círculo da mesa (não a mesa inteira),
                pra não cobrir a toolbar (Menu / Votar p/ Encerrar) nem os
                oponentes: continuam clicáveis normalmente durante o embaralhar. */}
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
                  send({ type: "shuffle_announce", ...announcePayload });
                  // Sem previsão otimista aqui de propósito: embaralhar/distribuir
                  // envolve sorteio (shuffleDeck), então o resultado local seria
                  // diferente do que o servidor vai calcular de verdade — mostrar
                  // uma mão "adivinhada" só pra trocar de novo pareceria um bug.
                  send({ type: "shuffle", playerId: me.id, style });
                }}
              />
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
          </div>

          {/* Vaza voando pro vencedor — fora do círculo da mesa (que corta
              overflow) e por cima de tudo (z-40), pra sobrepor a mesa de
              verdade em vez de ficar presa/cortada dentro dela. Mira o
              assento real de quem ganhou (o mesmo cálculo usado pros
              oponentes) — se o vencedor for eu, "meu assento" é embaixo da
              elipse, bem na direção da minha mão. */}
          <AnimatePresence>
            {trickResult && (() => {
              const { left, top } = getSeatPosition(trickResult.winnerId);
              return (
                <motion.div key="trick-flyout"
                  initial={{ left: "50%", top: "50%", opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                  animate={{ left: "50%", top: "50%", opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                  exit={{ left: `${left}%`, top: `${top}%`, opacity: 0, scale: 0.15, x: "-50%", y: "-50%" }}
                  transition={{ duration: 0.8, ease: "easeIn" }}
                  className="absolute z-40 pointer-events-none">
                  {trickResult.cards.map((tc, idx) => (
                    <div key={idx} className="absolute" style={{ transform: `rotate(${idx * 12}deg)` }}>
                      <PlayingCard card={tc.card} theme={theme} />
                    </div>
                  ))}
                </motion.div>
              );
            })()}
          </AnimatePresence>
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

            {/* Vazas ganhas + avatar, numa linha só */}
            <div className="flex items-end gap-1 sm:gap-4 justify-center px-1 sm:px-4">
              {/* Won-cards pile */}
              <div className="flex gap-0.5 sm:gap-1 items-end min-w-[36px] sm:min-w-[60px]">
                <AnimatePresence>
                  {me.wonCards && me.wonCards.map((trick, trickIdx) => (
                    <motion.div key={trickIdx} initial={{ scale: 0, y: 20 }}
                      animate={{ scale: isNarrowScreen ? 0.35 : 0.5, y: 0 }}
                      exit={{ scale: 0 }} className="relative w-8 h-11 sm:w-24 sm:h-36 origin-bottom-left">
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
            </div>

            {/* Minha mão, numa linha própria (largura cheia) — arraste uma carta
                pra reorganizar, ou solte ela em cima da mesa pra jogar. Um toque
                simples (sem arrastar) não joga mais nada, de propósito: assim dá
                pra reorganizar sem risco de jogar sem querer. */}
            <div ref={handRowRef} className="flex items-end justify-center w-full px-1 sm:px-4 relative z-30">
              {orderedHandCards.map(({ key, card, originalIndex }, i) => (
                <HandCard
                  key={key}
                  cardKey={key}
                  card={card}
                  hidden={isBlindRound}
                  theme={theme}
                  backIndex={i}
                  isMyTurn={isMyTurn}
                  canDrag={gameState.phase === "playing" || gameState.phase === "betting"}
                  marginLeftRem={i === 0 ? 0 : handOverlapRem}
                  layoutId={`card-${roundKey}-${card.suit}-${card.value}`}
                  onRegisterRef={registerHandCardRef}
                  onPlay={() => sendPlayCard(originalIndex)}
                  onReorder={handleHandReorder}
                  tableDropRef={tableDropRef}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HAND CARD — uma carta arrastável na minha mão. Arrastar e soltar em cima da
// mesa (tableDropRef) joga a carta de verdade; soltar em qualquer outro lugar
// só reorganiza a mão (reordena pra posição mais próxima de onde caiu). Um
// toque sem arrastar não faz nada — de propósito, pra não jogar sem querer
// enquanto só se está tentando reorganizar.
// ─────────────────────────────────────────────────────────────────────────────
function HandCard({
  cardKey,
  card,
  hidden,
  theme,
  backIndex,
  isMyTurn,
  canDrag,
  marginLeftRem,
  layoutId,
  onRegisterRef,
  onPlay,
  onReorder,
  tableDropRef,
}: {
  cardKey: string;
  card: GameCard;
  hidden: boolean;
  theme: string;
  backIndex: number;
  isMyTurn: boolean;
  canDrag: boolean;
  marginLeftRem: number;
  layoutId: string;
  onRegisterRef: (key: string, el: HTMLDivElement | null) => void;
  onPlay: () => void;
  onReorder: (key: string, dropClientX: number) => void;
  tableDropRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <motion.div
      ref={(el) => onRegisterRef(cardKey, el)}
      layout
      layoutId={layoutId}
      drag={canDrag}
      dragSnapToOrigin
      dragElastic={0.15}
      dragMomentum={false}
      whileHover={isMyTurn && !dragging ? { y: -20, zIndex: 50 } : {}}
      whileDrag={{ scale: 1.14, zIndex: 100, boxShadow: "0 22px 36px rgba(0,0,0,0.55)" }}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_e, info) => {
        setDragging(false);
        const tableRect = tableDropRef.current?.getBoundingClientRect();
        const droppedOnTable =
          !!tableRect &&
          info.point.x >= tableRect.left &&
          info.point.x <= tableRect.right &&
          info.point.y >= tableRect.top &&
          info.point.y <= tableRect.bottom;
        if (droppedOnTable && isMyTurn) {
          onPlay();
        } else {
          onReorder(cardKey, info.point.x);
        }
      }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={{ marginLeft: `${-marginLeftRem}rem` }}
      className={`relative ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default opacity-90"}`}>
      <PlayingCard card={card} hidden={hidden} theme={theme} backIndex={backIndex} />
      {isMyTurn && !dragging && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-yellow-400 rounded-full" />
      )}
    </motion.div>
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
  const [confirmed, setConfirmed] = useState<ShuffleType | null>(null);

  // No mobile não existe "hover" de verdade, então o preview (que só rodava
  // com onHoverStart) nunca aparecia lá — e mesmo no desktop, ao clicar a
  // fase mudava tão rápido que ninguém chegava a ver a animação escolhida.
  // Ao tocar/clicar: mostra a animação escolhida por um instante e só DEPOIS
  // manda embaralhar de verdade, pra dar tempo de ver o que foi selecionado.
  const handlePick = (type: ShuffleType) => {
    if (confirmed) return;
    setConfirmed(type);
    setPreview(type);
    setTimeout(() => onShuffle(type), 1100);
  };

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
                onHoverStart={() => !confirmed && setPreview(type)}
                onHoverEnd={() => !confirmed && setPreview(null)}
                onClick={() => handlePick(type)}
                disabled={!!confirmed}
                className={`flex flex-col items-center gap-0.5 sm:gap-1 bg-zinc-900 border px-2.5 py-2 sm:px-5 sm:py-3 rounded-lg sm:rounded-xl transition-all text-white w-[76px] sm:w-auto disabled:opacity-40 ${
                  confirmed === type
                    ? "border-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.4)]"
                    : type === "lucas"
                    ? "border-yellow-600 hover:border-yellow-400 hover:bg-yellow-900/20"
                    : "border-zinc-700 hover:border-red-500 hover:bg-red-900/20"
                }`}>
                <span className="text-lg sm:text-2xl">{label.split(" ")[0]}</span>
                <span className="font-bold text-[10px] sm:text-sm text-center leading-tight">{label.split(" ").slice(1).join(" ")}</span>
                <span className="text-zinc-500 text-[9px] sm:text-xs hidden sm:block">{desc}</span>
              </motion.button>
            ))}
          </div>
          <div>
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
        className="w-[4.32rem] h-[5.76rem] sm:w-[7.2rem] sm:h-[10.08rem] rounded-lg sm:rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.6)] border-2 border-white/20 bg-cover bg-center overflow-hidden select-none"
        style={{ backgroundImage: `url(${back})` }}
      />
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const Icon = { hearts: Heart, spades: Spade, diamonds: Diamond, clubs: Club }[card.suit];
  const [redBorder, blackBorder] = CARD_BORDERS[theme] ?? CARD_BORDERS.aquarium;

  return (
    <div
      className={`w-[4.32rem] h-[5.76rem] sm:w-[7.2rem] sm:h-[10.08rem] bg-white/96 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.5)] flex flex-col justify-between p-1.5 sm:p-2.5 border-2 ${isRed ? redBorder : blackBorder} ${isRed ? "text-red-600" : "text-zinc-900"} select-none`}>
      <div className="text-sm sm:text-[1.35rem] font-bold leading-none">{card.value}</div>
      <div className="flex-1 flex items-center justify-center">
        <Icon className="w-6 h-6 sm:w-12 sm:h-12 fill-current" />
      </div>
      <div className="text-sm sm:text-[1.35rem] font-bold leading-none rotate-180">{card.value}</div>
    </div>
  );
}
