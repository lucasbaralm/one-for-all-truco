"use client";

/* Esta tela é, em grande parte, reação a eventos do servidor (contagem, rodada
   ganha, erro, fim de jogo) que disparam som, aviso e animação — por isso os
   efeitos abaixo atualizam estado. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Eye, HelpCircle, LogOut, SmilePlus, Trophy, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/Confetti";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { SYMBOLS } from "@/lib/dobble/cards";
import { BOT_LEVEL_LABEL, cardsLabel } from "@/lib/dobble/labels";
import type { DobblePlayerView } from "@/lib/dobble/engine";
import { DOBBLE_ERROR_LABEL } from "@/lib/dobble/protocol";
import { REACTION_EMOJIS } from "@/lib/party-codes";
import { DobbleCard } from "./DobbleCard";
import { DobbleRulesDialog } from "./DobbleRules";
import { sfx } from "./sfx";
import { DobbleSession, isSoloVsBots } from "./useDobbleSession";

interface Box {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** A carta que "voa" pro vencedor (Torre) ou do vencedor pro centro (Poço). */
interface Flier {
  key: number;
  card: number;
  from: Box;
  to: Box;
}

const rectOf = (el: Element | null | undefined): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
};

// Quanto tempo o destaque do símbolo achado fica antes de a carta voar.
const FLY_DELAY_MS = 650;

interface DobbleGameProps {
  session: DobbleSession;
  onExit: () => void;
  title: string;
}

export default function DobbleGame({ session, onExit, title }: DobbleGameProps) {
  const { view, me } = session;
  const centerRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());

  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  /** 3, 2, 1 e 0 = "Já!" (null = sem contagem). */
  const [count, setCount] = useState<number | null>(null);
  const [lockedMs, setLockedMs] = useState(0);
  const [wrongMark, setWrongMark] = useState<{ key: number; symbol: number } | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [tileShake, setTileShake] = useState<{ id: string; key: number } | null>(null);
  const [flier, setFlier] = useState<Flier | null>(null);
  const [hide, setHide] = useState<"center" | "mine" | null>(null);

  useEffect(() => setSoundOn(sfx.isEnabled()), []);

  const phase = view?.phase;
  const round = view?.round;
  const gameNumber = view?.gameNumber;
  const claim = view?.lastClaim ?? null;
  const wrong = view?.lastWrong ?? null;
  const mode = view?.mode;
  const myLock = view?.lockedUntil[me] ?? 0;

  // ── contagem regressiva: 3, 2, 1, Já!
  useEffect(() => {
    if (phase === "countdown") {
      const show = (n: number) => {
        setCount(n);
        sfx.tick();
      };
      show(3);
      const timers = [setTimeout(() => show(2), 1100), setTimeout(() => show(1), 2200)];
      return () => timers.forEach(clearTimeout);
    }
    if (phase === "playing" && round === 1) {
      setCount(0);
      sfx.go();
      const t = setTimeout(() => setCount(null), 800);
      return () => clearTimeout(t);
    }
    setCount(null);
  }, [phase, round, gameNumber]);

  // ── carta nova na mesa
  useEffect(() => {
    if (phase === "playing" && (round ?? 0) > 1) sfx.deal();
  }, [phase, round]);

  // ── alguém achou o símbolo: som, aviso e a carta voando
  const claimSeq = claim?.seq;
  useEffect(() => {
    if (phase !== "round_end" || !claim || !view) return;
    const mine = claim.playerId === me;
    sfx.found(mine);

    const t = setTimeout(() => {
      const center = rectOf(centerRef.current);
      const winnerBox = rectOf(mine ? mineRef.current : tileRefs.current.get(claim.playerId));
      if (!center || !winnerBox) return;
      if (view.mode === "tower") {
        // O vencedor leva a carta do centro.
        setFlier({ key: claim.seq, card: claim.centerCard, from: center, to: winnerBox });
        setHide("center");
      } else {
        // O vencedor joga a carta dele no centro.
        setFlier({ key: claim.seq, card: claim.handCard, from: winnerBox, to: center });
        if (mine) setHide("mine");
      }
    }, FLY_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimSeq, phase]);

  useEffect(() => {
    if (phase !== "round_end") {
      setFlier(null);
      setHide(null);
    }
  }, [phase, round]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // ── erro de símbolo: o meu faz a carta tremer e trava; o dos outros balança o cartão deles
  const seenWrong = useRef<number | null>(null);
  const wrongSeq = wrong?.seq;
  useEffect(() => {
    if (!wrong) return;
    if (seenWrong.current === null) {
      seenWrong.current = wrong.seq; // erro antigo (reconexão): não reage
      return;
    }
    if (wrong.seq === seenWrong.current) return;
    seenWrong.current = wrong.seq;
    if (wrong.playerId === me) {
      sfx.wrong();
      setShakeKey(wrong.seq);
      setWrongMark({ key: wrong.seq, symbol: wrong.symbol });
      const t = setTimeout(() => setWrongMark(null), 800);
      return () => clearTimeout(t);
    }
    setTileShake({ id: wrong.playerId, key: wrong.seq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongSeq]);

  // ── castigo restante (medido no relógio do servidor)
  useEffect(() => {
    if (!myLock) {
      setLockedMs(0);
      return;
    }
    const tick = () => setLockedMs(Math.max(0, myLock - session.serverNow()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [myLock, session]);

  // ── fim de jogo
  const endSoundFor = useRef(0);
  useEffect(() => {
    if (phase !== "game_over" || !view || endSoundFor.current === gameNumber) return;
    endSoundFor.current = gameNumber ?? 0;
    if (view.winnerId === me) sfx.win();
    else if (view.players.some((p) => p.id === me)) sfx.lose();
  }, [phase, gameNumber, view, me]);

  // ── erros do servidor viram aviso (cliques atrasados são ignorados em silêncio)
  useEffect(() => {
    if (!session.error) return;
    if (session.error !== "late" && session.error !== "not_playing") {
      setToast({ id: Date.now(), text: DOBBLE_ERROR_LABEL[session.error] ?? "Ação não permitida." });
    }
    session.clearError();
  }, [session]);

  if (!view) return null;

  const players = view.players;
  const mine = players.find((p) => p.id === me);
  const opponents = players.filter((p) => p.id !== me);
  const spectator = !mine;
  const soloVsBots = isSoloVsBots(view, me);
  const hasOtherHumans = players.some((p) => !p.bot && p.id !== me);
  const gameOver = phase === "game_over";
  const faceDown = phase === "countdown" || phase === "lobby";
  const locked = lockedMs > 0;
  const canClick = phase === "playing" && !!mine && !locked;
  const found = phase === "round_end" ? claim : null;
  const winnerName = players.find((p) => p.id === view.winnerId)?.name;

  const onSymbol = (symbol: number) => {
    if (!canClick) return;
    sfx.unlock();
    sfx.pop();
    session.send({ type: "claim", symbol, round: view.round });
  };

  // ── texto de status
  let statusText = "";
  let statusTone = "text-white";
  if (gameOver) statusText = `${winnerName ?? "Alguém"} venceu!`;
  else if (phase === "countdown") statusText = "Preparar…";
  else if (phase === "round_end" && claim) {
    const w = players.find((p) => p.id === claim.playerId);
    const symbol = SYMBOLS[claim.symbol];
    statusText = claim.playerId === me ? `Você achou ${symbol}!` : `${w?.name ?? "Alguém"} achou ${symbol}!`;
    statusTone = "text-yellow-300";
  } else if (phase === "playing") {
    if (spectator) statusText = "Quem acha primeiro?";
    else if (locked) {
      statusText = "De castigo… espere";
      statusTone = "text-red-300";
    } else {
      statusText = "Ache o símbolo igual!";
      statusTone = "text-yellow-300";
    }
  }
  // Aviso do servidor (ex.: de castigo) ocupa a linha de status por uns segundos.
  if (toast) {
    statusText = toast.text;
    statusTone = "text-red-300";
  }
  const progress =
    mode === "tower"
      ? `Torre · ${view.drawCount + (view.center !== null && !gameOver ? 1 : 0)} no centro`
      : mine
        ? `Poço · ${cardsLabel(mine.cards, "well")}`
        : "Poço";

  const centerFaceDown = faceDown || view.center === null;

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
            {hasOtherHumans && !spectator && (
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
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-zinc-200 sm:text-xs">{progress}</span>
        </div>

        {/* palco */}
        <div className="dobble-stage">
          <div className="dobble-layout" data-rows={opponents.length > 4 ? "2" : "1"}>
            {/* oponentes */}
            <div className="dobble-opp">
              {opponents.map((p) => (
                <OpponentTile
                  key={p.id}
                  player={p}
                  mode={view.mode}
                  faceDown={faceDown}
                  winning={phase === "round_end" && claim?.playerId === p.id}
                  shakeKey={tileShake?.id === p.id ? tileShake.key : 0}
                  emojis={session.emojis.filter((e) => e.fromPlayerId === p.id)}
                  register={(el) => {
                    if (el) tileRefs.current.set(p.id, el);
                    else tileRefs.current.delete(p.id);
                  }}
                />
              ))}
            </div>

            {/* carta do centro */}
            <div className="dobble-center" ref={centerRef} style={{ opacity: hide === "center" ? 0 : 1 }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={`c-${view.gameNumber}-${centerFaceDown ? "back" : view.center}`}
                  className="absolute inset-0"
                  initial={{ scale: 0.4, rotate: -30, opacity: 0, y: -40 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                >
                  <DobbleCard
                    card={centerFaceDown ? null : view.center}
                    size="var(--c)"
                    role="center"
                    highlight={found?.symbol ?? null}
                    onSymbol={mine ? onSymbol : undefined}
                    disabled={!canClick}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* a minha carta */}
            <div className="dobble-mine" ref={mineRef} style={{ opacity: hide === "mine" ? 0 : 1 }}>
              {mine ? (
                <div key={`shake-${shakeKey}`} className={shakeKey ? "dobble-shake absolute inset-0" : "absolute inset-0"}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={`m-${view.gameNumber}-${faceDown || mine.hand === null ? "back" : mine.hand}`}
                      className="absolute inset-0"
                      initial={{ scale: 0.4, rotate: 25, opacity: 0, y: 40 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    >
                      <DobbleCard
                        card={faceDown ? null : mine.hand}
                        size="var(--c)"
                        role="mine"
                        highlight={found && found.playerId === me ? found.symbol : null}
                        wrong={wrongMark?.symbol ?? null}
                        onSymbol={onSymbol}
                        disabled={!canClick}
                      />
                    </motion.div>
                  </AnimatePresence>

                  {/* castigo */}
                  <AnimatePresence>
                    {locked && (
                      <motion.div
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-full bg-red-700/60 text-white backdrop-blur-[1px]"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <span className="text-[calc(var(--c)*0.2)] leading-none">✋</span>
                        <span className="text-[calc(var(--c)*0.1)] font-black tabular-nums">{(lockedMs / 1000).toFixed(1)}s</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* etiqueta */}
                  <div className="absolute -bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
                    <PlayerAvatar avatarUrl={mine.avatarUrl} name={mine.name} className="h-5 w-5 text-[0.6rem]" />
                    {mine.name} <span className="text-zinc-400">· {cardsLabel(mine.cards, mode ?? "tower")}</span>
                    <AnimatePresence>
                      {session.emojis
                        .filter((e) => e.fromPlayerId === me)
                        .map((e) => (
                          <motion.span
                            key={e.id}
                            className="pointer-events-none absolute -top-2 left-1/2 text-3xl"
                            initial={{ y: 0, opacity: 0, scale: 0.4 }}
                            animate={{ y: -50, opacity: [0, 1, 1, 0], scale: 1.3 }}
                            transition={{ duration: 2, ease: "easeOut" }}
                          >
                            {e.emoji}
                          </motion.span>
                        ))}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-full border border-dashed border-white/20 text-center text-sm font-bold text-zinc-300">
                  Você está assistindo
                </div>
              )}
            </div>
          </div>

          {/* contagem regressiva */}
          <AnimatePresence>
            {count !== null && (
              <motion.div
                key={count}
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
                initial={{ scale: 2.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <span className="text-[min(40vw,14rem)] font-black leading-none text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.7)]">
                  {count === 0 ? "Já!" : count}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
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

      {/* a carta voando */}
      {flier && <FlyingCard flier={flier} />}

      {/* fim de partida */}
      <AnimatePresence>
        {gameOver && view.standings && (
          <>
            {view.winnerId === me && <Confetti />}
            <motion.div
              className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-6 text-center shadow-2xl"
                initial={{ scale: 0.7, y: 40 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
              >
                <motion.div
                  animate={{ rotate: [0, -8, 8, -4, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.2, delay: 0.3 }}
                  className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400/15"
                >
                  <Trophy className="h-9 w-9 text-yellow-400" />
                </motion.div>
                <p className="text-sm font-semibold uppercase tracking-widest text-zinc-400">{view.winnerId === me ? "Você venceu!" : "Fim de jogo"}</p>
                <h2 className="mb-4 text-3xl font-black text-white">{winnerName}</h2>
                <div className="mb-5 space-y-2">
                  {view.standings.map((s, i) => (
                    <motion.div
                      key={s.playerId}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.25 + i * 0.1 }}
                      className="flex items-center gap-3 rounded-xl bg-black/40 px-3 py-2"
                    >
                      <span className="w-5 text-lg font-black text-zinc-500">{i + 1}</span>
                      <span className="flex-1 truncate text-left font-bold text-white">{s.name}</span>
                      <span className="text-sm text-zinc-400">{mode === "tower" ? cardsLabel(s.cards, "tower") : s.cards === 0 ? "acabou!" : `faltavam ${s.cards}`}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {!spectator && (
                    <Button onClick={session.playAgain} className="h-11 bg-white font-bold text-black hover:bg-zinc-200">
                      {soloVsBots ? "Jogar de novo" : "Voltar para a sala"}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={onExit} className="h-10">
                    <LogOut className="h-4 w-4" /> Sair
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>{showRules && <DobbleRulesDialog onClose={() => setShowRules(false)} />}</AnimatePresence>

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
                {spectator ? "Você deixa de assistir a esta sala." : "A partida continua na sala — você pode voltar enquanto ela estiver rolando."}
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

// ── Cartão de um oponente ───────────────────────────────────────────────────

function OpponentTile({
  player,
  mode,
  faceDown,
  winning,
  shakeKey,
  emojis,
  register,
}: {
  player: DobblePlayerView;
  mode: "tower" | "well";
  faceDown: boolean;
  winning: boolean;
  shakeKey: number;
  emojis: { id: string; emoji: string }[];
  register: (el: HTMLElement | null) => void;
}) {
  const away = !player.bot && !player.connected;
  return (
    <motion.div
      ref={register}
      key={shakeKey}
      className={`dobble-tile relative rounded-xl border bg-black/55 backdrop-blur ${shakeKey ? "dobble-shake" : ""} ${winning ? "dobble-pulse" : ""}`}
      style={{ borderColor: winning ? "#facc15" : "rgba(255,255,255,0.12)", opacity: away ? 0.55 : 1 }}
      animate={winning ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <DobbleCard card={faceDown ? null : player.hand} size="2.6rem" role="mini" />
      <div className="min-w-0 text-center">
        <p className="flex max-w-full items-center justify-center gap-0.5 truncate text-[0.65rem] font-bold leading-tight text-white">
          {player.bot && <Bot className="h-3 w-3 shrink-0 text-emerald-400" />}
          <span className="truncate">{player.name}</span>
        </p>
        <p className="truncate text-[0.6rem] leading-tight text-zinc-400">
          {away ? "desconectado" : player.bot ? BOT_LEVEL_LABEL[player.bot] : " "}
          {!away && player.bot ? " · " : ""}
          <motion.span key={player.cards} initial={{ scale: 1.6, color: "#facc15" }} animate={{ scale: 1, color: "#a1a1aa" }} className="inline-block">
            {cardsLabel(player.cards, mode)}
          </motion.span>
        </p>
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

// ── A carta que voa (Torre: do centro pro vencedor; Poço: do vencedor pro centro) ──

function FlyingCard({ flier }: { flier: Flier }) {
  const { from, to } = flier;
  const fromD = Math.min(from.w, from.h);
  const toD = Math.min(to.w, to.h);
  const dx = to.left + to.w / 2 - (from.left + from.w / 2);
  const dy = to.top + to.h / 2 - (from.top + from.h / 2);
  return (
    <motion.div
      key={flier.key}
      className="pointer-events-none fixed z-[60]"
      style={{ left: from.left, top: from.top, width: from.w, height: from.h }}
      initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
      animate={{ x: dx, y: dy, scale: Math.max(0.12, toD / fromD), rotate: 200, opacity: [1, 1, 1, 0.2] }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      <DobbleCard card={flier.card} size={`${fromD}px`} role="mini" />
    </motion.div>
  );
}
