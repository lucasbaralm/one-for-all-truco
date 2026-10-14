"use client";

/* Esta tela é, em grande parte, reação a eventos do servidor (jogadas, compras, UNO, fim
   de jogo) que disparam som, aviso e animação — por isso os efeitos abaixo atualizam estado. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Eye, HelpCircle, LogOut, RotateCcw, RotateCw, SmilePlus, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedHistoryButton, FeedList } from "@/components/feed/EventFeed";
import { GameOverPanel } from "@/components/GameOverPanel";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ScoreDelta } from "@/components/game/ScoreDelta";
import { resultHeadline } from "@/lib/gameResult";
import { REACTION_EMOJIS } from "@/lib/party-codes";
import { playerColor } from "@/lib/playerColors";
import { UNO_COLORS, UnoColor, cardOf, compareCards, isWild } from "@/lib/uno/cards";
import type { UnoPlayerView } from "@/lib/uno/engine";
import { BOT_LEVEL_LABEL, COLOR_HEX, COLOR_LABEL, cardName } from "@/lib/uno/labels";
import { UNO_ERROR_LABEL } from "@/lib/uno/protocol";
import { myChips, resultLabel, standingLine } from "@/lib/uno/summary";
import { useTurnAlert } from "@/lib/useTurnAlert";
import { UnoCardView } from "./UnoCard";
import { UnoRulesDialog } from "./UnoRules";
import { sfx } from "./sfx";
import type { UnoSession } from "./useUnoSession";

interface UnoGameProps {
  session: UnoSession;
  onExit: () => void;
  title: string;
}

/** Giro pequeno e fixo por carta (a pilha parece jogada à mão, mas a mesma carta sempre tem o mesmo giro). */
const tilt = (id: number) => ((id * 37) % 21) - 10;

export default function UnoGame({ session, onExit, title }: UnoGameProps) {
  const { view, me } = session;
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  /** Coringa escolhido, esperando a cor. */
  const [picking, setPicking] = useState<number | null>(null);

  useEffect(() => setSoundOn(sfx.isEnabled()), []);

  const phase = view?.phase;
  const eventSeq = view?.eventSeq ?? 0;
  const current = view ? view.players[view.turn] : undefined;
  const mine = view?.players.find((p) => p.id === me);
  const myTurn = phase === "playing" && !!current && current.id === me;
  const gameOver = phase === "game_over";

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
      if (e.t === "play") (isWild(cardOf(e.card)) ? sfx.wild : sfx.play)();
      else if (e.t === "draw") (e.penalty ? sfx.penalty : sfx.draw)();
      else if (e.t === "skip") sfx.skip();
      else if (e.t === "reverse") sfx.reverse();
      else if (e.t === "uno") sfx.uno();
      else if (e.t === "catch") sfx.catch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSeq]);

  // ── minha vez: um "plim"; aba escondida: o título pisca
  useEffect(() => {
    if (myTurn && !document.hidden) sfx.yourTurn();
  }, [myTurn, eventSeq]);
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
    setToast({ id: Date.now(), text: UNO_ERROR_LABEL[session.error] ?? "Ação não permitida." });
    session.clearError();
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  // Se o coringa pendente deixou de ser jogável (a vez passou), fecha o seletor de cor.
  useEffect(() => {
    if (picking !== null && !view?.legal.includes(picking)) setPicking(null);
  }, [picking, view?.legal]);

  const hand = useMemo(() => [...(view?.hand ?? [])].sort(compareCards), [view?.hand]);

  if (!view) return null;

  const players = view.players;
  const spectator = !mine;
  // Os outros, na ordem da mesa a partir de quem joga depois de mim.
  const myIndex = players.findIndex((p) => p.id === me);
  const opponents = myIndex === -1 ? players : [...players.slice(myIndex + 1), ...players.slice(0, myIndex)];
  const legal = new Set(view.legal);
  const hasOtherHumans = players.some((p) => !p.bot && p.id !== me);
  const lastPlay = [...view.events].reverse().find((e) => e.t === "play");

  const playCard = (id: number) => {
    sfx.unlock();
    if (!myTurn || !legal.has(id)) return;
    if (isWild(cardOf(id))) setPicking(id);
    else session.send({ type: "play", card: id });
  };
  const chooseColor = (color: UnoColor) => {
    if (picking === null) return;
    session.send({ type: "play", card: picking, color });
    setPicking(null);
  };

  // ── texto de status
  let statusText = "";
  let statusTone = "text-white";
  if (gameOver) statusText = `${players.find((p) => p.id === view.winnerId)?.name ?? "Alguém"} venceu!`;
  else if (myTurn) {
    statusTone = "text-yellow-300";
    statusText = view.drawnCard !== null ? "Jogue a carta que comprou — ou passe a vez" : view.legal.length > 0 ? "Sua vez — jogue uma carta (ou compre)" : "Sua vez — nenhuma carta serve: compre!";
  } else if (current) statusText = `Vez de ${current.name}`;
  if (toast) {
    statusText = toast.text;
    statusTone = "text-red-300";
  }
  const exposedName = view.exposed ? players.find((p) => p.id === view.exposed)?.name : null;

  const Direction = view.direction === 1 ? RotateCw : RotateCcw;

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
            >
              {statusText}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* palco */}
        <div className="uno-stage">
          <div className="uno-layout">
            {/* oponentes */}
            <div className="uno-opp">
              {opponents.map((p) => (
                <OpponentTile
                  key={p.id}
                  player={p}
                  color={playerColor(players, p.id)}
                  isTurn={!gameOver && current?.id === p.id}
                  exposed={view.exposed === p.id}
                  emojis={session.emojis.filter((e) => e.fromPlayerId === p.id)}
                />
              ))}
            </div>

            {/* mesa: monte, descarte, cor e sentido */}
            <div className="uno-table">
              <div className="relative flex items-center justify-center" style={{ gap: "calc(var(--uc) * 0.55)" }}>
                {/* monte */}
                <button
                  type="button"
                  onClick={() => view.canDraw && session.send({ type: "draw" })}
                  disabled={!view.canDraw}
                  aria-label="Comprar uma carta"
                  data-uno-draw=""
                  className="group relative cursor-pointer disabled:cursor-default"
                  style={{ width: "var(--uc)" }}
                >
                  <div className="absolute left-[3%] top-[2%]"><UnoCardView card={null} size="var(--uc)" /></div>
                  <div className="absolute left-[1.5%] top-[1%]"><UnoCardView card={null} size="var(--uc)" /></div>
                  <motion.div
                    animate={view.canDraw ? { y: [0, -4, 0] } : { y: 0 }}
                    transition={view.canDraw ? { repeat: Infinity, duration: 1.1 } : undefined}
                    className="relative"
                    style={view.canDraw ? { filter: "drop-shadow(0 0 10px rgba(250,204,21,0.9))" } : undefined}
                  >
                    <UnoCardView card={null} size="var(--uc)" />
                  </motion.div>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-2 py-0.5 text-[0.65rem] font-black text-white">
                    {view.canDraw ? "COMPRAR" : `${view.drawCount} no monte`}
                  </span>
                </button>

                {/* descarte */}
                <div className="relative" style={{ width: "var(--uc)", aspectRatio: "2 / 3" }}>
                  <motion.div
                    className="absolute -inset-[16%] rounded-[1.4rem]"
                    animate={{ boxShadow: view.color ? `0 0 38px 10px ${COLOR_HEX[view.color]}aa, inset 0 0 22px 4px ${COLOR_HEX[view.color]}66` : "none", backgroundColor: view.color ? `${COLOR_HEX[view.color]}22` : "transparent" }}
                    transition={{ duration: 0.35 }}
                    data-uno-color={view.color ?? ""}
                  />
                  {view.recent.slice(0, -1).map((id, i) => (
                    <div key={id} className="absolute inset-0" style={{ transform: `rotate(${tilt(id) * 2}deg) translate(${(i - 1) * 6}%, ${(i - 1) * 3}%)`, opacity: 0.85 }}>
                      <UnoCardView card={id} size="var(--uc)" />
                    </div>
                  ))}
                  <AnimatePresence initial={false}>
                    {view.top !== null && (
                      <motion.div
                        key={view.top}
                        className="absolute inset-0"
                        initial={{ y: lastPlay && lastPlay.t === "play" && lastPlay.p === me ? 150 : -150, scale: 0.6, opacity: 0, rotate: tilt(view.top) * 5 }}
                        animate={{ y: 0, scale: 1, opacity: 1, rotate: tilt(view.top) }}
                        exit={{ opacity: 1, transition: { duration: 0 } }}
                        transition={{ type: "spring", stiffness: 320, damping: 24 }}
                      >
                        <UnoCardView card={view.top} size="var(--uc)" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {view.color && (
                    <span
                      className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.65rem] font-black uppercase text-black"
                      style={{ background: COLOR_HEX[view.color] }}
                    >
                      {COLOR_LABEL[view.color]}
                    </span>
                  )}
                </div>

                {/* sentido */}
                <motion.div
                  className="absolute -top-[28%] left-1/2 -translate-x-1/2 text-white/60"
                  animate={{ rotate: view.direction === 1 ? 360 : -360 }}
                  transition={{ repeat: Infinity, duration: 9, ease: "linear" }}
                  aria-label={view.direction === 1 ? "Sentido horário" : "Sentido anti-horário"}
                >
                  <Direction className="h-7 w-7" />
                </motion.div>
              </div>

              {/* esqueceu o UNO */}
              <AnimatePresence>
                {view.canCatch && exposedName && (
                  <motion.button
                    key="catch"
                    type="button"
                    onClick={() => session.send({ type: "catch" })}
                    initial={{ scale: 0.6, opacity: 0, y: 10 }}
                    animate={{ scale: [1, 1.08, 1], opacity: 1, y: 0 }}
                    exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ scale: { repeat: Infinity, duration: 0.7 }, opacity: { duration: 0.15 } }}
                    className="absolute bottom-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white bg-red-600 px-4 py-2 text-sm font-black text-white shadow-xl"
                    data-uno-catch=""
                  >
                    🚨 {exposedName} esqueceu o UNO — PEGAR!
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* minha mão */}
            <div className="uno-hand">
              {spectator ? (
                <p className="py-4 text-center text-sm font-bold text-zinc-300">Você está assistindo</p>
              ) : (
                <>
                  <div className="uno-handscroll" data-uno-hand="">
                    <div className="uno-handrow" style={{ ["--ov" as string]: String(-overlapOf(hand.length)) }}>
                      <AnimatePresence initial={false}>
                        {hand.map((id) => {
                          const playable = myTurn && legal.has(id);
                          return (
                            <motion.button
                              key={id}
                              type="button"
                              layout
                              onClick={() => playCard(id)}
                              disabled={!playable}
                              data-legal={playable ? "true" : "false"}
                              aria-label={`Jogar ${cardName(cardOf(id))}`}
                              initial={{ y: -90, opacity: 0, scale: 0.6 }}
                              animate={{ y: playable ? -8 : 0, opacity: 1, scale: 1 }}
                              exit={{ y: -70, opacity: 0, transition: { duration: 0.14 } }}
                              whileHover={playable ? { y: -22, zIndex: 20 } : undefined}
                              transition={{ type: "spring", stiffness: 360, damping: 26 }}
                              className={`uno-handcard shrink-0 ${playable ? "cursor-pointer" : "cursor-default"}`}
                            >
                              <UnoCardView card={id} size="var(--uc)" dim={myTurn && !playable} glow={playable && view.drawnCard === id} />
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="relative flex min-h-9 items-center justify-center gap-2">
                    {myTurn && <span className="rounded-full bg-yellow-400/20 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-yellow-300">Sua vez</span>}
                    {view.canPass && (
                      <Button size="sm" variant="secondary" onClick={() => session.send({ type: "pass" })} className="font-bold">
                        Passar a vez
                      </Button>
                    )}
                    <AnimatePresence>
                      {view.canUno && (
                        <motion.button
                          key="uno"
                          type="button"
                          onClick={() => session.send({ type: "uno" })}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: view.exposed === me ? [1, 1.12, 1] : 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.15 } }}
                          transition={view.exposed === me ? { scale: { repeat: Infinity, duration: 0.6 } } : undefined}
                          className="rounded-full border-2 border-white bg-red-600 px-5 py-1.5 text-base font-black italic text-yellow-300 shadow-lg"
                          data-uno-call=""
                        >
                          UNO!
                        </motion.button>
                      )}
                    </AnimatePresence>
                    {mine && mine.cards === 1 && mine.unoCalled && <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-black uppercase text-emerald-300">UNO gritado ✓</span>}
                    <AnimatePresence>
                      {session.emojis
                        .filter((e) => e.fromPlayerId === me)
                        .map((e) => (
                          <motion.span
                            key={e.id}
                            className="pointer-events-none absolute -top-6 left-1/2 text-3xl"
                            initial={{ y: 0, opacity: 0, scale: 0.4 }}
                            animate={{ y: -46, opacity: [0, 1, 1, 0], scale: 1.3 }}
                            transition={{ duration: 2, ease: "easeOut" }}
                          >
                            {e.emoji}
                          </motion.span>
                        ))}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>

            {/* histórico (só em tela larga; no resto, o botão do topo) */}
            <div className="uno-feed">
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

      {/* escolher a cor do Coringa */}
      <AnimatePresence>
        {picking !== null && (
          <motion.div
            key="picker"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPicking(null)}
          >
            <motion.div
              className="w-full max-w-xs rounded-3xl border border-white/15 bg-zinc-900 p-5 text-center shadow-2xl"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              data-uno-picker=""
            >
              <p className="mb-3 text-lg font-black text-white">Escolha a cor</p>
              <div className="grid grid-cols-2 gap-3">
                {UNO_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => chooseColor(c)}
                    data-uno-color-choice={c}
                    className="h-20 rounded-2xl border-4 border-white text-base font-black uppercase text-black shadow-lg transition-transform hover:scale-105"
                    style={{ background: COLOR_HEX[c] }}
                  >
                    {COLOR_LABEL[c]}
                  </button>
                ))}
              </div>
              <Button variant="ghost" onClick={() => setPicking(null)} className="mt-3 text-zinc-400">
                Cancelar
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            rows={view.standings.map((s, i) => ({
              id: s.playerId,
              name: s.name,
              color: playerColor(players, s.playerId),
              detail: resultLabel(s, i),
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

      <AnimatePresence>{showRules && <UnoRulesDialog onClose={() => setShowRules(false)} />}</AnimatePresence>

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
                {spectator ? "Você deixa de assistir a esta sala." : "Um bot assume as suas cartas até você voltar — a partida fica salva na sala."}
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

/** Quanto das cartas da mão se sobrepõem (fração da largura): mão pequena quase solta, mão grande bem encavalada. */
export function overlapOf(count: number): number {
  if (count <= 7) return 0.12;
  return Math.min(0.62, 0.12 + (count - 7) * 0.05);
}

// ── Oponente ────────────────────────────────────────────────────────────────

function OpponentTile({ player, color, isTurn, exposed, emojis }: { player: UnoPlayerView; color: string; isTurn: boolean; exposed: boolean; emojis: { id: string; emoji: string }[] }) {
  const away = !player.bot && !player.connected;
  const backs = Math.min(player.cards, 5);
  return (
    <motion.div
      data-uno-tile={player.id}
      className="uno-tile relative rounded-xl border bg-black/70"
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
          <p className="truncate text-[0.72rem] font-bold leading-tight text-white">{player.name}</p>
          <p className="truncate text-[0.6rem] leading-tight text-zinc-400">{away ? "desconectado" : player.bot ? BOT_LEVEL_LABEL[player.bot] : " "}</p>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="flex shrink-0 items-center" style={{ minWidth: `calc(1.25rem + ${Math.max(0, backs - 1)} * 0.55rem)` }}>
          {Array.from({ length: backs }).map((_, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : "-0.8rem" }}>
              <UnoCardView card={null} size="1.35rem" />
            </div>
          ))}
        </div>
        <span className="text-base font-black tabular-nums text-white">
          <ScoreDelta value={player.cards}>{(n) => <>×{n}</>}</ScoreDelta>
        </span>
        {player.cards === 1 &&
          (exposed ? (
            <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 0.6 }} className="rounded-full bg-red-600 px-1.5 py-0.5 text-[0.6rem] font-black uppercase text-white">
              sem UNO!
            </motion.span>
          ) : player.unoCalled ? (
            <span className="rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[0.6rem] font-black uppercase text-emerald-300">UNO!</span>
          ) : null)}
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
