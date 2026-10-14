"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Bot, Eye, HelpCircle, LogOut, SmilePlus, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedHistoryButton, FeedList } from "@/components/feed/EventFeed";
import { GameOverPanel } from "@/components/GameOverPanel";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { resultHeadline } from "@/lib/gameResult";
import { COLORS, FINISHED } from "@/lib/ludo/board";
import { BOT_LEVEL_LABEL } from "@/lib/ludo/bot";
import { LudoPlayer, legalMoves } from "@/lib/ludo/engine";
import { LUDO_EMOJIS, LUDO_ERROR_LABEL } from "@/lib/ludo/protocol";
import { myChips, standingLine } from "@/lib/ludo/summary";
import { useTurnAlert } from "@/lib/useTurnAlert";
import { CORNER_AREA, LUDO_COLORS } from "./colors";
import { LudoBoardView } from "./LudoBoardView";
import { LudoCenterDice } from "./LudoCenterDice";
import { LudoDice } from "./LudoDice";
import { LudoRulesDialog } from "./LudoRules";
import { sfx } from "./sfx";
import { useLudoAnimator } from "./useLudoAnimator";
import { useLudoFeed } from "./useLudoFeed";
import { FloatingEmoji, LudoSession, isSoloVsBots } from "./useLudoSession";

// ── Painel de jogador ───────────────────────────────────────────────────────

// Uma barrinha por peça: enche conforme ela anda (acompanha a animação do tabuleiro) e acende ao chegar em casa.
function PieceBars({ progress, color }: { progress: number[]; color: (typeof LUDO_COLORS)[keyof typeof LUDO_COLORS] }) {
  return (
    <div className="flex items-center gap-1">
      {progress.map((p, i) => {
        const done = p === FINISHED;
        const fill = Math.max(0, Math.min(1, (p + 1) / (FINISHED + 1)));
        return (
          <span
            key={i}
            className="relative h-2 w-5 overflow-hidden rounded-full sm:h-2.5 sm:w-7"
            style={{ background: "rgba(255,255,255,0.1)", boxShadow: done ? `0 0 7px ${color.main}` : undefined }}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
              style={{ width: `${fill * 100}%`, background: done ? color.light : color.main }}
            />
          </span>
        );
      })}
    </div>
  );
}

function PlayerPanel({
  player,
  progress,
  area,
  active,
  isMe,
  emojis,
  children,
}: {
  player: LudoPlayer;
  /** Progresso de cada peça como está desenhado agora (acompanha a animação). */
  progress: number[];
  area: string;
  active: boolean;
  isMe: boolean;
  emojis: FloatingEmoji[];
  children?: ReactNode;
}) {
  const t = LUDO_COLORS[player.color];
  const finished = progress.filter((x) => x === FINISHED).length;
  const away = !player.bot && !player.connected;
  return (
    <div
      data-area={area}
      className="ludo-panel relative min-w-0"
      style={{ gridArea: area, opacity: away ? 0.6 : 1 }}
    >
      <div
        className="relative flex h-full items-center gap-2 rounded-2xl border bg-black/60 px-2 py-1.5 backdrop-blur-md transition-[box-shadow,border-color] duration-300 sm:gap-2.5 sm:px-3 sm:py-2"
        style={{
          borderColor: active ? t.main : "rgba(255,255,255,0.12)",
          boxShadow: active ? `0 0 0 2px ${t.main}, 0 0 26px ${t.main}88` : "none",
        }}
      >
        <div className="relative shrink-0">
          {player.bot ? (
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full sm:h-11 sm:w-11"
              style={{ background: t.main, color: t.ink }}
            >
              <Bot className="h-5 w-5" />
            </div>
          ) : (
            <div className="rounded-full" style={{ boxShadow: `0 0 0 2.5px ${t.main}` }}>
              <PlayerAvatar avatarUrl={player.avatarUrl} name={player.name} className="h-9 w-9 text-sm sm:h-11 sm:w-11 sm:text-base" />
            </div>
          )}
          <AnimatePresence>
            {emojis
              .filter((e) => e.fromPlayerId === player.id)
              .map((e) => (
                <motion.span
                  key={e.id}
                  className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 text-3xl"
                  initial={{ y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ y: -52, opacity: [0, 1, 1, 0], scale: 1.3 }}
                  transition={{ duration: 2, ease: "easeOut" }}
                >
                  {e.emoji}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8rem] font-bold leading-tight text-white sm:text-sm">
            {player.name}
            {isMe && <span className="ml-1 font-semibold text-zinc-400">(você)</span>}
          </p>
          <p className="truncate text-[0.65rem] leading-tight text-zinc-400 sm:text-xs">
            {player.bot ? `Bot ${BOT_LEVEL_LABEL[player.bot]}` : away ? "Desconectado — bot assume" : " "}
          </p>
          <div className="mt-1 flex items-center gap-1.5" aria-label={`${finished} de 4 peças em casa`}>
            <PieceBars progress={progress} color={t} />
            <span className="text-[0.6rem] font-semibold text-zinc-400 sm:text-xs">{finished}/4</span>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

// ── Tela do jogo ────────────────────────────────────────────────────────────

interface LudoGameProps {
  session: LudoSession;
  onExit: () => void;
  /** Texto curto no topo (ex.: "Sala ABCD" / "Contra bots"). */
  title: string;
}

export default function LudoGame({ session, onExit, title }: LudoGameProps) {
  const { state, me } = session;
  const view = useLudoAnimator(state);
  const shown = view.state;

  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Só avisos do servidor ("não é a sua vez"): o que acontece no jogo vai pro histórico.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const sentFor = useRef("");
  const feed = useLudoFeed(shown, me);

  // localStorage só existe no navegador: lê depois de montar pra não divergir do HTML do servidor.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSoundOn(sfx.isEnabled()), []);

  // ── derivados do estado (sempre do estado "mostrado", que acompanha a animação)
  const players = shown?.players ?? [];
  const current: LudoPlayer | undefined = shown ? shown.players[shown.turn] : undefined;
  const myPlayer = players.find((p) => p.id === me);
  const isMyTurn = !!current && current.id === me;
  const gameOver = shown?.phase === "game_over";
  const moves = useMemo(
    () => (shown && isMyTurn && shown.phase === "moving" ? legalMoves(shown) : []),
    [shown, isMyTurn]
  );
  const canRoll = !!shown && isMyTurn && shown.phase === "rolling" && !view.busy;
  // Peça na base vs. peça empilhada: se só existe uma jogada que muda algo, o
  // servidor joga sozinho — aqui o jogador só decide quando há escolha de verdade.
  const rotation = myPlayer ? (3 - COLORS.indexOf(myPlayer.color) + 4) % 4 : 0;

  // Uma ação por situação: cliques repetidos antes de o servidor responder são ignorados.
  const actionKey = shown ? `${shown.moveSeq}:${shown.rollSeq}:${shown.phase}` : "";
  const claimAction = () => {
    if (sentFor.current === actionKey) return false;
    sentFor.current = actionKey;
    // Se a mensagem se perder (reconexão), libera de novo depois de um tempo.
    const key = actionKey;
    setTimeout(() => {
      if (sentFor.current === key) sentFor.current = "";
    }, 3000);
    return true;
  };
  const roll = () => {
    if (!canRoll || !claimAction()) return;
    sfx.unlock();
    session.send({ type: "roll" });
  };
  const movePiece = (piece: number) => {
    if (!claimAction()) return;
    session.send({ type: "move", piece });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // Aba em segundo plano e a bola está comigo: o título da aba pisca.
  useTurnAlert(!gameOver && isMyTurn && (canRoll || moves.length > 0), "Sua vez!");

  const turnKey = shown ? `${shown.turn}:${shown.moveSeq}:${shown.phase}` : "";
  useEffect(() => {
    if (shown && canRoll && shown.phase === "rolling") sfx.yourTurn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, canRoll]);

  const endSoundFor = useRef(0);
  useEffect(() => {
    if (!shown || !gameOver || endSoundFor.current === shown.gameNumber) return;
    endSoundFor.current = shown.gameNumber;
    if (shown.winnerId === me) sfx.win();
    else if (myPlayer) sfx.lose();
  }, [shown, gameOver, me, myPlayer]);

  // Erros do servidor viram aviso rápido.
  useEffect(() => {
    if (!session.error) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- converte o erro do servidor em aviso e já o consome
    setToast({ id: Date.now(), text: LUDO_ERROR_LABEL[session.error] ?? "Ação não permitida." });
    session.clearError();
  }, [session]);

  if (!shown) return null;

  // ── texto de status
  let statusText: string;
  let statusTone = "text-white";
  if (gameOver) {
    statusText = `${players.find((p) => p.id === shown.winnerId)?.name ?? "Alguém"} venceu!`;
  } else if (!current) {
    statusText = "";
  } else if (isMyTurn && shown.phase === "rolling") {
    statusText = shown.extraTurn ? "Joga de novo!" : "Sua vez — role o dado!";
    statusTone = "text-yellow-300";
  } else if (isMyTurn && shown.phase === "moving" && moves.length > 0) {
    statusText = "Escolha uma peça";
    statusTone = "text-yellow-300";
  } else if (shown.phase === "moving" && legalMoves(shown).length === 0 && shown.dice !== null) {
    statusText = shown.forfeit ? "Três 6 seguidos!" : "Sem jogada possível";
    statusTone = "text-zinc-300";
  } else {
    statusText = `Vez de ${current.name}`;
  }
  // Aviso do servidor ocupa a linha de status por uns segundos.
  if (toast) {
    statusText = toast.text;
    statusTone = "text-red-300";
  }
  const extraLabel =
    shown.extraTurn && !gameOver && !toast
      ? { six: "tirou 6", capture: "capturou", home: "chegou em casa" }[shown.extraTurn]
      : null;

  const isSpectator = !myPlayer;
  const soloVsBots = isSoloVsBots(shown, me);
  // Reações só fazem sentido com mais alguém de verdade na sala.
  const hasOtherHumans = players.some((p) => !p.bot && p.id !== me);
  const activeColor = !gameOver && current ? current.color : null;

  return (
    <LayoutGroup>
      <div className="relative flex min-h-0 flex-1 flex-col gap-1.5" onPointerDownCapture={() => sfx.unlock()}>
        {/* topo */}
        <header className="flex shrink-0 items-center gap-2 pr-11 sm:pr-14">
          <Button variant="secondary" size="sm" onClick={() => setConfirmLeave(true)} className="gap-1 bg-black/50 text-white hover:bg-black/70">
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sair</span>
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-black tracking-wide text-white/90">{title}</span>
          {session.status === "reconnecting" && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
              <WifiOff className="h-3 w-3" /> reconectando
            </span>
          )}
          {isSpectator && (
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-zinc-200">
              <Eye className="h-3 w-3" /> assistindo
            </span>
          )}
          <div className="flex items-center gap-1">
            <FeedHistoryButton entries={feed.entries} />
            {hasOtherHumans && !isSpectator && (
              <button
                onClick={() => setShowEmojis((v) => !v)}
                aria-label="Reações"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => {
                const next = !soundOn;
                sfx.setEnabled(next);
                setSoundOn(next);
                if (next) sfx.unlock();
              }}
              aria-label={soundOn ? "Desligar som" : "Ligar som"}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowRules(true)}
              aria-label="Regras"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* status */}
        <div className="flex h-7 shrink-0 items-center justify-center gap-2">
          <AnimatePresence mode="wait">
            <motion.p
              key={statusText}
              className={`truncate text-sm font-black sm:text-base ${statusTone}`}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {statusText}
            </motion.p>
          </AnimatePresence>
          {extraLabel && (
            <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-yellow-300 sm:text-xs">
              {extraLabel}
            </span>
          )}
        </div>

        {/* palco: painéis + tabuleiro */}
        <div className="ludo-stage">
          <div className="ludo-layout">
            {players.map((p) => {
              const corner = (COLORS.indexOf(p.color) + rotation) % 4;
              const area = CORNER_AREA[corner];
              const isActive = !gameOver && current?.id === p.id;
              return (
                <PlayerPanel
                  key={p.id}
                  player={p}
                  progress={view.pieces[p.id] ?? p.pieces}
                  area={area}
                  active={isActive}
                  isMe={p.id === me}
                  emojis={session.emojis}
                >
                  {isActive && (
                    <motion.div
                      layoutId="ludo-dice"
                      transition={{ type: "spring", stiffness: 260, damping: 28 }}
                      className="shrink-0"
                      style={{ width: "var(--dice)", height: "var(--dice)" }}
                    >
                      <LudoDice
                        value={view.dice}
                        rolling={view.diceRolling}
                        rollKey={view.diceKey}
                        canRoll={canRoll && p.id === me}
                        onRoll={roll}
                        color={LUDO_COLORS[p.color]}
                      />
                    </motion.div>
                  )}
                </PlayerPanel>
              );
            })}

            <div style={{ gridArea: "board" }} className="relative min-h-0 min-w-0">
              <LudoBoardView
                view={view}
                players={players}
                rotation={rotation}
                activeColor={activeColor}
                moves={moves}
                myColor={myPlayer?.color ?? null}
                onMove={movePiece}
              />
              {/* o dado no centro: pede o clique na minha vez e rola à vista na dos outros */}
              {!gameOver && current && (
                <LudoCenterDice view={view} canRoll={canRoll} onRoll={roll} color={LUDO_COLORS[current.color]} />
              )}
            </div>

            {/* histórico: ocupa o vão entre os painéis (só em tela larga; no resto, o botão do topo) */}
            <div className="ludo-feed">
              <FeedList entries={feed.entries} visible={9} />
            </div>
          </div>
        </div>

        {/* reações */}
        <AnimatePresence>
          {showEmojis && (
            <motion.div
              className="absolute right-0 top-10 z-40 flex gap-1 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl backdrop-blur sm:right-1 sm:top-12"
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {LUDO_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    session.sendEmoji(e);
                    sfx.emoji();
                    setShowEmojis(false);
                  }}
                  className="rounded-lg p-1 text-xl transition-transform hover:scale-125 hover:bg-white/10 sm:text-2xl"
                >
                  {e}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* fim de partida */}
      <AnimatePresence>
        {gameOver && !view.busy && shown.standings && (
          <GameOverPanel
            key="game-over"
            headline={resultHeadline(
              shown.standings.map((s) => ({ id: s.playerId, name: s.name })),
              shown.winnerId,
              myPlayer ? me : null
            )}
            myStats={myChips(shown.standings.find((s) => s.playerId === me))}
            rows={shown.standings.map((s) => ({
              id: s.playerId,
              name: s.name,
              color: LUDO_COLORS[s.color].main,
              detail: `${s.finished}/4 em casa`,
              stats: standingLine(s),
              isMe: s.playerId === me,
            }))}
            actions={[
              ...(!isSpectator
                ? [{ label: soloVsBots ? "Jogar de novo" : "Voltar para a sala", onClick: session.playAgain, primary: true }]
                : []),
              { label: "Sair", onClick: onExit, icon: <LogOut className="h-4 w-4" /> },
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{showRules && <LudoRulesDialog onClose={() => setShowRules(false)} />}</AnimatePresence>

      <AnimatePresence>
        {confirmLeave && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmLeave(false)}
          >
            <motion.div
              className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-1 text-lg font-black text-white">Sair da partida?</p>
              <p className="mb-4 text-sm text-zinc-400">
                {isSpectator
                  ? "Você deixa de assistir a esta sala."
                  : "Um bot assume as suas peças até você voltar — a partida fica salva na sala."}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmLeave(false)}>
                  Continuar
                </Button>
                <Button className="flex-1 bg-red-600 text-white hover:bg-red-700" onClick={onExit}>
                  Sair
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
