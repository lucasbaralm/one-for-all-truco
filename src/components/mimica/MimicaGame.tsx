"use client";

/* Esta tela é, em grande parte, reação a eventos do servidor (chutes, dica, acerto, fim do turno) que
   disparam som, aviso e animação — por isso os efeitos abaixo atualizam estado. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, Flag, HelpCircle, Loader2, LogOut, Send, SmilePlus, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallControls } from "@/components/call/CallControls";
import { VideoTile } from "@/components/call/VideoTile";
import { FeedHistoryButton, FeedList } from "@/components/feed/EventFeed";
import { GameOverPanel } from "@/components/GameOverPanel";
import { ScoreDelta } from "@/components/game/ScoreDelta";
import { peerCaption } from "@/lib/call/peerCaption";
import type { CallApi } from "@/lib/call/useCall";
import { MAX_GUESS_CHARS } from "@/lib/mimica/engine";
import type { MimicaPlayerView, SongView } from "@/lib/mimica/engine";
import { KIND_ICON, KIND_LABEL } from "@/lib/mimica/labels";
import { MIMICA_ERROR_LABEL } from "@/lib/mimica/protocol";
import { myChips, resultLabel, standingLine } from "@/lib/mimica/summary";
import { TIMING } from "@/lib/mimica/timing";
import { resultHeadline } from "@/lib/gameResult";
import { REACTION_EMOJIS } from "@/lib/party-codes";
import { playerColor } from "@/lib/playerColors";
import { useTurnAlert } from "@/lib/useTurnAlert";
import { CountdownBar } from "./CountdownBar";
import { MimicaRulesDialog } from "./MimicaRules";
import { MimicaWord } from "./MimicaWord";
import { sfx } from "./sfx";
import type { MimicaSession } from "./useMimicaSession";

interface MimicaGameProps {
  session: MimicaSession;
  call: CallApi;
  onExit: () => void;
  title: string;
}

const GUESSES_SHOWN = 6;

export default function MimicaGame({ session, call, onExit, title }: MimicaGameProps) {
  const { view, me } = session;
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [guessText, setGuessText] = useState("");
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  /** Quais casinhas já estavam à vista durante a mímica (no fim, só o que faltava é destacado). */
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  useEffect(() => setSoundOn(sfx.isEnabled()), []);

  const phase = view?.phase;
  const eventSeq = view?.eventSeq ?? 0;
  const mine = view?.players.find((p) => p.id === me);
  const isMimer = !!view && !!mine && view.mimerId === me;
  const picking = phase === "picking";
  const miming = phase === "miming";
  const turnEnd = phase === "turn_end";
  const gameOver = phase === "game_over";
  const canGuess = miming && !!mine && !isMimer;

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
      if (e.t === "picked") sfx.picked();
      else if (e.t === "hint") sfx.hint();
      else if (e.t === "wrong") sfx.wrong();
      else if (e.t === "solved") sfx.solved();
      else if (e.t === "timeout" || e.t === "skipped") sfx.timeout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSeq]);

  // ── minha vez de escolher a música: um "plim"; aba escondida: o título pisca
  const mustPick = isMimer && picking;
  useEffect(() => {
    if (mustPick && !document.hidden) sfx.yourTurn();
  }, [mustPick]);
  useTurnAlert(mustPick, "Escolha a música!");

  const endSoundFor = useRef(0);
  useEffect(() => {
    if (!view || !gameOver || endSoundFor.current === view.gameNumber) return;
    endSoundFor.current = view.gameNumber;
    if (view.winnerId === me) sfx.win();
    else if (mine) sfx.lose();
  }, [view, gameOver, me, mine]);

  // ── avisos do servidor ("calma, um chute por vez"...) e fim do aviso
  useEffect(() => {
    if (!session.error) return;
    setToast({ id: Date.now(), text: MIMICA_ERROR_LABEL[session.error] ?? "Ação não permitida." });
    session.clearError();
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Turno novo: limpa o campo de chute e a confirmação de desistir.
  const turnNo = view?.turnNo ?? 0;
  useEffect(() => {
    setGuessText("");
    setConfirmGiveUp(false);
    setRevealed(new Set());
  }, [turnNo]);
  useEffect(() => {
    if (!confirmGiveUp) return;
    const t = setTimeout(() => setConfirmGiveUp(false), 3000);
    return () => clearTimeout(t);
  }, [confirmGiveUp]);

  // As casinhas à vista durante a mímica (a dica entra aqui também).
  const pattern = view?.pattern;
  useEffect(() => {
    if (!miming || !pattern) return;
    setRevealed(new Set(pattern.flatMap((c, i) => (c !== null ? [i] : []))));
  }, [miming, pattern]);

  if (!view) return null;

  const players = view.players;
  const spectator = !mine;
  const hasOtherHumans = players.some((p) => p.id !== me);
  const colorOf = (id: string) => playerColor(players, id);
  const mimer = players.find((p) => p.id === view.mimerId);
  const mimerName = isMimer ? "Você" : (mimer?.name ?? "Alguém");
  const solver = players.find((p) => p.id === view.solvedBy);
  const solvedEvent = turnEnd ? view.events.find((e) => e.t === "solved") : undefined;
  const status = view.status;
  const nameOf = (id: string) => (id === me ? "Você" : (players.find((p) => p.id === id)?.name ?? "Alguém"));

  // ── a câmera de cada pessoa (a minha vem do aparelho, as dos outros da chamada)
  const streamOf = (id: string) => (id === me ? call.localStream : (call.peers[id]?.stream ?? null));
  const camOf = (id: string): boolean | null => (id === me ? (call.joined ? call.camOn && call.hasCam : null) : (call.peers[id]?.cam ?? null));
  const micOf = (id: string): boolean | null => (id === me ? (call.joined ? call.micActive : null) : (call.peers[id]?.mic ?? null));
  /** O que o palco diz quando quem faz a mímica está sem vídeo (sem ele ninguém vê a mímica). */
  const stageCaption = (id: string): string | undefined => {
    const why = placeholderOf(id);
    if (why === undefined || why === "conectando…") return why;
    if (id === me) return !call.joined ? "Entre na chamada pra mostrar a mímica" : "Sua câmera está desligada ou bloqueada — ninguém vê a mímica";
    const reason: Record<string, string> = {
      "fora da chamada": "ainda não entrou na chamada",
      "câmera desligada": "está com a câmera desligada",
      "só assiste": "entrou sem câmera",
      "sem conexão": "está sem conexão",
    };
    return `${players.find((p) => p.id === id)?.name ?? "Quem faz a mímica"} ${reason[why] ?? "está sem vídeo"} — a mímica não aparece`;
  };
  const placeholderOf = (id: string): string | undefined => {
    if (id === me) return !call.joined ? "Entre na chamada" : !call.hasCam ? "sem câmera" : !call.camOn ? "câmera desligada" : undefined;
    return peerCaption(call.peers[id]);
  };

  // ── texto de status
  let statusText = "";
  let statusTone = "text-white";
  if (gameOver) statusText = `${players.find((p) => p.id === view.winnerId)?.name ?? "Alguém"} venceu!`;
  else if (turnEnd) {
    if (status === "solved") statusText = `${solver?.id === me ? "Você acertou" : `${solver?.name ?? "Alguém"} acertou`}!`;
    else if (status === "skipped") statusText = `${mimerName === "Você" ? "Você ficou" : `${mimerName} ficou`} fora — mímica pulada`;
    else statusText = "Ninguém acertou a tempo";
    statusTone = status === "solved" ? "text-emerald-300" : "text-red-300";
  } else if (picking) {
    statusTone = isMimer ? "text-yellow-300" : "text-white";
    statusText = isMimer ? "Sua vez: escolha a música da carta" : `${mimerName} está escolhendo a música…`;
  } else if (miming) {
    statusTone = isMimer ? "text-yellow-300" : "text-white";
    statusText = isMimer ? "Faça a mímica — sem falar nem fazer som!" : `${mimerName} está fazendo a mímica — chute o título!`;
  }
  if (toast) {
    statusText = toast.text;
    statusTone = "text-red-300";
  }

  const submitGuess = () => {
    const text = guessText.trim();
    if (!canGuess || !text) return;
    session.send({ type: "guess", text });
    setGuessText("");
  };

  const song: SongView | null = view.song;
  const shownGuesses = view.guesses.slice(-GUESSES_SHOWN);
  const timerKey = `${view.gameNumber}-${view.turnNo}-${phase}`;
  const endedAs = turnEnd ? (status === "solved" ? "solved" : "failed") : null;
  const kindChip = view.kind && (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wide ${view.kind === "br" ? "bg-emerald-500/20 text-emerald-300" : "bg-sky-500/20 text-sky-300"}`}
      data-mimica-kind={view.kind}
    >
      {KIND_ICON[view.kind]} {KIND_LABEL[view.kind]}
      {view.worth !== null && ` · vale ${view.worth}`}
    </span>
  );

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
            {!spectator && <CallControls call={call} micLocked={isMimer && miming} compact />}
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
              data-mimica-status=""
            >
              {statusText}
            </motion.p>
          </AnimatePresence>
        </div>
        {call.error && (
          <p className="shrink-0 rounded-lg bg-amber-500/15 px-3 py-1 text-center text-xs font-semibold text-amber-200" data-call-error="">
            {call.error}
          </p>
        )}

        {/* palco */}
        <div className="mimica-stage">
          <div className="mimica-layout">
            {/* jogadores (com a câmera de cada um) */}
            <div className="mimica-players">
              {players.map((p) => (
                <PlayerVideoTile
                  key={p.id}
                  player={p}
                  isMe={p.id === me}
                  isMimer={p.id === view.mimerId && !gameOver}
                  color={colorOf(p.id)}
                  stream={streamOf(p.id)}
                  cam={camOf(p.id)}
                  mic={micOf(p.id)}
                  placeholder={placeholderOf(p.id)}
                  emojis={session.emojis.filter((e) => e.fromPlayerId === p.id)}
                />
              ))}
            </div>

            {/* o quadro grande: quem faz a mímica */}
            <div className="mimica-video" data-mimica-stagevideo="">
              {mimer ? (
                <VideoTile
                  stream={streamOf(mimer.id)}
                  local={mimer.id === me}
                  name={mimer.name}
                  avatarUrl={mimer.avatarUrl}
                  cam={camOf(mimer.id)}
                  mic={micOf(mimer.id)}
                  placeholder={stageCaption(mimer.id)}
                  className="absolute inset-0 h-full w-full !rounded-2xl"
                  testId="stage"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-zinc-950 text-zinc-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}

              {/* ainda sem chamada: o convite fica em cima do palco */}
              {!call.joined && !spectator && !gameOver && !mustPick && (
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent p-2 text-xs font-semibold text-zinc-200">
                  <span>🎥 A mímica passa pela videochamada do jogo.</span>
                  <CallControls call={call} compact />
                </div>
              )}

              <AnimatePresence>
                {mustPick && view.card && (
                  <motion.div
                    key="card"
                    className="absolute inset-0 z-20 flex flex-col items-center gap-2 overflow-y-auto bg-black/80 p-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    data-mimica-card=""
                  >
                    <p className="mt-auto text-sm font-black text-yellow-300">Escolha a música (3 do Brasil + 1 internacional)</p>
                    <div className="mb-auto grid w-full max-w-2xl grid-cols-2 gap-2">
                      {view.card.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => session.send({ type: "pick", songId: c.id })}
                          data-mimica-pick={c.id}
                          data-kind={c.kind}
                          className={`flex flex-col items-start gap-0.5 rounded-xl border-2 p-2.5 text-left transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                            c.kind === "br" ? "border-emerald-400/60 bg-emerald-950/70 hover:bg-emerald-900/70" : "border-sky-400/60 bg-sky-950/70 hover:bg-sky-900/70"
                          }`}
                        >
                          <span className={`text-[0.65rem] font-black uppercase tracking-wide ${c.kind === "br" ? "text-emerald-300" : "text-sky-300"}`}>
                            {KIND_ICON[c.kind]} {KIND_LABEL[c.kind]} · vale {c.points}
                          </span>
                          <span className="text-sm font-black leading-tight text-white sm:text-base">{c.title}</span>
                          <span className="text-xs font-semibold text-zinc-400">{c.artist}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {turnEnd && (
                  <motion.div
                    key={`end-${view.turnNo}`}
                    className={`absolute inset-x-2 bottom-8 z-20 rounded-xl px-3 py-2 text-center text-sm font-black shadow-xl ${status === "solved" ? "bg-emerald-600/90 text-white" : "bg-zinc-900/90 text-red-200"}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    data-mimica-turnend={status ?? ""}
                  >
                    {status === "solved" && solvedEvent?.t === "solved" ? (
                      <>
                        🎉 {nameOf(solvedEvent.p)} acertou · +{solvedEvent.points}
                        {solvedEvent.mimer !== solvedEvent.p && <> · 🎭 {nameOf(solvedEvent.mimer)} +{solvedEvent.mimerPoints}</>}
                      </>
                    ) : status === "skipped" ? (
                      <>📡 Mímica pulada</>
                    ) : (
                      <>⏰ Ninguém acertou</>
                    )}
                    <span className="mt-0.5 block text-[0.7rem] font-semibold opacity-80">{view.turnNo >= view.totalTurns ? "Fim da partida logo mais…" : "Próxima mímica já já…"}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* quanto vale, as casinhas, o tempo — e o chute */}
            <div className="mimica-side">
              <div className="mimica-info">
                {(miming || turnEnd) && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {kindChip}
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-zinc-200" data-mimica-turn="">
                      Mímica {view.turnNo}/{view.totalTurns}
                    </span>
                  </div>
                )}

                {picking && (
                  <div className="flex flex-col items-center gap-1 text-center" data-mimica-waiting="">
                    <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="text-3xl">
                      🎭
                    </motion.span>
                    <p className="text-sm font-black text-white">{isMimer ? "Escolha a música da carta" : `${mimerName} está escolhendo a música…`}</p>
                    <p className="text-xs font-semibold text-zinc-400">Mímica {view.turnNo}/{view.totalTurns}</p>
                  </div>
                )}

                {isMimer && miming && song ? (
                  <div className="w-full rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-2 text-center" data-mimica-secret="">
                    <p className="mimica-secret-label text-[0.65rem] font-black uppercase tracking-widest text-yellow-300">Faça a mímica de</p>
                    <p className="mimica-secret-title text-xl font-black leading-tight text-white sm:text-2xl">{song.title}</p>
                    <p className="text-xs font-semibold text-zinc-300">{song.artist}</p>
                    <p className="mimica-secret-note mt-1 text-[0.7rem] font-bold text-red-300">🔇 Sem falar, sem som, sem soletrar</p>
                  </div>
                ) : (
                  (miming || turnEnd) && <MimicaWord pattern={view.pattern} ended={endedAs} revealedBefore={revealed} />
                )}

                {turnEnd && song && (
                  <p className="text-center text-sm font-black text-white" data-mimica-reveal="">
                    🎵 {song.title} <span className="font-semibold text-zinc-400">— {song.artist}</span>
                  </p>
                )}

                {(picking || miming) && (
                  <div className="w-full max-w-sm">
                    <CountdownBar deadline={view.deadline} serverNow={session.serverNow} totalMs={picking ? TIMING.PICK_MS : TIMING.MIME_MS} turnKey={timerKey} ticking={isMimer || canGuess} />
                  </div>
                )}
              </div>

              <div className="mimica-guess" data-mimica-guesses="">
                {canGuess && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitGuess();
                    }}
                  >
                    <input
                      value={guessText}
                      onChange={(e) => setGuessText(e.target.value)}
                      maxLength={MAX_GUESS_CHARS}
                      placeholder="Qual é a música?"
                      aria-label="Seu chute"
                      data-mimica-guess-input=""
                      autoComplete="off"
                      className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 text-base text-white placeholder:text-zinc-600 focus:border-white focus:outline-none"
                    />
                    <Button type="submit" disabled={!guessText.trim()} className="h-10 gap-1 bg-emerald-600 font-bold text-white hover:bg-emerald-700" data-mimica-guess-submit="">
                      <Send className="h-4 w-4" /> Chutar
                    </Button>
                  </form>
                )}
                {isMimer && miming && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => (confirmGiveUp ? session.send({ type: "give_up" }) : setConfirmGiveUp(true))}
                      className={`gap-1.5 font-bold ${confirmGiveUp ? "bg-red-600 text-white hover:bg-red-700" : ""}`}
                      data-mimica-giveup=""
                    >
                      <Flag className="h-3.5 w-3.5" /> {confirmGiveUp ? "Tem certeza? Desistir" : "Desistir da música"}
                    </Button>
                  </div>
                )}
                {shownGuesses.length > 0 && (
                  <ul className="mimica-guesslist flex flex-col gap-1">
                    {shownGuesses.map((g) => (
                      <li
                        key={g.n}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${g.ok ? "bg-emerald-500/20 text-emerald-200" : "bg-black/45 text-zinc-200"}`}
                        style={{ borderLeft: `3px solid ${colorOf(g.by)}` }}
                        data-mimica-guess={g.ok ? "ok" : "wrong"}
                      >
                        <span className="shrink-0 text-xs font-bold text-zinc-400">{nameOf(g.by)}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{g.text}</span>
                        {g.ok ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                        ) : (
                          isMimer &&
                          miming && (
                            <button
                              onClick={() => session.send({ type: "accept", guess: g.n })}
                              className="shrink-0 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white hover:bg-emerald-700"
                              data-mimica-accept={g.n}
                              title="Quase! Aceitar esse chute como certo"
                            >
                              Aceitar
                            </button>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* histórico (só em tela larga; no resto, o botão do topo) */}
            <div className="mimica-feed">
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
              ...(!spectator ? [{ label: "Voltar para a sala", onClick: session.playAgain, primary: true }] : []),
              { label: "Sair", onClick: onExit, icon: <LogOut className="h-4 w-4" /> },
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{showRules && <MimicaRulesDialog onClose={() => setShowRules(false)} />}</AnimatePresence>

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
                {spectator ? "Você deixa de assistir a esta sala." : "Você sai da videochamada e a sua vez é pulada enquanto estiver fora — a partida fica salva na sala."}
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

// ── Jogador: quadrinho de vídeo com nome, pontos e selo de quem faz a mímica ──────────────

function PlayerVideoTile({
  player,
  isMe,
  isMimer,
  color,
  stream,
  cam,
  mic,
  placeholder,
  emojis,
}: {
  player: MimicaPlayerView;
  isMe: boolean;
  isMimer: boolean;
  color: string;
  stream: MediaStream | null;
  cam: boolean | null;
  mic: boolean | null;
  placeholder?: string;
  emojis: { id: string; emoji: string }[];
}) {
  const away = !player.connected;
  return (
    <motion.div
      className="mimica-tile relative"
      data-mimica-player={player.id}
      data-mimer={isMimer ? "true" : "false"}
      style={{ opacity: away ? 0.55 : 1 }}
      animate={isMimer ? { scale: 1.03 } : { scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <VideoTile
        stream={stream}
        local={isMe}
        name={player.name}
        avatarUrl={player.avatarUrl}
        cam={cam}
        mic={mic}
        placeholder={away ? "desconectado" : placeholder}
        testId={player.id}
        className="h-full w-full"
        corner={
          <span className="text-sm font-black tabular-nums text-white" data-mimica-score={player.id}>
            <ScoreDelta value={player.score} tone="good" delayMs={0}>
              {(n) => <>{n}</>}
            </ScoreDelta>
          </span>
        }
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{ boxShadow: isMimer ? "inset 0 0 0 2px #facc15, 0 0 16px rgba(250,204,21,0.35)" : `inset 3px 0 0 ${color}` }}
      />
      {isMimer && <span className="absolute left-1 top-1 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[0.6rem] font-black text-black">🎭 mímica</span>}
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
