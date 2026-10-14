import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import {
  FINISH_BONUS,
  LETTER_POINTS,
  MAX_LIVES,
  MAX_PLAYERS,
  WORD_PENALTY,
  addBot,
  advanceRound,
  canStart,
  createLobby,
  currentPlayer,
  guessLetter,
  guessWord,
  hiddenCount,
  joinLobby,
  publicPattern,
  removePlayer,
  returnToLobby,
  setBotLevel,
  setPlayerConnected,
  setRounds,
  startGame,
  timeoutTurn,
  toView,
} from "./engine";
import { game, ids, lobby, must } from "./testKit";
import { TIMING } from "./timing";

const score = (s: ReturnType<typeof game>, id: string) => s.players.find((p) => p.id === id)!.score;

describe("lobby", () => {
  it("o primeiro humano é o host; bots não herdam o posto; quem sai passa o posto adiante", () => {
    let s = must(joinLobby(createLobby(), { id: "ana", name: "Ana" })).state;
    s = must(addBot(s, "easy")).state;
    s = must(joinLobby(s, { id: "bob", name: "Bob" })).state;
    expect(s.hostId).toBe("ana");
    s = removePlayer(s, "ana");
    expect(s.hostId).toBe("bob");
    s = removePlayer(s, "bob");
    expect(s.hostId).toBeNull();
  });

  it("entrar de novo só atualiza o nome; sala cheia e partida rolando recusam gente nova", () => {
    let s = lobby(ids(MAX_PLAYERS));
    expect(joinLobby(s, { id: "z", name: "Z" })).toEqual({ ok: false, error: "room_full" });
    expect(addBot(s, "easy")).toEqual({ ok: false, error: "room_full" });
    s = must(joinLobby(s, { id: "a", name: "Novo nome" })).state;
    expect(s.players).toHaveLength(MAX_PLAYERS);
    expect(s.players[0].name).toBe("Novo nome");
    const playing = game({ word: "GATO" });
    expect(joinLobby(playing, { id: "z", name: "Z" })).toEqual({ ok: false, error: "game_in_progress" });
    // mas quem já estava na mesa volta
    expect(joinLobby(setPlayerConnected(playing, "b", false), { id: "b", name: "B" }).ok).toBe(true);
  });

  it("bots ganham ids e nomes próprios; nível pode mudar; só 3, 5 ou 8 palavras", () => {
    let s = lobby(["a"]);
    s = must(addBot(s, "easy")).state;
    s = must(addBot(s, "hard")).state;
    expect(s.players.map((p) => p.id)).toEqual(["a", "bot:1", "bot:2"]);
    expect(new Set(s.players.map((p) => p.name)).size).toBe(3);
    s = must(setBotLevel(s, "bot:1", "medium")).state;
    expect(s.players[1].bot).toBe("medium");
    expect(setBotLevel(s, "a", "hard")).toEqual({ ok: false, error: "not_a_bot" });
    expect(must(setRounds(s, 8)).state.rounds).toBe(8);
    expect(setRounds(s, 4)).toEqual({ ok: false, error: "bad_rounds" });
  });

  it("precisa de 2 pra começar; no meio da partida sair só desconecta", () => {
    expect(canStart(lobby(["a"]))).toBe(false);
    expect(canStart(lobby(ids(2)))).toBe(true);
    expect(startGame(lobby(["a"]))).toEqual({ ok: false, error: "not_enough_players" });
    const s = removePlayer(game({ word: "GATO" }), "b");
    expect(s.players).toHaveLength(2);
    expect(s.players[1].connected).toBe(false);
  });
});

describe("começar", () => {
  it("sorteia uma palavra com categoria, 6 vidas, vez do 1º jogador e zera tudo", () => {
    const s = must(startGame(lobby(ids(3)), mulberry32(7), 1000)).state;
    expect(s.phase).toBe("playing");
    expect(s.round!.lives).toBe(MAX_LIVES);
    expect(s.round!.guesses).toEqual([]);
    expect(s.round!.category.length).toBeGreaterThan(0);
    expect(s.turn).toBe(0);
    expect(s.turnDeadline).toBe(1000 + TIMING.TURN_MS);
    expect(s.gameNumber).toBe(1);
    expect(s.events).toEqual([{ t: "round", n: 1, category: s.round!.category, length: s.round!.norm.length }]);
    expect(s.players.every((p) => p.score === 0)).toBe(true);
  });

  it("só começa do lobby", () => {
    expect(startGame(game({ word: "GATO" }))).toEqual({ ok: false, error: "not_in_lobby" });
  });
});

describe("chutar letra", () => {
  it("acertou: +10 por ocorrência, a vez passa pro próximo e o relógio da vez recomeça", () => {
    const s = game({ word: "BANANA" });
    const r = must(guessLetter(s, "a", "a", 5000)).state;
    expect(score(r, "a")).toBe(3 * LETTER_POINTS);
    expect(currentPlayer(r)!.id).toBe("b");
    expect(r.round!.lives).toBe(MAX_LIVES);
    expect(r.round!.guesses).toEqual([{ letter: "A", by: "a", hits: 3 }]);
    expect(r.turnDeadline).toBe(5000 + TIMING.TURN_MS);
    expect(r.events).toEqual([{ t: "letter", p: "a", letter: "A", hits: 3 }]);
    expect(r.eventSeq).toBe(s.eventSeq + 1);
  });

  it("errou: a mesa perde 1 vida, a vez passa e ninguém pontua", () => {
    const s = game({ word: "GATO" });
    const r = must(guessLetter(s, "a", "z", 0)).state;
    expect(r.round!.lives).toBe(MAX_LIVES - 1);
    expect(currentPlayer(r)!.id).toBe("b");
    expect(score(r, "a")).toBe(0);
    expect(r.stats!.a.misses).toBe(1);
  });

  it("a vez dá a volta na mesa", () => {
    let s = game({ word: "GATO", players: ids(3) });
    for (const l of ["Z", "X", "K"]) s = must(guessLetter(s, currentPlayer(s)!.id, l, 0)).state;
    expect(currentPlayer(s)!.id).toBe("a");
  });

  it("compara sem acento: A revela o Ã de AVIÃO (e minúscula vale)", () => {
    const s = game({ word: "AVIÃO" });
    const r = must(guessLetter(s, "a", "a", 0)).state;
    expect(r.round!.guesses[0].hits).toBe(2);
    const pattern = publicPattern(r.round!);
    expect(pattern).toEqual(["A", null, null, "Ã", null]);
    // "ã" normaliza pra A, que já tinha saído (agora a vez é do b)
    expect(guessLetter(r, "b", "ã", 0)).toEqual({ ok: false, error: "already_guessed" });
  });

  it("recusa fora da vez, letra repetida, não-letra e fora de partida", () => {
    const s = game({ word: "GATO" });
    expect(guessLetter(s, "b", "A", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessLetter(s, "zzz", "A", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessLetter(s, "a", "1", 0)).toEqual({ ok: false, error: "bad_letter" });
    expect(guessLetter(s, "a", "AB", 0)).toEqual({ ok: false, error: "bad_letter" });
    expect(guessLetter(s, "a", "", 0)).toEqual({ ok: false, error: "bad_letter" });
    const after = must(guessLetter(s, "a", "G", 0)).state;
    expect(guessLetter(after, "b", "g", 0)).toEqual({ ok: false, error: "already_guessed" });
    expect(guessLetter(lobby(ids(2)), "a", "A", 0)).toEqual({ ok: false, error: "not_playing" });
  });

  it("revelar a última letra completa a palavra: +30 e a rodada acaba", () => {
    const s = game({ word: "GATO", guessed: ["G", "A", "T"] });
    const r = must(guessLetter(s, "a", "O", 0)).state;
    expect(r.phase).toBe("round_end");
    expect(r.round!.status).toBe("won");
    expect(r.round!.solvedBy).toBe("a");
    expect(score(r, "a")).toBe(LETTER_POINTS + FINISH_BONUS);
    expect(r.stats!.a).toMatchObject({ hits: 1, solved: 1 });
    expect(r.events.map((e) => e.t)).toEqual(["letter", "won"]);
    expect(r.turnDeadline).toBe(0);
  });

  it("a sexta vida perdida fecha a forca: rodada perdida, palavra revelada, sem bônus", () => {
    const s = game({ word: "GATO", lives: 1 });
    const r = must(guessLetter(s, "a", "Z", 0)).state;
    expect(r.phase).toBe("round_end");
    expect(r.round).toMatchObject({ status: "lost", lives: 0, solvedBy: null });
    expect(r.events).toEqual([
      { t: "letter", p: "a", letter: "Z", hits: 0 },
      { t: "lost", word: "GATO" },
    ]);
    expect(r.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe("chutar a palavra inteira", () => {
  it("acertou: +10 por letra escondida + 30, e vale sem acento ou em minúscula", () => {
    const s = game({ word: "AVIÃO", guessed: ["A"] });
    expect(hiddenCount(s.round!)).toBe(3);
    const r = must(guessWord(s, "a", "aviao", 0)).state;
    expect(r.phase).toBe("round_end");
    expect(r.round!.status).toBe("won");
    expect(score(r, "a")).toBe(3 * LETTER_POINTS + FINISH_BONUS);
    expect(r.events).toEqual([
      { t: "word", p: "a", ok: true },
      { t: "won", p: "a", points: 3 * LETTER_POINTS + FINISH_BONUS },
    ]);
  });

  it("errou: a mesa perde 2 vidas, a vez passa; sem vidas suficientes a forca fecha", () => {
    const r = must(guessWord(game({ word: "GATO" }), "a", "CASA", 0)).state;
    expect(r.round!.lives).toBe(MAX_LIVES - WORD_PENALTY);
    expect(currentPlayer(r)!.id).toBe("b");
    expect(r.stats!.a.wordFails).toBe(1);
    const dead = must(guessWord(game({ word: "GATO", lives: 2 }), "a", "CASA", 0)).state;
    expect(dead.round).toMatchObject({ status: "lost", lives: 0 });
    expect(dead.phase).toBe("round_end");
    const one = must(guessWord(game({ word: "GATO", lives: 1 }), "a", "CASA", 0)).state;
    expect(one.round!.lives).toBe(0);
    expect(one.phase).toBe("round_end");
  });

  it("recusa palavra vazia/gigante, fora da vez e fora de partida", () => {
    const s = game({ word: "GATO" });
    expect(guessWord(s, "a", "", 0)).toEqual({ ok: false, error: "bad_word" });
    expect(guessWord(s, "a", "A", 0)).toEqual({ ok: false, error: "bad_word" });
    expect(guessWord(s, "a", "X".repeat(31), 0)).toEqual({ ok: false, error: "bad_word" });
    expect(guessWord(s, "b", "GATO", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessWord(lobby(ids(2)), "a", "GATO", 0)).toEqual({ ok: false, error: "not_playing" });
  });
});

describe("tempo da vez", () => {
  it("estourou: o servidor chuta uma letra comum por quem não jogou (marcada como auto)", () => {
    const s = game({ word: "GATO", now: 0 });
    const r = must(timeoutTurn(s, mulberry32(3), TIMING.TURN_MS)).state;
    const g = r.round!.guesses[0];
    expect(g.auto).toBe(true);
    expect(g.by).toBe("a");
    expect("AEOSR").toContain(g.letter);
    expect(r.events[0]).toMatchObject({ t: "letter", auto: true });
  });

  it("nunca repete uma letra já chutada", () => {
    let s = game({ word: "XYLOPHONE", guessed: ["A", "E", "O", "S"] });
    const rng = mulberry32(5);
    while (s.phase === "playing") {
      s = must(timeoutTurn(s, rng, 0)).state;
      const letters = s.round!.guesses.map((g) => g.letter);
      expect(new Set(letters).size).toBe(letters.length);
    }
    expect(s.phase).toBe("round_end");
  });

  it("recusa fora de partida", () => {
    expect(timeoutTurn(lobby(ids(2)), mulberry32(1), 0)).toEqual({ ok: false, error: "not_playing" });
  });
});

describe("próxima palavra e fim", () => {
  const won = (s: ReturnType<typeof game>) => must(guessWord(s, "a", s.round!.word, 0)).state;

  it("avança pra palavra seguinte (nova, sem repetir), recomeça as vidas e gira quem abre", () => {
    const end = won(game({ word: "GATO", rounds: 3 }));
    const r = must(advanceRound(end, mulberry32(2), 9000)).state;
    expect(r.phase).toBe("playing");
    expect(r.roundNo).toBe(2);
    expect(r.round!.word).not.toBe("GATO");
    expect(r.round!.lives).toBe(MAX_LIVES);
    expect(r.round!.guesses).toEqual([]);
    expect(currentPlayer(r)!.id).toBe("b");
    expect(r.turnDeadline).toBe(9000 + TIMING.TURN_MS);
    expect(r.usedWords).toEqual(["GATO", r.round!.word]);
  });

  it("só avança com a rodada parada", () => {
    expect(advanceRound(game({ word: "GATO" }), mulberry32(1), 0)).toEqual({ ok: false, error: "not_round_end" });
  });

  it("depois da última palavra: fim de jogo com classificação por pontos (vence quem fez mais)", () => {
    let end = won(game({ word: "GATO", rounds: 3, roundNo: 3 }));
    end = { ...end, players: end.players.map((p) => (p.id === "b" ? { ...p, score: 5 } : p)) };
    const r = must(advanceRound(end, mulberry32(1), 0)).state;
    expect(r.phase).toBe("game_over");
    expect(r.winnerId).toBe("a");
    expect(r.standings!.map((s) => s.playerId)).toEqual(["a", "b"]);
    expect(r.standings![0]).toMatchObject({ solved: 1, score: 4 * LETTER_POINTS + FINISH_BONUS });
    expect(r.standings![1]).toMatchObject({ hits: 0, misses: 0, solved: 0, wordFails: 0 });
  });

  it("empate em pontos desempata por palavras completadas e depois por letras", () => {
    const base = won(game({ word: "GATO", rounds: 1 }));
    const tie = {
      ...base,
      players: base.players.map((p) => ({ ...p, score: 50 })),
      stats: { a: { hits: 1, misses: 0, solved: 0, wordFails: 0 }, b: { hits: 1, misses: 0, solved: 2, wordFails: 0 } },
    };
    const r = must(advanceRound(tie, mulberry32(1), 0)).state;
    expect(r.winnerId).toBe("b");
  });

  it("revanche volta pro lobby mantendo bots e quem segue conectado, com a pontuação zerada", () => {
    let s = game({ word: "GATO", players: ["a", "b", "c"] });
    s = must(addBotInGame(s)).state;
    s = setPlayerConnected(s, "c", false);
    const back = returnToLobby({ ...s, phase: "game_over" });
    expect(back.phase).toBe("lobby");
    expect(back.players.map((p) => p.id)).toEqual(["a", "b", "bot:1"]);
    expect(back.players.every((p) => p.score === 0)).toBe(true);
    expect(back.round).toBeNull();
    expect(back.gameNumber).toBe(s.gameNumber);
  });
});

// addBot só vale no lobby: monta o estado "de partida" com um bot já sentado.
function addBotInGame(s: ReturnType<typeof game>) {
  const withBot = must(addBot({ ...s, phase: "lobby" }, "easy")).state;
  return { ok: true as const, state: { ...withBot, phase: s.phase } };
}

describe("o que os clientes enxergam", () => {
  it("durante a rodada só vai o que foi revelado: nada da palavra escondida", () => {
    const s = game({ word: "AVIÃO", guessed: ["A", "Z"] });
    const v = toView(s);
    expect(v.pattern).toEqual(["A", null, null, "Ã", null]);
    expect(v.word).toBeNull();
    expect(v.category).toBe("Teste");
    const raw = JSON.stringify(v);
    expect(raw).not.toContain("AVIÃO");
    expect(raw).not.toContain("AVIAO");
    expect(raw).not.toContain('"norm"');
    expect(v.lives).toBe(MAX_LIVES);
    expect(v.maxLives).toBe(MAX_LIVES);
  });

  it("o evento da forca fechando não vaza a palavra enquanto a rodada está aberta (defesa extra)", () => {
    const s = game({ word: "GATO" });
    const v = toView({ ...s, events: [{ t: "lost", word: "GATO" }] });
    expect(JSON.stringify(v)).not.toContain("GATO");
  });

  it("depois que a rodada acaba, mostra a palavra inteira, com acento", () => {
    const end = must(guessWord(game({ word: "AVIÃO" }), "a", "avião", 0)).state;
    const v = toView(end);
    expect(v.word).toBe("AVIÃO");
    expect(v.pattern.join("")).toBe("AVIÃO");
    expect(v.status).toBe("won");
    expect(v.solvedBy).toBe("a");
  });

  it("no lobby a visão não tem rodada nenhuma", () => {
    const v = toView(lobby(ids(2)));
    expect(v.pattern).toEqual([]);
    expect(v.category).toBeNull();
    expect(v.status).toBeNull();
  });
});
