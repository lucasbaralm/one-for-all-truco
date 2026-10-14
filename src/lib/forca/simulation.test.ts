import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { chooseBotAction } from "./bot";
import {
  BotLevel,
  FINISH_BONUS,
  ForcaState,
  LETTER_POINTS,
  MAX_LIVES,
  addBot,
  advanceRound,
  createLobby,
  currentPlayer,
  guessLetter,
  guessWord,
  hiddenCount,
  joinLobby,
  startGame,
  timeoutTurn,
  toView,
} from "./engine";
import { must } from "./testKit";

// Partidas INTEIRAS jogadas ao acaso (2 a 8 mesas, os três níveis de bot, com chutes
// automáticos de tempo esgotado) conferindo as invariantes a cada passo.

function ensure(cond: boolean, msg: () => string) {
  if (!cond) throw new Error(msg());
}

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];

function lobbyOf(n: number, rng: () => number): ForcaState {
  let s = must(joinLobby(createLobby(), { id: "h", name: "H" })).state;
  for (let i = 1; i < n; i++) s = must(addBot(s, LEVELS[Math.floor(rng() * 3)])).state;
  return { ...s, rounds: ([3, 5, 8] as const)[Math.floor(rng() * 3)] };
}

function checkInvariants(s: ForcaState, step: number) {
  const r = s.round;
  if (!r) return;
  ensure(r.lives >= 0 && r.lives <= MAX_LIVES, () => `passo ${step}: vidas ${r.lives}`);
  ensure(s.turn >= 0 && s.turn < s.players.length, () => `passo ${step}: vez fora da mesa`);
  const letters = r.guesses.map((g) => g.letter);
  ensure(new Set(letters).size === letters.length, () => `passo ${step}: letra repetida`);
  const misses = r.guesses.filter((g) => g.hits === 0).length;
  ensure(misses <= MAX_LIVES, () => `passo ${step}: ${misses} erros de letra`);
  if (r.status === "playing") {
    ensure(hiddenCount(r) > 0, () => `passo ${step}: palavra completa mas a rodada segue`);
    ensure(r.lives > 0, () => `passo ${step}: sem vidas e a rodada segue`);
    // a visão pública nunca revela uma letra não chutada
    const v = toView(s);
    v.pattern.forEach((ch, i) => ensure(ch === null || letters.includes(r.norm[i]), () => `passo ${step}: letra ${ch} revelada sem chute`));
    ensure(v.word === null, () => `passo ${step}: palavra vazou na visão`);
  }
}

function playOut(seed: number, n: number): { final: ForcaState; steps: number } {
  const rng = mulberry32(seed);
  let s = must(startGame(lobbyOf(n, rng), rng, 0)).state;
  let steps = 0;
  let now = 0;
  while (s.phase !== "game_over") {
    steps++;
    ensure(steps < 5000, () => `seed ${seed}: partida não terminou em 5000 passos`);
    if (s.phase === "round_end") {
      s = must(advanceRound(s, rng, now)).state;
      checkInvariants(s, steps);
      continue;
    }
    const me = currentPlayer(s)!;
    now += 3000;
    // 1 em cada 12 jogadas "estoura o tempo"
    const r =
      rng() < 1 / 12
        ? timeoutTurn(s, rng, now)
        : (() => {
            const a = chooseBotAction(s, me.bot ?? LEVELS[Math.floor(rng() * 3)], rng)!;
            return a.type === "letter" ? guessLetter(s, me.id, a.letter, now) : guessWord(s, me.id, a.word, now);
          })();
    ensure(r.ok, () => `seed ${seed}: ação recusada → ${JSON.stringify(r)}`);
    if (r.ok) s = r.state;
    checkInvariants(s, steps);
  }
  return { final: s, steps };
}

describe("partidas inteiras ao acaso", () => {
  it("60 partidas (2–8 jogadores): sempre terminam, toda ação é aceita e o segredo nunca vaza", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const n = 2 + (seed % 7);
      const { final } = playOut(seed, n);
      ensure(final.phase === "game_over", () => `seed ${seed}: não acabou`);
      ensure(final.standings!.length === n, () => `seed ${seed}: classificação com ${final.standings!.length} em vez de ${n}`);
      const top = final.standings![0];
      ensure(top.playerId === final.winnerId, () => `seed ${seed}: vencedor ≠ 1º da classificação`);
      ensure(final.standings!.every((st, i, a) => i === 0 || a[i - 1].score >= st.score), () => `seed ${seed}: classificação fora de ordem`);
      ensure(final.usedWords.length === final.rounds, () => `seed ${seed}: ${final.usedWords.length} palavras em ${final.rounds} rodadas`);
      ensure(new Set(final.usedWords).size === final.usedWords.length, () => `seed ${seed}: palavra repetida na partida`);
    }
    expect(true).toBe(true);
  });

  it("a pontuação fecha: cada ponto vem de letra certa (×10), palavra chutada (×10 do que faltava) ou bônus de 30", () => {
    for (let seed = 100; seed < 130; seed++) {
      const { final } = playOut(seed, 3);
      for (const st of final.standings!) {
        ensure(st.score >= st.solved * FINISH_BONUS, () => `seed ${seed}: ${st.name} sem os bônus (${st.score} < ${st.solved}×${FINISH_BONUS})`);
        ensure(st.score % LETTER_POINTS === 0, () => `seed ${seed}: ${st.name} com ${st.score} pontos (não múltiplo de 10)`);
        ensure(st.hits >= 0 && st.misses >= 0 && st.wordFails >= 0, () => `seed ${seed}: estatística negativa`);
      }
    }
    expect(true).toBe(true);
  });
});
