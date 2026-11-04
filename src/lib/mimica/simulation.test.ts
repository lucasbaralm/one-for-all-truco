import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { SONGS } from "./catalog";
import {
  MAX_SPEED_BONUS,
  MimicaState,
  ROUND_CHOICES,
  SONG_POINTS,
  acceptGuess,
  advanceTurn,
  autoPick,
  createLobby,
  giveUp,
  joinLobby,
  pickSong,
  showHint,
  skipTurn,
  startGame,
  submitGuess,
  timeoutMime,
  toView,
} from "./engine";
import { must } from "./testKit";
import { TIMING } from "./timing";

// Partidas INTEIRAS jogadas ao acaso (2 a 8 pessoas, 1 a 5 voltas, chutes errados e certos, aceitar na mão,
// desistir, dica, tempo esgotado, mimer que cai) conferindo as invariantes a cada passo.

function ensure(cond: boolean, msg: () => string) {
  if (!cond) throw new Error(msg());
}

function lobbyOf(n: number, rounds: number): MimicaState {
  let s = createLobby();
  for (let i = 0; i < n; i++) s = must(joinLobby(s, { id: `p${i}`, name: `P${i}` })).state;
  return { ...s, rounds };
}

function checkInvariants(s: MimicaState, step: number) {
  ensure(s.players.length >= 2 && s.players.length <= 8, () => `passo ${step}: ${s.players.length} jogadores`);
  ensure(s.players.every((p) => Number.isInteger(p.score) && p.score >= 0), () => `passo ${step}: pontuação estranha`);
  const t = s.turn;
  if (!t) return;
  ensure(s.turnNo >= 1 && s.turnNo <= s.totalTurns, () => `passo ${step}: turno ${s.turnNo}/${s.totalTurns}`);
  ensure(t.n === s.turnNo, () => `passo ${step}: turno do estado ≠ turno da partida`);
  ensure(t.mimerId === s.players[(t.n - 1) % s.players.length].id, () => `passo ${step}: rodízio errado`);
  ensure(new Set(t.card).size === 4, () => `passo ${step}: carta com repetida`);
  ensure(t.card.filter((id) => SONGS[id].kind === "br").length === 3, () => `passo ${step}: carta sem 3 do Brasil`);
  ensure(t.guesses.every((g) => g.by !== t.mimerId), () => `passo ${step}: o mimer chutou`);
  ensure(new Set(t.guesses.map((g) => g.n)).size === t.guesses.length, () => `passo ${step}: chute com número repetido`);
  ensure(t.guesses.filter((g) => g.ok).length === (t.status === "solved" ? 1 : 0), () => `passo ${step}: acertos demais ou de menos`);
  if (t.status === "picking") ensure(s.phase === "picking" && t.songId === null, () => `passo ${step}: escolha mal montada`);
  if (t.status === "miming") {
    ensure(s.phase === "miming" && t.songId !== null && t.card.includes(t.songId), () => `passo ${step}: mímica mal montada`);
    ensure(s.deadline > 0, () => `passo ${step}: mímica sem prazo`);
  }
  if (s.phase === "turn_end") ensure(s.deadline === 0 && s.hintAt === 0, () => `passo ${step}: turno encerrado com relógio`);

  // sigilo: nenhuma visão de quem não faz a mímica contém o título nem a carta antes do fim do turno
  if (s.phase === "picking" || s.phase === "miming") {
    const secrets = (s.phase === "picking" ? t.card : [t.songId!]).map((id) => SONGS[id]);
    for (const p of s.players) {
      const raw = JSON.stringify(toView(s, p.id));
      if (p.id === t.mimerId) continue;
      for (const song of secrets) {
        // procura o título (e o artista) como VALOR de texto: "Numb" também existe dentro de "gameNumber".
        ensure(!raw.includes(JSON.stringify(song.title)), () => `passo ${step}: ${p.id} viu "${song.title}"`);
        ensure(!raw.includes(JSON.stringify(song.artist)), () => `passo ${step}: ${p.id} viu o artista de "${song.title}"`);
      }
    }
  }
}

function playGame(seed: number) {
  const rng = mulberry32(seed);
  const n = 2 + Math.floor(rng() * 7);
  const rounds = ROUND_CHOICES[Math.floor(rng() * ROUND_CHOICES.length)];
  let s = must(startGame(lobbyOf(n, rounds), rng, 0)).state;
  let now = 0;
  const log: string[] = [];
  const gained = new Map<string, number>();
  let expectedPoints = 0;
  let solvedTurns = 0;

  for (let step = 0; step < 5000 && s.phase !== "game_over"; step++) {
    checkInvariants(s, step);
    now += 500 + Math.floor(rng() * 4000);
    const mimer = s.turn?.mimerId ?? "";
    const guessers = s.players.filter((p) => p.id !== mimer).map((p) => p.id);
    const before = s;

    if (s.phase === "picking") {
      const roll = rng();
      if (roll < 0.1) s = must(skipTurn(s)).state;
      else if (roll < 0.3) s = must(autoPick(s, rng, now)).state;
      else s = must(pickSong(s, mimer, s.turn!.card[Math.floor(rng() * 4)], now)).state;
    } else if (s.phase === "miming") {
      const roll = rng();
      const who = guessers[Math.floor(rng() * guessers.length)];
      const song = SONGS[s.turn!.songId!];
      if (roll < 0.45) {
        const r = submitGuess(s, who, `palpite ${step} errado`, now);
        if (r.ok) s = r.state;
      } else if (roll < 0.6) {
        const r = submitGuess(s, who, song.title.toUpperCase(), now);
        if (r.ok) {
          s = r.state;
          solvedTurns++;
          const left = Math.max(0, before.deadline - now);
          const bonus = Math.min(MAX_SPEED_BONUS, Math.max(1, Math.ceil((MAX_SPEED_BONUS * left) / TIMING.MIME_MS)));
          expectedPoints += SONG_POINTS[song.kind] * 2 + bonus;
          gained.set(who, (gained.get(who) ?? 0) + SONG_POINTS[song.kind] + bonus);
          gained.set(mimer, (gained.get(mimer) ?? 0) + SONG_POINTS[song.kind]);
        }
      } else if (roll < 0.7) {
        const wrong = s.turn!.guesses.find((g) => !g.ok);
        if (wrong) {
          s = must(acceptGuess(s, mimer, wrong.n, now)).state;
          const left = Math.max(0, before.deadline - now);
          const bonus = Math.min(MAX_SPEED_BONUS, Math.max(1, Math.ceil((MAX_SPEED_BONUS * left) / TIMING.MIME_MS)));
          solvedTurns++;
          expectedPoints += SONG_POINTS[song.kind] * 2 + bonus;
          gained.set(wrong.by, (gained.get(wrong.by) ?? 0) + SONG_POINTS[song.kind] + bonus);
          gained.set(mimer, (gained.get(mimer) ?? 0) + SONG_POINTS[song.kind]);
        }
      } else if (roll < 0.78) s = must(giveUp(s, mimer)).state;
      else if (roll < 0.86) {
        const r = showHint(s);
        if (r.ok) s = r.state;
      } else if (roll < 0.9) s = must(skipTurn(s)).state;
      else if (roll < 0.95) s = must(timeoutMime(s)).state;
    } else if (s.phase === "turn_end") {
      s = must(advanceTurn(s, rng, now)).state;
    }
    log.push(`${before.phase}→${s.phase}`);
  }

  return { s, n, rounds, log, gained, expectedPoints, solvedTurns };
}

describe("partidas inteiras ao acaso", () => {
  it("terminam sempre, com as contas fechando", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const { s, n, rounds, gained, expectedPoints } = playGame(seed);
      ensure(s.phase === "game_over", () => `semente ${seed}: a partida não terminou`);
      ensure(s.turnNo === n * rounds && s.totalTurns === n * rounds, () => `semente ${seed}: ${s.turnNo}/${s.totalTurns} turnos pra ${n}×${rounds}`);
      const total = s.players.reduce((sum, p) => sum + p.score, 0);
      ensure(total === expectedPoints, () => `semente ${seed}: ${total} pontos na mesa, esperava ${expectedPoints}`);
      for (const p of s.players) ensure(p.score === (gained.get(p.id) ?? 0), () => `semente ${seed}: ${p.id} tem ${p.score}, devia ter ${gained.get(p.id) ?? 0}`);
      const st = s.standings!;
      ensure(st.length === n, () => `semente ${seed}: classificação com ${st.length}`);
      ensure(st.every((x, i) => i === 0 || st[i - 1].score >= x.score), () => `semente ${seed}: classificação fora de ordem`);
      ensure(s.winnerId === st[0].playerId, () => `semente ${seed}: vencedor ≠ 1º da classificação`);
      const mimed = st.reduce((sum, x) => sum + x.mimed, 0);
      ensure(mimed <= n * rounds, () => `semente ${seed}: ${mimed} mímicas feitas em ${n * rounds} turnos`);
    }
  });

  it("a mesma semente dá a mesma partida", () => {
    const a = playGame(77);
    const b = playGame(77);
    expect(a.log).toEqual(b.log);
    expect(a.s.players.map((p) => p.score)).toEqual(b.s.players.map((p) => p.score));
    expect(playGame(78).log).not.toEqual(a.log);
  });

  it("às vezes alguém acerta (a simulação mexe mesmo nas regras de pontos)", () => {
    const solved = Array.from({ length: 30 }, (_, i) => playGame(i + 1).solvedTurns).reduce((a, b) => a + b, 0);
    expect(solved).toBeGreaterThan(50);
  });
});
