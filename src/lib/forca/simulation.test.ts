import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import {
  ForcaState,
  MAX_LIVES,
  ROUND_CHOICES,
  advanceRound,
  chooseWord,
  createLobby,
  currentPlayer,
  guessLetter,
  guessWord,
  hiddenCount,
  joinLobby,
  skipChooser,
  skipTurn,
  startGame,
  timeoutTurn,
  toView,
} from "./engine";
import { must } from "./testKit";
import { LETTER_ORDER, normalize } from "./words";

// Partidas INTEIRAS jogadas ao acaso (2 a 4 pessoas, 1 a 5 palavras, chutes de letra, de palavra,
// tempo esgotado, vez pulada, escolhedor que não escolhe) conferindo as invariantes a cada passo.

function ensure(cond: boolean, msg: () => string) {
  if (!cond) throw new Error(msg());
}

const PHRASES = ["borboleta", "casa de papel", "pão de queijo", "avião", "zebra", "guarda roupa", "ar", "xícara de café", "cachorro quente", "ilha"];

function lobbyOf(n: number, rounds: number): ForcaState {
  let s = createLobby();
  for (let i = 0; i < n; i++) s = must(joinLobby(s, { id: `p${i}`, name: `P${i}` })).state;
  return { ...s, rounds };
}

function checkInvariants(s: ForcaState, step: number) {
  ensure(s.players.length >= 2 && s.players.length <= 4, () => `passo ${step}: ${s.players.length} jogadores`);
  ensure(s.turn >= 0 && s.turn < s.players.length, () => `passo ${step}: vez fora da mesa`);
  ensure(s.players.every((p) => p.score >= 0 && p.score % 10 === 0), () => `passo ${step}: pontuação estranha ${JSON.stringify(s.players.map((p) => p.score))}`);
  if (s.phase === "choosing") ensure(s.turn === s.players.findIndex((p) => p.id === s.chooserId) && s.round === null, () => `passo ${step}: escolha mal montada`);
  const r = s.round;
  if (!r) return;
  ensure(r.lives >= 0 && r.lives <= MAX_LIVES, () => `passo ${step}: partes do boneco ${r.lives}`);
  const letters = r.guesses.map((g) => g.letter);
  ensure(new Set(letters).size === letters.length, () => `passo ${step}: letra repetida`);
  ensure(r.guesses.every((g) => g.by !== s.chooserId), () => `passo ${step}: o escolhedor chutou`);
  const misses = r.guesses.filter((g) => g.hits === 0).length;
  ensure(misses <= MAX_LIVES, () => `passo ${step}: ${misses} erros de letra`);
  if (r.status === "playing") {
    ensure(s.phase === "playing", () => `passo ${step}: rodada aberta fora de "playing"`);
    ensure(hiddenCount(r) > 0, () => `passo ${step}: palavra completa mas a rodada segue`);
    ensure(r.lives > 0, () => `passo ${step}: sem partes e a rodada segue`);
    ensure(currentPlayer(s)!.id !== s.chooserId, () => `passo ${step}: a vez caiu no escolhedor`);
    // ninguém além do escolhedor vê a palavra, e o padrão público só mostra letras já chutadas
    for (const p of s.players) {
      const v = toView(s, p.id);
      if (p.id === s.chooserId) ensure(v.word === r.word, () => `passo ${step}: o escolhedor não vê a palavra`);
      else {
        ensure(v.word === null, () => `passo ${step}: palavra vazou pra ${p.id}`);
        const raw = JSON.stringify(v);
        ensure(!raw.includes(r.word) || r.word.length < 3, () => `passo ${step}: a palavra ${r.word} está no JSON de ${p.id}`);
        v.pattern.forEach((ch, i) => ensure(ch === null || ch === " " || letters.includes(r.norm[i]), () => `passo ${step}: letra ${ch} revelada sem chute`));
      }
    }
  } else {
    ensure(s.phase === "round_end" || s.phase === "choosing" || s.phase === "game_over", () => `passo ${step}: rodada fechada em ${s.phase}`);
  }
}

function playOut(seed: number, n: number, rounds: number): { final: ForcaState; steps: number; skipped: number } {
  const rng = mulberry32(seed);
  let s = must(startGame(lobbyOf(n, rounds), 0)).state;
  let steps = 0;
  let skipped = 0;
  let now = 0;
  while (s.phase !== "game_over") {
    steps++;
    ensure(steps < 3000, () => `seed ${seed}: partida não terminou em 3000 passos`);
    now += 2000;
    if (s.phase === "round_end") {
      s = must(advanceRound(s, now)).state;
    } else if (s.phase === "choosing") {
      // 1 em cada 8 escolhedores não escolhe (a rodada é pulada)
      if (rng() < 1 / 8) {
        s = must(skipChooser(s, now)).state;
        skipped++;
      } else {
        s = must(chooseWord(s, s.chooserId!, PHRASES[Math.floor(rng() * PHRASES.length)], now)).state;
      }
    } else {
      const me = currentPlayer(s)!;
      const roll = rng();
      let r;
      if (roll < 0.06) r = skipTurn(s, now);
      else if (roll < 0.14) r = timeoutTurn(s, rng, now);
      else if (roll < 0.22) {
        // chuta uma palavra: às vezes a certa, às vezes uma errada
        const guess = rng() < 0.4 ? s.round!.word : "palavra errada";
        r = guessWord(s, me.id, guess, now);
      } else {
        const free = [...LETTER_ORDER].filter((l) => !s.round!.guesses.some((g) => g.letter === l));
        r = guessLetter(s, me.id, free[Math.floor(rng() * Math.min(6, free.length))], now);
      }
      ensure(r.ok, () => `seed ${seed}: ação recusada → ${JSON.stringify(r)}`);
      if (r.ok) s = r.state;
    }
    checkInvariants(s, steps);
  }
  return { final: s, steps, skipped };
}

describe("partidas inteiras ao acaso", () => {
  it("80 partidas (2–4 pessoas, 1–5 palavras): sempre terminam, toda ação é aceita e a palavra só vai pra quem escolheu", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const n = 2 + (seed % 3);
      const rounds = ROUND_CHOICES[seed % ROUND_CHOICES.length];
      const { final } = playOut(seed, n, rounds);
      ensure(final.phase === "game_over", () => `seed ${seed}: não acabou`);
      ensure(final.standings!.length === n, () => `seed ${seed}: classificação com ${final.standings!.length} em vez de ${n}`);
      ensure(final.standings![0].playerId === final.winnerId, () => `seed ${seed}: vencedor ≠ 1º da classificação`);
      ensure(final.standings!.every((st, i, a) => i === 0 || a[i - 1].score >= st.score), () => `seed ${seed}: classificação fora de ordem`);
      ensure(final.roundNo === rounds, () => `seed ${seed}: terminou na palavra ${final.roundNo} de ${rounds}`);
      // cada pessoa escolhe no máximo ceil(rounds / n) vezes (e nunca a mais que o rodízio permite)
      const maxChosen = Math.ceil(rounds / n);
      ensure(final.standings!.every((st) => st.chosen <= maxChosen), () => `seed ${seed}: alguém escolheu mais que o rodízio permite`);
    }
    expect(true).toBe(true);
  });

  it("a pontuação fecha: cada ponto vem de letra certa (×10), chute de palavra, bônus de 30 ou parte do boneco (×10 pro escolhedor)", () => {
    for (let seed = 200; seed < 240; seed++) {
      const { final } = playOut(seed, 3, 5);
      const total = final.players.reduce((n, p) => n + p.score, 0);
      ensure(total % 10 === 0, () => `seed ${seed}: total ${total} não é múltiplo de 10`);
      for (const st of final.standings!) {
        ensure(st.score >= st.solved * 30, () => `seed ${seed}: ${st.name} sem os bônus (${st.score} < ${st.solved}×30)`);
        ensure(st.stumped <= st.chosen, () => `seed ${seed}: ${st.name} derrubou mais do que escolheu`);
        ensure(st.hits >= 0 && st.misses >= 0 && st.wordFails >= 0, () => `seed ${seed}: estatística negativa`);
      }
    }
    expect(true).toBe(true);
  });

  it("o escolhedor só pontua quando a mesa acerta: palavra que fecha o boneco não paga", () => {
    for (let i = 0; i < 20; i++) {
      let s = must(startGame(lobbyOf(3, 1), 0)).state;
      s = must(chooseWord(s, "p0", "xícara", 0)).state;
      // a mesa só erra (letras que não estão em XICARA) até o chapéu
      const wrong = [...LETTER_ORDER].filter((l) => !normalize("xícara").includes(l));
      let k = 0;
      while (s.phase === "playing") {
        s = must(guessLetter(s, currentPlayer(s)!.id, wrong[k++ % wrong.length] ?? "B", 0)).state;
        if (k > 40) break;
      }
      ensure(s.round!.status === "lost", () => `rodada ${i}: devia ter fechado o boneco`);
      ensure(s.players.find((p) => p.id === "p0")!.score === 0, () => `rodada ${i}: o escolhedor ganhou com a forca fechada`);
    }
    expect(true).toBe(true);
  });
});
