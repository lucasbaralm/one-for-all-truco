"use client";

/* Esta tela é, em grande parte, reação a eventos do servidor (dados, compras, cartas, falências, fim
   de jogo) que disparam som, aviso e animação — por isso os efeitos abaixo atualizam estado. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, HelpCircle, LogOut, SmilePlus, Volume2, VolumeX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedHistoryButton, FeedList } from "@/components/feed/EventFeed";
import { GameOverPanel } from "@/components/GameOverPanel";
import { resultHeadline } from "@/lib/gameResult";
import { getEdition } from "@/lib/monopoly/editions";
import type { MonoEvent } from "@/lib/monopoly/engine";
import { forwardDistance, MAX_WALK } from "@/lib/monopoly/geometry";
import { cardText, money, squareLabel } from "@/lib/monopoly/labels";
import { MONO_ERROR_LABEL } from "@/lib/monopoly/protocol";
import { myChips, resultLabel, standingLine } from "@/lib/monopoly/summary";
import { TIMING } from "@/lib/monopoly/timing";
import { REACTION_EMOJIS } from "@/lib/party-codes";
import { playerColor } from "@/lib/playerColors";
import { useTurnAlert } from "@/lib/useTurnAlert";
import { ActionPanel } from "./ActionPanel";
import { AssetsDialog } from "./AssetsDialog";
import { Board } from "./Board";
import { Deed } from "./Deed";
import { DicePair } from "./Dice";
import { PlayerTile } from "./PlayerTile";
import { MonopolyRulesDialog } from "./Rules";
import { TradeComposer, TradeOffer } from "./TradeDialog";
import { EDITION_UI } from "./edition-ui";
import { sfx } from "./sfx";
import type { MonopolySession } from "./useMonopolySession";
import "./monopoly.css";

interface Props {
  session: MonopolySession;
  onExit: () => void;
  title: string;
}

/** Quanto a peça demora andando o primeiro deslocamento de uma jogada (pra a carta e o aviso esperarem). */
function firstWalkMs(events: MonoEvent[]): number {
  const mv = events.find((e) => e.t === "move");
  if (!mv || mv.t !== "move") return 0;
  const d = forwardDistance(mv.from, mv.to);
  return d <= MAX_WALK && d > 0 ? d * TIMING.STEP_MS : TIMING.STEP_MS * 3;
}

export default function MonopolyGame({ session, onExit, title }: Props) {
  const { view, me, edition } = session;
  const ui = EDITION_UI[edition];
  const ed = getEdition(edition);
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [assetsFor, setAssetsFor] = useState<string | null>(null);
  const [trading, setTrading] = useState(false);
  const [inspect, setInspect] = useState<number | null>(null);
  const [card, setCard] = useState<{ key: number; deck: "chance" | "chest"; idx: number; who: string } | null>(null);

  useEffect(() => setSoundOn(sfx.isEnabled()), []);

  const phase = view?.phase;
  const eventSeq = view?.eventSeq ?? 0;
  const current = view ? view.players[view.turn] : undefined;
  const mine = view?.players.find((p) => p.id === me);
  const myTurn = phase === "playing" && !!current && current.id === me;
  const gameOver = phase === "game_over";

  // A rolada que está na tela: `rollKey` sobe só quando a última ação foi um lance de dados (padrão
  // "estado derivado": ajusta durante a renderização, sem efeito).
  const [rollState, setRollState] = useState({ seen: eventSeq, rollKey: eventSeq, animate: false, walkDelay: 0 });
  if (view && view.eventSeq !== rollState.seen) {
    const rolled = view.events.some((e) => e.t === "roll");
    setRollState({ seen: view.eventSeq, rollKey: rolled ? view.eventSeq : rollState.rollKey, animate: rolled, walkDelay: rolled ? TIMING.DICE_MS : 0 });
  }

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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const rolled = view.events.some((e) => e.t === "roll");
    const afterDice = rolled ? TIMING.DICE_MS : 0;
    for (const e of view.events) {
      switch (e.t) {
        case "roll":
          sfx.roll();
          break;
        case "move": {
          const steps = Math.min(forwardDistance(e.from, e.to), MAX_WALK);
          if (steps > 0 && forwardDistance(e.from, e.to) <= MAX_WALK) for (let i = 0; i < steps; i++) later(afterDice + i * TIMING.STEP_MS, sfx.step);
          break;
        }
        case "go":
          later(afterDice + firstWalkMs(view.events), sfx.cashIn);
          break;
        case "bonus":
          later(afterDice + firstWalkMs(view.events), sfx.cashIn);
          break;
        case "buy":
          sfx.buy();
          break;
        case "rent":
        case "tax":
        case "repairs":
          later(afterDice + firstWalkMs(view.events), sfx.cashOut);
          break;
        case "card":
          later(afterDice + firstWalkMs(view.events), sfx.card);
          break;
        case "jail":
          later(afterDice + firstWalkMs(view.events), sfx.jail);
          break;
        case "bid":
        case "auction":
          sfx.bid();
          break;
        case "sold":
          sfx.sold();
          break;
        case "build":
        case "sell":
          sfx.build();
          break;
        case "mortgage":
        case "unmortgage":
          sfx.cashIn();
          break;
        case "trade_done":
          sfx.trade();
          break;
        case "bankrupt":
          sfx.bankrupt();
          break;
      }
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSeq]);

  // ── carta tirada: aparece no miolo do tabuleiro depois que a peça chega, e some sozinha
  const cardSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!view) return;
    if (cardSeq.current === null) {
      cardSeq.current = view.eventSeq;
      return;
    }
    if (view.eventSeq === cardSeq.current) return;
    cardSeq.current = view.eventSeq;
    const ev = view.events.find((e) => e.t === "card");
    if (!ev || ev.t !== "card") return;
    const rolled = view.events.some((e) => e.t === "roll");
    const show = setTimeout(() => setCard({ key: view.eventSeq, deck: ev.deck, idx: ev.card, who: ev.p }), (rolled ? TIMING.DICE_MS : 0) + firstWalkMs(view.events) + 120);
    const hide = setTimeout(() => setCard((c) => (c && c.key === view.eventSeq ? null : c)), (rolled ? TIMING.DICE_MS : 0) + firstWalkMs(view.events) + 120 + TIMING.CARD_MS + 1200);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [view, eventSeq]);

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
    setToast({ id: Date.now(), text: MONO_ERROR_LABEL[session.error] ?? "Ação não permitida." });
    session.clearError();
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  if (!view) return null;

  const players = view.players;
  const spectator = !mine;
  const hasOtherHumans = players.some((p) => !p.bot && p.id !== me);
  const tokenDelayMs = rollState.walkDelay;

  // ── texto de status
  let statusText = "";
  let statusTone = "text-white";
  if (gameOver) statusText = `${players.find((p) => p.id === view.winnerId)?.name ?? "Alguém"} venceu!`;
  else if (myTurn) {
    statusTone = "text-yellow-300";
    statusText =
      view.step === "roll"
        ? mine?.jail !== null
          ? "Você está preso — tente tirar dupla, pague ou use a carta"
          : view.doubles > 0
            ? "Dobrou! Role de novo"
            : "Sua vez — role os dados"
        : view.step === "buy"
          ? `Comprar ${squareLabel(edition, mine!.pos)}?`
          : view.step === "debt"
            ? "Você está devendo — levante dinheiro ou declare falência"
            : view.step === "auction"
              ? "Leilão em andamento"
              : "Construa, troque ou encerre a vez";
  } else if (view.step === "auction" && view.auction) statusText = `Leilão: ${squareLabel(edition, view.auction.sq)}`;
  else if (current) statusText = `Vez de ${current.name}`;
  if (toast) {
    statusText = toast.text;
    statusTone = "text-red-300";
  }

  const lastRoll = view.dice ? view.dice[0] + view.dice[1] : null;
  const cardPlayer = card ? players.find((p) => p.id === card.who) : undefined;
  const cardMeta = card ? ui.deckColor[card.deck] : "#000";

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col gap-1.5" onPointerDownCapture={() => sfx.unlock()} data-mono-game={edition} data-phase={phase} data-step={view.step}>
        {/* topo */}
        <header className="flex shrink-0 items-center gap-2 pr-11 sm:pr-14">
          <Button variant="secondary" size="sm" onClick={() => setConfirmLeave(true)} className="gap-1 bg-black/50 text-white hover:bg-black/70" data-mono-exit="">
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
            <motion.p key={statusText} className={`truncate text-sm font-black sm:text-base ${statusTone}`} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ duration: 0.18 }} data-mono-status="">
              {statusText}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* palco */}
        <div className="mono-stage">
          <div className="mono-layout">
            {/* jogadores (+ histórico em tela larga) */}
            <div className="mono-players">
              {players.map((p, seat) => (
                <PlayerTile key={p.id} view={view} player={p} seat={seat} isMe={p.id === me} emojis={session.emojis.filter((e) => e.fromPlayerId === p.id)} onOpen={setAssetsFor} />
              ))}
              <div className="mono-feed">
                <FeedList entries={session.feed} visible={8} />
              </div>
            </div>

            {/* tabuleiro */}
            <Board view={view} onSquare={setInspect} tokenDelayMs={tokenDelayMs}>
              <p className="font-black italic leading-none tracking-tight" style={{ color: ui.logo, fontSize: "calc(var(--s) * 0.052)" }}>
                {ui.title.toUpperCase()}
              </p>
              <DicePair dice={view.dice} rollKey={rollState.rollKey} animate={rollState.animate} />
              <p className="text-center font-bold leading-tight" style={{ fontSize: "calc(var(--s) * 0.024)" }}>
                {lastRoll !== null ? (
                  <>
                    {view.doubles > 0 && view.step !== "manage" ? "Dupla! " : ""}
                    <span data-mono-roll-total={lastRoll}>{lastRoll}</span> casas
                  </>
                ) : (
                  "Role os dados pra começar"
                )}
              </p>
              <AnimatePresence>
                {card && (
                  <motion.div
                    key={card.key}
                    className="absolute inset-0 z-10 grid place-items-center p-3"
                    style={{ background: "rgba(0,0,0,0.32)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setCard(null)}
                    data-mono-card=""
                  >
                    <motion.div
                      className="mono-card"
                      style={{ background: cardMeta, fontSize: "calc(var(--s) * 0.024)" }}
                      initial={{ rotateY: 90, scale: 0.7, y: 20 }}
                      animate={{ rotateY: 0, scale: 1, y: 0 }}
                      exit={{ scale: 0.8, opacity: 0, y: -20 }}
                      transition={{ type: "spring", stiffness: 240, damping: 20 }}
                    >
                      <p className="text-[0.75em] font-black uppercase tracking-widest opacity-85">
                        {ui.deckIcon[card.deck]} {ed.deckNames[card.deck]}
                        {cardPlayer ? ` · ${cardPlayer.id === me ? "você" : cardPlayer.name}` : ""}
                      </p>
                      <p className="mt-1 font-bold leading-snug" data-mono-card-text="">
                        {cardText(edition, card.deck, card.idx)}
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Board>

            {/* ações */}
            <div className="mono-actions">
              <ActionPanel session={session} view={view} onAssets={setAssetsFor} onTrade={() => setTrading(true)} onResign={() => setConfirmResign(true)} />
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

      {/* propriedades (as minhas ou as de alguém) */}
      <AnimatePresence>{assetsFor && <AssetsDialog key="assets" session={session} view={view} playerId={assetsFor} onClose={() => setAssetsFor(null)} />}</AnimatePresence>

      {/* propor uma troca / responder uma proposta */}
      <AnimatePresence>{trading && view.me.propose && <TradeComposer key="trade" session={session} view={view} onClose={() => setTrading(false)} />}</AnimatePresence>
      <AnimatePresence>{view.me.respondTrade && <TradeOffer key={`offer-${view.trade?.from}`} session={session} view={view} />}</AnimatePresence>

      {/* escritura de uma casa do tabuleiro */}
      <AnimatePresence>
        {inspect !== null && (
          <motion.div key="inspect" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setInspect(null)}>
            <motion.div className="w-full max-w-[17rem]" initial={{ scale: 0.85, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} data-mono-inspect={inspect}>
              <Deed edition={edition} idx={inspect} prop={view.props[inspect]} players={players} />
              <Button variant="secondary" className="mt-2 w-full" onClick={() => setInspect(null)}>
                Fechar
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
            myStats={myChips(view.standings.find((s) => s.playerId === me), edition)}
            rows={view.standings.map((s, i) => ({
              id: s.playerId,
              name: s.name,
              color: playerColor(players, s.playerId),
              detail: resultLabel(s, i, edition),
              stats: standingLine(s, edition),
              isMe: s.playerId === me,
            }))}
            actions={[
              ...(!spectator ? [{ label: players.filter((p) => !p.bot).length === 1 ? "Jogar de novo" : "Voltar para a sala", onClick: session.playAgain, primary: true }] : []),
              { label: "Sair", onClick: onExit, icon: <LogOut className="h-4 w-4" /> },
            ]}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{showRules && <MonopolyRulesDialog edition={edition} onClose={() => setShowRules(false)} />}</AnimatePresence>

      <AnimatePresence>
        {(confirmLeave || confirmResign) && (
          <motion.div
            key="confirm"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setConfirmLeave(false);
              setConfirmResign(false);
            }}
          >
            <motion.div className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
              <p className="mb-1 text-lg font-black text-white">{confirmResign ? "Desistir da partida?" : "Sair da partida?"}</p>
              <p className="mb-4 text-sm text-zinc-400">
                {confirmResign
                  ? `Você perde tudo (${money(edition, mine?.cash ?? 0)} e as propriedades vão pro banco) e a partida segue sem você.`
                  : spectator
                    ? "Você deixa de assistir a esta sala."
                    : "Um bot assume as suas peças até você voltar — a partida fica salva na sala."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setConfirmLeave(false);
                    setConfirmResign(false);
                  }}
                >
                  Continuar
                </Button>
                {confirmResign ? (
                  <Button
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                    onClick={() => {
                      session.send({ type: "resign" });
                      setConfirmResign(false);
                    }}
                    data-mono-resign-confirm=""
                  >
                    Desistir
                  </Button>
                ) : (
                  <Button className="flex-1 bg-red-600 text-white hover:bg-red-700" onClick={onExit} data-mono-exit-confirm="">
                    Sair
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
