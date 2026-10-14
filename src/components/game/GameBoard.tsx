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
import { PlayerAvatar } from "./PlayerAvatar";
import { FeedHistoryButton, FeedList } from "@/components/feed/EventFeed";
import { GameOverPanel } from "@/components/GameOverPanel";
import { resultHeadline } from "@/lib/gameResult";
import { useTurnAlert } from "@/lib/useTurnAlert";
import { ActiveArrow, ActiveBadge } from "./ActiveIndicators";
import { BetMeter } from "./BetMeter";
import { ScoreDelta } from "./ScoreDelta";
import { sfx } from "./sfx";
import { useFodinhaFeed } from "./useFodinhaFeed";
import { HandCard } from "./HandCard";
import { PlayingCard, TABLE_BG } from "./PlayingCard";
import { ShufflePanel } from "./ShufflePanel";
import { Card as GameCard, getWinningCardIndex } from "@/lib/game/rules";
import { ClientMessage, ServerMessage } from "@/lib/game/party-protocol";
import { usePartySocket } from "partysocket/react";
import { partyHost } from "@/lib/services";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { SmilePlus, LogOut, Flag, WifiOff, Pause, Play, Volume2, VolumeX } from "lucide-react";
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
  // Trajeto da vaza voando (px, relativo à mesa): centro da mesa → caixa de
  // quem ganhou. Medido na hora em que a vaza fecha, não durante o render.
  path: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GameBoard — o room server (party/server.ts) é a única
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
  const { feed, roundStats } = useFodinhaFeed(gameState, playerName);
  const [soundOn, setSoundOn] = useState(true);
  // localStorage só existe no navegador: lê depois de montar pra não divergir do HTML do servidor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSoundOn(sfx.isEnabled()), []);
  // Ordem em que EU escolhi organizar minha própria mão (arrastando) — puramente
  // visual/local, não é regra de jogo. Guarda "naipe+valor" (só existe uma
  // cópia de cada carta no baralho, então isso já é uma chave única e estável
  // mesmo quando o índice real da carta muda por causa de outras jogadas).
  const [handOrderKeys, setHandOrderKeys] = useState<string[]>([]);
  // Onde soltar uma carta arrastada pra jogar ela (a mesa) — medido via ref
  // pra comparar com a posição do dedo/mouse no fim do arraste.
  const tableDropRef = useRef<HTMLDivElement>(null);
  // Mesa inteira (oponentes + célula da mesa) e caixas de cada jogador — a vaza
  // voando pro vencedor mira a posição MEDIDA do assento dele, não uma conta.
  const mesaRef = useRef<HTMLDivElement>(null);
  const myBoxRef = useRef<HTMLDivElement>(null);
  const seatElRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
  // Centro da mesa → centro da caixa de quem ganhou a vaza, em px relativos à
  // mesa. Oponentes têm entrada em seatElRefs; eu não, então cai na minha caixa.
  const measureTrickPath = useCallback((winnerId: string): TrickResult["path"] => {
    const mesa = mesaRef.current;
    const table = tableDropRef.current;
    if (!mesa || !table) return null;
    const m = mesa.getBoundingClientRect();
    const center = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - m.left, y: r.top + r.height / 2 - m.top };
    };
    const from = center(table);
    const winnerEl = seatElRefs.current.get(winnerId) ?? myBoxRef.current;
    return { from, to: winnerEl ? center(winnerEl) : from };
  }, []);

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
        if (winnerId) setTrickResult({ winnerId, cards: completedCards, path: measureTrickPath(winnerId) });
      }
    }

    return next;
  }, [measureTrickPath]);

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
    host: partyHost(),
    // A Fodinha é o binding "Main" do Worker (/parties/main/<sala>).
    party: "main",
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
          players: initialPlayersRef.current.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
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
        setTrickResult({ winnerId: message.winnerId, cards: message.cards, path: measureTrickPath(message.winnerId) });
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

  // ── "Sua vez" (embaralhar, apostar ou jogar): som e, com a aba escondida, o título da aba pisca ──
  const meNow = gameState?.players.find((p) => p.name === playerName);
  const meActiveNow =
    !!gameState &&
    !!meNow &&
    (gameState.phase === "shuffling"
      ? gameState.players[gameState.dealerIndex]?.id === meNow.id
      : gameState.phase === "betting" || gameState.phase === "playing"
        ? gameState.players[gameState.currentPlayerIndex]?.id === meNow.id
        : false);
  useTurnAlert(meActiveNow, "Sua vez!");
  const turnKey = gameState ? `${gameState.phase}:${gameState.currentRoundCards}:${gameState.currentPlayerIndex}:${gameState.tableCards.length}` : "";
  useEffect(() => {
    if (meActiveNow && !document.hidden) sfx.yourTurn();
  }, [turnKey, meActiveNow]);

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
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 w-full max-w-md shadow-2xl space-y-3">
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
                  <ScoreDelta value={p.score} from={p.score - Math.abs(p.bet !== null && p.bet !== p.tricks ? p.bet - p.tricks : 0)}>
                    {(shown) => <>💀 {shown}</>}
                  </ScoreDelta>
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
    const meOver = sorted.find((p) => p.name === playerName);
    // Só mostra taxa de acerto se este cliente viu (quase) todas as rodadas — quem recarregou no meio tem números pela metade.
    const sawAllRounds = roundStats.rounds > 0 && roundStats.rounds >= gameState.currentRoundCards - 1;
    const hitsLine = (name: string) => (sawAllRounds ? `✅ acertou ${roundStats.hits[name] ?? 0} de ${roundStats.rounds} rodadas` : "");
    return (
      <div className="flex flex-col items-center justify-center flex-1">
        <GameOverPanel
          headline={resultHeadline(sorted.map((p) => ({ id: p.id, name: p.name })), sorted[0]?.id ?? null, meOver?.id ?? null)}
          myStats={meOver && sawAllRounds ? [hitsLine(meOver.name), `💀 ${meOver.score} pts no total`] : []}
          rows={sorted.map((p) => ({
            id: p.id,
            name: p.name,
            detail: `${p.score} pts`,
            stats: hitsLine(p.name),
            isMe: p.name === playerName,
          }))}
          actions={[
            {
              label: "Começar Nova Partida",
              primary: true,
              onClick: () =>
                send({
                  type: "start_game",
                  players: initialPlayers.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
                }),
            },
            { label: "Voltar ao Menu", onClick: () => router.push("/lobby/fodinha"), icon: <LogOut className="w-4 h-4" /> },
          ]}
        />
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

  const isNarrowScreen = viewportWidth > 0 && viewportWidth < 640;
  const TABLE_CARD_SCALE = isNarrowScreen ? 0.75 : 0.6;

  // Assentos em GRADE, não numa elipse com posição absoluta: fileira de cima +
  // coluna esquerda/direita ao lado da mesa. Cada coisa ganha a própria
  // célula, então nada consegue sobrepor nada (a elipse jogava a caixa do
  // assento de cima bem em cima do círculo da mesa). Ordem de jogo continua
  // horária na tela: eu (embaixo) → esquerda (de baixo pra cima) → topo (da
  // esquerda pra direita) → direita (de cima pra baixo). No celular não cabe
  // ninguém do lado da mesa, então todo mundo vai pra fileira de cima.
  const myIndex = gameState.players.findIndex((pl) => pl.name === playerName);
  const othersInPlayOrder = gameState.players
    .map((_, i) => gameState.players[(myIndex + 1 + i) % gameState.players.length])
    .filter((p) => p.name !== playerName);
  const sideSeatCount = isNarrowScreen || othersInPlayOrder.length < 3 ? 0 : Math.floor((othersInPlayOrder.length - 1) / 2);
  const leftSeats = othersInPlayOrder.slice(0, sideSeatCount);
  const topSeats = othersInPlayOrder.slice(sideSeatCount, othersInPlayOrder.length - sideSeatCount);
  const rightSeats = othersInPlayOrder.slice(othersInPlayOrder.length - sideSeatCount);


  // Tamanhos (rem) do leque de versos / carta espiada nas caixas dos oponentes.
  // Cada verso é posicionado na mão (left = i * passo), dentro de um wrapper do
  // tamanho JÁ reduzido — `scale` sozinho não encolhe o espaço reservado no
  // layout, e o leque antigo reservava ~350px de largura no desktop.
  const seatCardW = isNarrowScreen ? 4.32 : 7.2;
  const seatCardH = isNarrowScreen ? 5.76 : 10.08;
  const fanScale = isNarrowScreen ? 0.4 : 0.45;
  const fanStep = isNarrowScreen ? 0.42 : 0.85;
  const fanMax = isNarrowScreen ? 5 : 6;
  const peekScale = isNarrowScreen ? 0.6 : 0.55;

  const renderSeat = (p: GameState["players"][number]) => {
    const isActive = activePlayerId === p.id;
    const backCount = Math.min(p.cards.length, fanMax);
    // Altura da área de cartas SEMPRE reservada (mesmo com 0 cartas), pra caixa
    // não encolher no fim da rodada e a mesa não pular de tamanho.
    const areaScale = isBlindRound ? peekScale : fanScale;
    const areaW = seatCardW * areaScale + (isBlindRound ? 0 : Math.max(0, backCount - 1) * fanStep);
    const areaH = seatCardH * areaScale;
    return (
      <div key={p.id}
        ref={(el) => { if (el) seatElRefs.current.set(p.id, el); else seatElRefs.current.delete(p.id); }}
        className="flex flex-col items-center min-w-0">
        {/* Faixa acima da caixa (seta "é a vez dele" + montinhos de vazas
            ganhas) com altura fixa, sempre reservada — assim a caixa não pula
            quando a vez muda ou alguém ganha uma vaza. */}
        <div className="relative h-9 sm:h-12 w-full">
          {isActive && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><ActiveArrow direction="down" /></div>
          )}
          {p.wonCards.length > 0 && (
            <div className="absolute bottom-0.5 left-1/2 ml-5 sm:ml-7 flex -space-x-2.5 sm:-space-x-4">
              {p.wonCards.map((trick, i) => (
                <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="relative shrink-0 w-[1.3rem] h-[1.73rem] sm:w-[2.16rem] sm:h-[3.03rem]">
                  {trick.map((c, cIdx) => (
                    <div key={cIdx} className="absolute top-0 left-0 origin-top-left"
                      style={{ transform: `scale(0.3) rotate(${(cIdx - trick.length / 2) * 6}deg)`, zIndex: cIdx }}>
                      <PlayingCard card={c} theme={theme} />
                    </div>
                  ))}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className={`relative bg-zinc-900 border rounded-lg sm:rounded-xl px-1.5 pt-2 pb-1 sm:px-3 sm:pt-3 sm:pb-2 text-center shadow-lg transition-colors w-fit max-w-full ${
          manyOpponents ? "min-w-[5rem] sm:min-w-32" : "min-w-[5.5rem] sm:min-w-40"
        } ${isActive ? "border-yellow-400 shadow-yellow-400/30" : "border-zinc-800"}`}>
          {/* Selo "APOSTANDO/ESCOLHENDO" em cima da borda — fora do fluxo, não
              muda a altura da caixa. */}
          {isActive && activeActionLabel && (
            // Fundo sólido atrás do selo: o dele é translúcido e deixava a borda
            // amarela da caixa aparecer "riscando" o texto.
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 rounded-full bg-zinc-900">
              <ActiveBadge label={activeActionLabel} className="" />
            </div>
          )}
          <div className="flex items-center justify-center gap-1 sm:gap-1.5">
            <PlayerAvatar avatarUrl={p.avatarUrl} name={p.name}
              className={manyOpponents ? "w-4 h-4 sm:w-6 sm:h-6 text-[9px] sm:text-xs" : "w-5 h-5 sm:w-7 sm:h-7 text-[10px] sm:text-sm"} />
            <div className="font-bold text-white text-[11px] sm:text-sm whitespace-nowrap truncate max-w-[5.5rem] sm:max-w-[9rem]">{p.name}</div>
          </div>
          <div className="flex justify-center gap-x-1.5 sm:gap-x-2 text-[10px] sm:text-xs leading-tight mt-0.5 whitespace-nowrap">
            <span className="text-red-400 font-bold"><ScoreDelta value={p.score}>{(shown) => <>💀 {shown}</>}</ScoreDelta><span className="hidden sm:inline"> pts</span></span>
            <span className="text-zinc-400">✅ {p.tricks}/{p.bet ?? "?"}</span>
          </div>
          <div className="relative mx-auto mt-1" style={{ width: `${areaW}rem`, height: `${areaH}rem` }}>
            {isBlindRound
              ? p.cards.length > 0 && (
                  // Rodada cega: você vê a carta dos outros, só não a sua.
                  <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${peekScale})` }}>
                    <PlayingCard card={p.cards[0]} theme={theme} />
                  </div>
                )
              : Array.from({ length: backCount }).map((_, i) => (
                  <div key={i} className="absolute top-0 origin-top-left"
                    style={{ left: `${i * fanStep}rem`, transform: `scale(${fanScale})` }}>
                    <PlayingCard card={p.cards[0]} hidden theme={theme} backIndex={i} />
                  </div>
                ))}
          </div>
          <div className="text-zinc-500 text-[10px] sm:text-xs leading-tight mt-0.5">🃏 {p.cards.length} cartas</div>
        </div>
      </div>
    );
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
  // Reduzido um pouco (era 22/50): o leque girado precisa de uma margem
  // extra além da largura "reta" das cartas, senão as pontas do leque
  // furam pra fora da viewport (o giro empurra os cantos de cima pra fora,
  // não só a sobreposição horizontal calculada aqui).
  // Largura útil = viewport - padding da página - folga pro giro do leque (as
  // cartas das pontas giram pra fora). Fixo em 18.5rem cortava a 1ª carta
  // num celular de 360px com 9 cartas na mão.
  const handAvailableRem = Math.max(
    12,
    isNarrowScreen ? Math.min(18.5, (viewportWidth - 96) / 16) : Math.min(44, (viewportWidth - 160) / 16)
  );
  const handOverlapRem =
    orderedHandCards.length <= 1
      ? 0
      : Math.min(
          handCardWRem * 0.72,
          Math.max(handCardWRem * 0.22, handCardWRem - (handAvailableRem - handCardWRem) / (orderedHandCards.length - 1))
        );
  // Leque de verdade (cada carta gira um pouco em torno de um pivô abaixo da
  // mão — ver transformOrigin no HandCard), não só cartas retas sobrepostas:
  // ângulo por carta encolhe com a quantidade pra nunca passar de ~26° de
  // ponta a ponta. Mantido moderado de propósito: o giro empurra as pontas
  // do leque pra fora da largura "reta" calculada acima, então um leque
  // largo demais fura a viewport mesmo com handAvailableRem reduzido.
  const handFanStepDeg = orderedHandCards.length > 1 ? Math.min(5, 26 / (orderedHandCards.length - 1)) : 0;

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
    router.push("/lobby/fodinha");
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
          <FeedHistoryButton
            align="left"
            entries={feed.entries}
            className="flex items-center justify-center bg-black/50 hover:bg-black/70 border border-white/10 text-zinc-300 hover:text-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl backdrop-blur-sm transition-all shrink-0"
            iconClassName="w-3 h-3 sm:w-3.5 sm:h-3.5"
          />
          <button
            onClick={() => {
              const next = !soundOn;
              sfx.setEnabled(next);
              setSoundOn(next);
              if (next) sfx.unlock();
            }}
            aria-label={soundOn ? "Desligar som" : "Ligar som"}
            title={soundOn ? "Desligar som" : "Ligar som"}
            className="flex items-center justify-center bg-black/50 hover:bg-black/70 border border-white/10 text-zinc-300 hover:text-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl backdrop-blur-sm transition-all shrink-0">
            {soundOn ? <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <VolumeX className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
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

        {/* ── MESA — grade, não posição absoluta: fileira de cima com
             oponentes e, embaixo dela, [esquerda | mesa | direita]. Cada coisa
             tem a própria célula, então nenhuma caixa de jogador consegue cobrir
             a mesa (a elipse antiga jogava o assento de cima bem em cima do
             círculo). A mesa é a única peça elástica: ocupa o que sobrar da
             célula do meio. pt-7 no celular: a toolbar fixa (Menu / Votar)
             fica por cima do topo da página ali. ── */}
        <div ref={mesaRef} className="flex-1 min-h-0 relative flex flex-col pt-7 sm:pt-0">
          {topSeats.length > 0 && (
            <div className="shrink-0 flex justify-center items-end gap-1.5 sm:gap-6 px-1">
              {topSeats.map(renderSeat)}
            </div>
          )}

          <div className="flex-1 min-h-0 flex">
            {sideSeatCount > 0 && (
              <div className="flex-1 min-w-0 flex flex-col-reverse items-center justify-center gap-2">
                {leftSeats.map(renderSeat)}
              </div>
            )}

            {/* Célula da mesa. Também é onde soltar uma carta arrastada pra
                jogar (tableDropRef) — a célula inteira, não só o círculo, pra o
                alvo ser generoso. [container-type:size] dá ao círculo unidades
                cqh/cqw que medem ESTA célula: ele cresce até o teto
                (--table-cap) ou até encostar na borda dela, o que vier antes. */}
            <div ref={tableDropRef}
              className={`${sideSeatCount > 0 ? "flex-[2]" : "flex-1"} min-w-0 relative [container-type:size]`}>
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border-2 border-dashed border-zinc-700/50 bg-cover bg-center [--table-cap:21rem] sm:[--table-cap:24rem]"
                style={{
                  width: "min(var(--table-cap), calc(100cqh - 1rem), calc(100cqw - 1rem))",
                  aspectRatio: "1",
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.55),rgba(0,0,0,0.55)), url(${TABLE_BG[theme] ?? TABLE_BG.aquarium})`,
                }}>
                {/* Sem overflow-hidden de propósito: cartas jogadas em cima da
                    mesa não podem ser cortadas pelo formato redondo. */}
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
                        scale: (isWinning ? 1.15 : 1) * TABLE_CARD_SCALE,
                        x: (idx - (gameState.tableCards.length - 1) / 2) * (isNarrowScreen ? 22 : 30),
                        rotate: (idx - 1) * 7,
                        zIndex: isWinning ? 5 : idx,
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

              {/* Última vaza da rodada, parada na mesa antes do placar aparecer */}
              {gameState.phase === "round_end" && !scoreboardReady && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="absolute top-1 left-1/2 -translate-x-1/2 z-20 text-yellow-300 text-xs font-bold uppercase tracking-wide whitespace-nowrap">
                  Última jogada da rodada
                </motion.div>
              )}

              {/* Anúncio público de como o dealer embaralhou — no topo da célula
                  da mesa (antes ficava no topo da tela, cobrindo a seta de vez
                  do jogador de cima). */}
              <AnimatePresence>
                {shuffleAnnouncement && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="absolute top-1 left-1/2 -translate-x-1/2 z-40 max-w-full truncate bg-black/60 border border-yellow-500/40 text-yellow-200 text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm whitespace-nowrap">
                    {shuffleAnnouncement.dealerName} embaralhou com {shuffleAnnouncement.label}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Soma das apostas x vazas da rodada (só enquanto se aposta) */}
              {gameState.phase === "betting" && (
                <div className="absolute bottom-1 left-1/2 z-20 -translate-x-1/2">
                  <BetMeter
                    sum={gameState.players.reduce((n, p) => n + (p.bet ?? 0), 0)}
                    cards={gameState.currentRoundCards}
                    pending={gameState.players.filter((p) => p.bet === null).length}
                  />
                </div>
              )}

              {/* Painéis de embaralhar / apostar: por cima da mesa (que está
                  vazia nessas fases), centralizados na célula — não empurram
                  mais o layout nem roubam altura da mesa. */}
              <div className="absolute inset-0 z-30 flex items-center justify-center p-1 pointer-events-none">
                {gameState.phase === "shuffling" && (
                  <div className="pointer-events-auto max-w-full">
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
                  </div>
                )}

                {me && gameState.phase === "betting" &&
                  gameState.players[gameState.currentPlayerIndex]?.name === playerName && (
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                      className="pointer-events-auto max-w-full bg-red-950/95 border border-red-500 p-2 sm:p-4 rounded-xl text-center space-y-2 sm:space-y-3 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                      <h3 className="text-white font-bold text-sm sm:text-lg">Sua vez! Quantas você faz?</h3>
                      {forbiddenBet !== null && forbiddenBet >= 0 && forbiddenBet <= me.cards.length && (
                        <p className="rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-200 sm:text-sm">
                          🚫 Você não pode apostar {forbiddenBet}: a soma fecharia em {gameState.currentRoundCards} e alguém precisa errar
                        </p>
                      )}
                      <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center">
                        {Array.from({ length: me.cards.length + 1 }).map((_, i) => (
                          <Button key={i} onClick={() => sendBet(i)} variant="secondary" disabled={i === forbiddenBet}
                            className={`w-8 h-8 sm:w-10 sm:h-10 text-sm sm:text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed ${i === forbiddenBet ? "line-through ring-1 ring-red-500/70" : ""}`}>{i}</Button>
                        ))}
                      </div>
                    </motion.div>
                  )}
              </div>
            </div>

            {sideSeatCount > 0 && (
              <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-2">
                {rightSeats.map(renderSeat)}
              </div>
            )}
          </div>

          {/* Vaza voando pro vencedor: sai do centro da mesa e vai até a caixa
              MEDIDA de quem ganhou (ou a minha, embaixo). z-40, por cima de tudo. */}
          <AnimatePresence>
            {trickResult?.path && (() => {
              const { from, to } = trickResult.path;
              return (
                <motion.div key="trick-flyout"
                  initial={{ left: from.x, top: from.y, opacity: 1, scale: TABLE_CARD_SCALE }}
                  animate={{ left: from.x, top: from.y, opacity: 1, scale: TABLE_CARD_SCALE }}
                  exit={{ left: to.x, top: to.y, opacity: 0, scale: 0.12 }}
                  transition={{ duration: 0.8, ease: "easeIn" }}
                  className="absolute z-40 pointer-events-none">
                  {trickResult.cards.map((tc, idx) => (
                    <div key={idx} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ transform: `rotate(${idx * 12}deg)` }}>
                      <PlayingCard card={tc.card} theme={theme} />
                    </div>
                  ))}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* ── MY AREA ── Celular/tablet: [vira + vazas + eu] numa linha e a mão
             embaixo. Tela larga (xl): tudo numa linha só, [vira + vazas | mão |
             eu] — sobra muito mais altura pra mesa, que era o que faltava em
             notebooks (ex: 1536x730). `xl:contents` faz os filhos da linha de
             cima virarem itens da grade direto. */}
        {me && (
          // pb-4/pb-5: as cartas das pontas do leque giram em volta de um pivô
          // ABAIXO da mão, então os cantos de baixo delas descem ~10-15px além
          // da linha da mão — sem essa folga o overflow-hidden do board cortava.
          <div className="shrink-0 flex flex-col items-center gap-1 sm:gap-2 pb-4 sm:pb-5 xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-end xl:gap-6">
            <div className="flex items-end gap-1 sm:gap-4 justify-center px-1 sm:px-4 xl:contents">
              {/* Célula da esquerda (tela larga): histórico à esquerda, vira + vazas à direita. O histórico
                  ocupa o que sobrar ao lado das vazas (encolhe quando elas crescem e some se ficar estreito
                  demais — ver .fodinha-feed), então nunca fica por cima de nada. */}
              <div className="flex items-end gap-1 sm:gap-4 xl:col-start-1 xl:row-start-1 xl:w-full xl:min-w-0 xl:justify-between">
                <div className="fodinha-feed relative hidden h-0 min-w-0 max-w-[16rem] flex-1 self-end xl:block">
                  <div className="fodinha-feed-inner absolute inset-x-0 bottom-0">
                    <FeedList entries={feed.entries} visible={5} />
                  </div>
                </div>
              <div className="flex shrink-0 items-end gap-1 sm:gap-4">
                {/* Vira. `scale-[]` sozinho não reduz o espaço reservado no
                    layout (só a pintura), então o wrapper fixa o tamanho já
                    reduzido. */}
                {gameState.vira && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <span className="text-zinc-400 font-bold uppercase tracking-widest text-[9px] whitespace-nowrap">Vira</span>
                    <div className="w-[2.38rem] h-[3.17rem] sm:w-[4.32rem] sm:h-[6.05rem] overflow-hidden">
                      <div className="scale-[0.55] sm:scale-[0.6] origin-top-left">
                        <PlayingCard card={gameState.vira} theme={theme} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Won-cards pile — wrapper com o tamanho JÁ reduzido, pelo
                    mesmo motivo da vira acima. */}
                <div className="flex gap-0.5 sm:gap-1 items-end min-w-[36px] sm:min-w-[60px]">
                  <AnimatePresence>
                    {me.wonCards && me.wonCards.map((trick, trickIdx) => (
                      <div key={trickIdx} className="w-[0.7rem] h-[0.96rem] sm:w-12 sm:h-[4.5rem] overflow-hidden">
                        <motion.div initial={{ scale: 0, y: 20 }}
                          animate={{ scale: isNarrowScreen ? 0.35 : 0.5, y: 0 }}
                          exit={{ scale: 0 }} className="relative w-8 h-11 sm:w-24 sm:h-36 origin-bottom-left">
                          {trick.map((c, cIdx) => (
                            <div key={cIdx} className="absolute bottom-0 left-0"
                              style={{ transform: `rotate(${(cIdx - trick.length / 2) * 6}deg)`, zIndex: cIdx }}>
                              <PlayingCard card={c} theme={theme} />
                            </div>
                          ))}
                        </motion.div>
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
              </div>

              {/* My avatar */}
              <div className="flex flex-col items-center gap-1 shrink-0 xl:col-start-3 xl:row-start-1 xl:justify-self-start">
                {isMeActive && <ActiveArrow direction="down" />}
                <div ref={myBoxRef} className={`bg-zinc-900 p-1.5 sm:p-3 rounded-t-lg sm:rounded-t-xl xl:rounded-xl border-t border-l border-r xl:border-b w-fit min-w-24 sm:min-w-44 max-w-[55vw] sm:max-w-none text-center relative z-20 transition-all ${
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

                  <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                    <PlayerAvatar avatarUrl={me.avatarUrl} name={me.name} className="w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-sm" />
                    <div className="text-[11px] sm:text-base font-bold text-white whitespace-nowrap">
                      {me.name}
                    </div>
                  </div>
                  {isMeActive && activeActionLabel && (
                    <div className="flex justify-center"><ActiveBadge label={activeActionLabel} /></div>
                  )}
                  <div className="text-red-400 font-bold text-[10px] sm:text-sm"><ScoreDelta value={me.score}>{(shown) => <>💀 {shown}</>}</ScoreDelta> pts</div>
                  <div className="text-zinc-400 text-[10px] sm:text-xs">Vazas: {me.tricks} / {me.bet !== null ? me.bet : "?"}</div>
                </div>
              </div>
            </div>

            {/* Minha mão — arraste uma carta pra reorganizar, ou solte ela em
                cima da mesa pra jogar. Um toque simples (sem arrastar) não joga
                nada, de propósito: dá pra reorganizar sem jogar sem querer. */}
            <div ref={handRowRef} className="flex items-end justify-center w-full px-1 sm:px-4 relative z-30 xl:col-start-2 xl:row-start-1 xl:w-auto">
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
                  fanAngle={(i - (orderedHandCards.length - 1) / 2) * handFanStepDeg}
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
