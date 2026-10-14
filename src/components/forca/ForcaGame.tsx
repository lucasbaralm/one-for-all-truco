"use client";

/* Esta tela é, em grande parte, reação a eventos do servidor (letras, palavras, fim de
   rodada) que disparam som, aviso e animação — por isso os efeitos abaixo atualizam estado. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Eye, Heart, HelpCircle, LogOut, SmilePlus, Target, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedHistoryButton, FeedList } from "@/components/feed/EventFeed";
import { GameOverPanel } from "@/components/GameOverPanel";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ScoreDelta } from "@/components/game/ScoreDelta";
import { WORD_PENALTY } from "@/lib/forca/engine";
import type { ForcaPlayerView } from "@/lib/forca/engine";
import { BOT_LEVEL_LABEL } from "@/lib/forca/labels";
import { FORCA_ERROR_LABEL } from "@/lib/forca/protocol";
import { myChips, resultLabel, standingLine } from "@/lib/forca/summary";
import { normalize } from "@/lib/forca/words";
import { resultHeadline } from "@/lib/gameResult";
import { REACTION_EMOJIS } from "@/lib/party-codes";
import { playerColor } from "@/lib/playerColors";
import { useTurnAlert } from "@/lib/useTurnAlert";
import { ForcaKeyboard } from "./ForcaKeyboard";
import { ForcaRulesDialog } from "./ForcaRules";
import { ForcaWord } from "./ForcaWord";
import { Gallows } from "./Gallows";
import { TurnTimer } from "./TurnTimer";
import { sfx } from "./sfx";
import type { ForcaSession } from "./useForcaSession";

interface ForcaGameProps {
  session: ForcaSession;
  onExit: () => void;
  title: string;
}

/** Depois de mandar um chute, ignora outro até o servidor responder (evita o duplo clique virar erro). */
const SEND_LOCK_MS = 900;

export default function ForcaGame({ session, onExit, title }: ForcaGameProps) {
  const { view, me } = session;
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  /** Painel "chutar a palavra" aberto + o que foi digitado. */
  const [wordOpen, setWordOpen] = useState(false);
  const [wordText, setWordText] = useState("");
  const lastSend = useRef({ seq: -1, at: 0 });

  useEffect(() => setSoundOn(sfx.isEnabled()), []);

  const phase = view?.phase;
  const eventSeq = view?.eventSeq ?? 0;
  const current = view ? view.players[view.turn] : undefined;
  const mine = view?.players.find((p) => p.id === me);
  const myTurn = phase === "playing" && !!current && current.id === me;
  const gameOver = phase === "game_over";
  const tried = useMemo(() => new Set((view?.guesses ?? []).map((g) => g.letter)), [view?.guesses]);

  // ── sons de cada coisa que aconteceu (só os eventos da última ação)
  const soundedSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!view) return;
    if (soundedSeq.current === null) {
      soundedSeq.current = view.eventSeq; // primeira tela (reconexão): não repete o que já passou
      return;
    }
    if (view.eventSeq === soundedSeq.current) return;
    soundedSeq.current = view.eventSeq;
    for (const e of view.events) {
      if (e.t === "letter") (e.hits > 0 ? sfx.hit : sfx.miss)();
      else if (e.t === "word" && !e.ok) sfx.wordFail();
      else if (e.t === "won") sfx.solved();
      else if (e.t === "lost") sfx.lost();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSeq]);

  // ── minha vez: um "plim"; aba escondida: o título pisca
  useEffect(() => {
    if (myTurn && !document.hidden) sfx.yourTurn();
  }, [myTurn]);
  useTurnAlert(myTurn, "Sua vez!");

  const endSoundFor = useRef(0);
  useEffect(() => {
    if (!view || !gameOver || endSoundFor.current === view.gameNumber) return;
    endSoundFor.current = view.gameNumber;
    if (view.winnerId === me) sfx.win();
    else if (mine) sfx.lose();
  }, [view, gameOver, me, mine]);

  // ── avisos do servidor ("não é a sua vez"...) e fim do aviso
  useEffect(() => {
    if (!session.error) return;
    setToast({ id: Date.now(), text: FORCA_ERROR_LABEL[session.error] ?? "Ação não permitida." });
    lastSend.current = { seq: -1, at: 0 }; // o servidor recusou: pode tentar de novo
    session.clearError();
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // A vez passou (ou a rodada acabou): fecha o painel de chutar a palavra.
  useEffect(() => {
    if (!myTurn) {
      setWordOpen(false);
      setWordText("");
    }
  }, [myTurn]);

  const guessLetter = (letter: string) => {
    sfx.unlock();
    if (!myTurn || tried.has(letter)) return;
    const last = lastSend.current;
    if (last.seq === eventSeq && Date.now() - last.at < SEND_LOCK_MS) return;
    lastSend.current = { seq: eventSeq, at: Date.now() };
    session.send({ type: "guess", letter });
  };

  const submitWord = () => {
    const word = normalize(wordText);
    if (!myTurn || word.length < 2) return;
    lastSend.current = { seq: eventSeq, at: Date.now() };
    session.send({ type: "guess_word", word: wordText });
    setWordOpen(false);
    setWordText("");
  };

  // ── digitar no teclado de verdade
  useEffect(() => {
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const letter = normalize(e.key);
      if (letter.length === 1) guessLetter(letter);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, eventSeq, tried]);

  if (!view) return null;

  const players = view.players;
  const spectator = !mine;
  const hasOtherHumans = players.some((p) => !p.bot && p.id !== me);
  const roundOver = phase === "round_end";
  const colorOf = (id: string) => playerColor(players, id);
  const solver = players.find((p) => p.id === view.solvedBy);
  const solvedPoints = [...view.events].reverse().find((e) => e.t === "won");

  // ── texto de status
  let statusText = "";
  let statusTone = "text-white";
  if (gameOver) statusText = `${players.find((p) => p.id === view.winnerId)?.name ?? "Alguém"} venceu!`;
  else if (roundOver) {
    if (view.status === "won") statusText = `${solver?.id === me ? "Você completou" : `${solver?.name ?? "Alguém"} completou`} a palavra!`;
    else statusText = "A forca fechou!";
    statusTone = view.status === "won" ? "text-emerald-300" : "text-red-300";
  } else if (myTurn) {
    statusTone = "text-yellow-300";
    statusText = "Sua vez — chute uma letra";
  } else if (current) statusText = `Vez de ${current.name}`;
  if (toast) {
    statusText = toast.text;
    statusTone = "text-red-300";
  }

  const botTurn = !roundOver && !gameOver && !!current && (current.bot || !current.connected);

  return (
    <>
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
          {spectator && (
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-zinc-200">
              <Eye className="h-3 w-3" /> assistindo
            </span>
          )}
          <div className="flex items-center gap-1">
            <FeedHistoryButton entries={session.feed} />
            {hasOtherHumans && !spectator && (
              <button onClick={() => setShowEmojis((v) => !v)} aria-label="Reações" className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70">
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
            <button onClick={() => setShowRules(true)} aria-label="Regras" className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70">
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
              data-forca-status=""
            >
              {statusText}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* palco */}
        <div className="forca-stage">
          <div className="forca-layout">
            {/* jogadores */}
            <div className="forca-players">
              {players.map((p) => (
                <PlayerTile
                  key={p.id}
                  player={p}
                  isMe={p.id === me}
                  color={colorOf(p.id)}
                  isTurn={phase === "playing" && current?.id === p.id}
                  emojis={session.emojis.filter((e) => e.fromPlayerId === p.id)}
                />
              ))}
            </div>

            {/* a mesa: rodada, categoria, vidas, forca e palavra */}
            <div className="forca-board">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-zinc-200" data-forca-round="">
                  Palavra {view.roundNo}/{view.rounds}
                </span>
                {view.category && (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-emerald-300" data-forca-category="">
                    Dica: {view.category}
                  </span>
                )}
                <Lives lives={view.lives} max={view.maxLives} />
              </div>

              <div className="forca-boardbody">
                <div className="forca-gallowsbox">
                  <Gallows lives={view.lives} lost={view.status === "lost"} className="forca-gallows" />
                </div>
                <div className="forca-wordcol">
                  <ForcaWord pattern={view.pattern} tried={tried} status={view.status} />
                  <div className="forca-wordfoot">
                    <AnimatePresence mode="wait" initial={false}>
                      {roundOver ? (
                        <motion.div
                          key={`end-${view.roundNo}-${view.status}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`rounded-xl px-3 py-1.5 text-center text-sm font-black ${view.status === "won" ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"}`}
                          data-forca-roundend={view.status ?? ""}
                        >
                          {view.status === "won" ? (
                            <>
                              🎉 {solver?.id === me ? "Você" : (solver?.name ?? "Alguém")} completou{solvedPoints && solvedPoints.t === "won" ? ` · +${solvedPoints.points} pontos` : ""}
                            </>
                          ) : (
                            <>☠️ A forca fechou — era {view.word}</>
                          )}
                          <span className="mt-0.5 block text-[0.7rem] font-semibold opacity-75">{view.roundNo >= view.rounds ? "Fim da partida logo mais…" : "Próxima palavra já já…"}</span>
                        </motion.div>
                      ) : botTurn ? (
                        <motion.p key="bot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-xs font-bold text-zinc-400">
                          {current?.bot ? `🤖 ${current.name} está pensando…` : `📡 ${current?.name} caiu — um bot joga por ele`}
                        </motion.p>
                      ) : phase === "playing" ? (
                        <motion.div key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-sm">
                          <TurnTimer deadline={view.turnDeadline} serverNow={session.serverNow} turnKey={`${view.gameNumber}-${view.roundNo}-${view.eventSeq}`} mine={myTurn} />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {/* teclado + chutar a palavra */}
            <div className="forca-controls">
              <ForcaKeyboard guesses={view.guesses} colorOf={colorOf} enabled={myTurn} onPick={guessLetter} />
              {!spectator && (
                <div className="flex min-h-10 items-center justify-center gap-2">
                  {wordOpen ? (
                    <form
                      className="flex w-full max-w-md flex-wrap items-center justify-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitWord();
                      }}
                    >
                      <input
                        autoFocus
                        value={wordText}
                        onChange={(e) => setWordText(e.target.value.replace(/[^\p{L}]/gu, "").toUpperCase())}
                        maxLength={30}
                        placeholder={`${view.pattern.length} letras`}
                        aria-label="A palavra inteira"
                        data-forca-word-input=""
                        autoComplete="off"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 font-mono text-base uppercase tracking-widest text-white placeholder:text-zinc-600 focus:border-white focus:outline-none"
                      />
                      <Button type="submit" size="sm" disabled={normalize(wordText).length < 2} className="bg-emerald-600 font-bold text-white hover:bg-emerald-700" data-forca-word-submit="">
                        Chutar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setWordOpen(false)} className="text-zinc-400">
                        Cancelar
                      </Button>
                      <p className="w-full text-center text-[0.7rem] font-semibold text-amber-300">
                        {view.lives <= WORD_PENALTY ? "Se errar, a forca fecha pra todo mundo!" : `Errar custa ${WORD_PENALTY} vidas da mesa.`}
                      </p>
                    </form>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={!myTurn} onClick={() => setWordOpen(true)} className="gap-1.5 font-bold" data-forca-word-open="">
                      <Target className="h-3.5 w-3.5" /> Chutar a palavra
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* histórico (só em tela larga; no resto, o botão do topo) */}
            <div className="forca-feed">
              <FeedList entries={session.feed} visible={9} />
            </div>
          </div>
        </div>

        {/* reações */}
        <AnimatePresence>
          {showEmojis && (
            <motion.div
              className="absolute right-0 top-10 z-40 flex gap-1 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-xl sm:right-1 sm:top-12"
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {REACTION_EMOJIS.map((e) => (
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
        {gameOver && view.standings && (
          <GameOverPanel
            key="game-over"
            headline={resultHeadline(
              view.standings.map((s) => ({ id: s.playerId, name: s.name })),
              view.winnerId,
              mine ? me : null
            )}
            myStats={myChips(view.standings.find((s) => s.playerId === me))}
            rows={view.standings.map((s) => ({
              id: s.playerId,
              name: s.name,
              color: colorOf(s.playerId),
              detail: resultLabel(s),
              stats: standingLine(s),
              isMe: s.playerId === me,
            }))}
            actions={[
              ...(!spectator ? [{ label: players.filter((p) => !p.bot).length === 1 ? "Jogar de novo" : "Voltar para a sala", onClick: session.playAgain, primary: true }] : []),
              { label: "Sair", onClick: onExit, icon: <LogOut className="h-4 w-4" /> },
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{showRules && <ForcaRulesDialog onClose={() => setShowRules(false)} />}</AnimatePresence>

      <AnimatePresence>
        {confirmLeave && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmLeave(false)}
          >
            <motion.div className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
              <p className="mb-1 text-lg font-black text-white">Sair da partida?</p>
              <p className="mb-4 text-sm text-zinc-400">
                {spectator ? "Você deixa de assistir a esta sala." : "Um bot assume as suas jogadas até você voltar — a partida fica salva na sala."}
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
    </>
  );
}

// ── Vidas ──────────────────────────────────────────────────────────────────

function Lives({ lives, max }: { lives: number; max: number }) {
  return (
    <span className="flex items-center gap-0.5" data-forca-lives={lives} aria-label={`${lives} de ${max} vidas`}>
      {Array.from({ length: max }, (_, i) => {
        const alive = i < lives;
        return (
          <motion.span key={i} animate={alive ? { scale: 1 } : { scale: [1.5, 1] }} transition={{ duration: 0.3 }} className="inline-flex">
            <Heart className={`h-4 w-4 ${alive ? "fill-red-500 text-red-500" : "text-zinc-600"}`} />
          </motion.span>
        );
      })}
    </span>
  );
}

// ── Jogador ────────────────────────────────────────────────────────────────

function PlayerTile({ player, isMe, color, isTurn, emojis }: { player: ForcaPlayerView; isMe: boolean; color: string; isTurn: boolean; emojis: { id: string; emoji: string }[] }) {
  const away = !player.bot && !player.connected;
  return (
    <motion.div
      data-forca-tile={player.id}
      data-turn={isTurn ? "true" : "false"}
      className="forca-tile relative rounded-xl border bg-black/70"
      style={{
        borderTopColor: isTurn ? "#facc15" : "rgba(255,255,255,0.12)",
        borderRightColor: isTurn ? "#facc15" : "rgba(255,255,255,0.12)",
        borderBottomColor: isTurn ? "#facc15" : "rgba(255,255,255,0.12)",
        borderLeftColor: color,
        borderLeftWidth: 4,
        boxShadow: isTurn ? "0 0 0 2px rgba(250,204,21,0.55), 0 0 18px rgba(250,204,21,0.35)" : undefined,
        opacity: away ? 0.55 : 1,
      }}
      animate={isTurn ? { scale: 1.03 } : { scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {player.bot ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-emerald-950">
            <Bot className="h-3.5 w-3.5" />
          </span>
        ) : (
          <PlayerAvatar avatarUrl={player.avatarUrl} name={player.name} className="h-6 w-6 shrink-0 text-[0.6rem]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.72rem] font-bold leading-tight text-white">
            {player.name}
            {isMe && <span className="ml-1 text-[0.6rem] font-semibold text-zinc-400">(você)</span>}
          </p>
          <p className="truncate text-[0.6rem] leading-tight text-zinc-400">{away ? "desconectado" : player.bot ? BOT_LEVEL_LABEL[player.bot] : " "}</p>
        </div>
        <span className="shrink-0 text-base font-black tabular-nums text-white" data-forca-score={player.id}>
          <ScoreDelta value={player.score} tone="good" delayMs={0}>
            {(n) => <>{n}</>}
          </ScoreDelta>
        </span>
      </div>
      <AnimatePresence>
        {emojis.map((e) => (
          <motion.span
            key={e.id}
            className="pointer-events-none absolute left-1/2 top-0 z-50 text-2xl"
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{ y: -34, opacity: [0, 1, 1, 0], scale: 1.3 }}
            transition={{ duration: 2, ease: "easeOut" }}
          >
            {e.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
