import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import {
  CHOOSER_POINTS_PER_ERROR,
  FINISH_BONUS,
  FORCA_VERSION,
  LETTER_POINTS,
  MAX_LIVES,
  MAX_PLAYERS,
  WORD_PENALTY,
  advanceRound,
  canStart,
  chooseWord,
  createLobby,
  currentPlayer,
  guessLetter,
  guessWord,
  hiddenCount,
  joinLobby,
  publicPattern,
  removePlayer,
  returnToLobby,
  setPlayerConnected,
  setRounds,
  skipChooser,
  skipTurn,
  startGame,
  timeoutTurn,
  toView,
} from "./engine";
import { choosing, game, ids, lobby, must } from "./testKit";
import { TIMING } from "./timing";

const score = (s: ReturnType<typeof game>, id: string) => s.players.find((p) => p.id === id)!.score;

describe("lobby", () => {
  it("o primeiro a entrar é o host; quem sai passa o posto adiante", () => {
    let s = must(joinLobby(createLobby(), { id: "ana", name: "Ana" })).state;
    s = must(joinLobby(s, { id: "bob", name: "Bob" })).state;
    expect(s.hostId).toBe("ana");
    s = removePlayer(s, "ana");
    expect(s.hostId).toBe("bob");
    s = removePlayer(s, "bob");
    expect(s.hostId).toBeNull();
  });

  it("a sala é de 2 a 4 pessoas: o 5º é recusado e a partida em andamento não aceita gente nova", () => {
    const full = lobby(ids(MAX_PLAYERS));
    expect(MAX_PLAYERS).toBe(4);
    expect(joinLobby(full, { id: "z", name: "Z" })).toEqual({ ok: false, error: "room_full" });
    // quem já está na sala só atualiza o nome
    const renamed = must(joinLobby(full, { id: "a", name: "Novo nome" })).state;
    expect(renamed.players).toHaveLength(MAX_PLAYERS);
    expect(renamed.players[0].name).toBe("Novo nome");
    const playing = game({ word: "GATO" });
    expect(joinLobby(playing, { id: "z", name: "Z" })).toEqual({ ok: false, error: "game_in_progress" });
    // mas quem já estava na mesa volta
    expect(joinLobby(setPlayerConnected(playing, "b", false), { id: "b", name: "B" }).ok).toBe(true);
  });

  it("o nº de palavras é de 1 a 5, e só o lobby muda isso", () => {
    const s = lobby(ids(2));
    for (const n of [1, 2, 3, 4, 5]) expect(must(setRounds(s, n)).state.rounds).toBe(n);
    for (const n of [0, 6, 8, 2.5]) expect(setRounds(s, n)).toEqual({ ok: false, error: "bad_rounds" });
    expect(setRounds(game({ word: "GATO" }), 2)).toEqual({ ok: false, error: "not_in_lobby" });
  });

  it("precisa de 2 pra começar; no meio da partida sair só desconecta", () => {
    expect(canStart(lobby(["a"]))).toBe(false);
    expect(canStart(lobby(ids(2)))).toBe(true);
    expect(startGame(lobby(["a"]))).toEqual({ ok: false, error: "not_enough_players" });
    const s = removePlayer(game({ word: "GATO" }), "b");
    expect(s.players).toHaveLength(3);
    expect(s.players[1].connected).toBe(false);
  });
});

describe("começar", () => {
  it("abre a escolha da palavra: o 1º jogador escolhe, ninguém tem palavra ainda, o tempo de escolher conta", () => {
    const s = must(startGame(lobby(ids(3)), 1000)).state;
    expect(s.phase).toBe("choosing");
    expect(s.version).toBe(FORCA_VERSION);
    expect(s.chooserId).toBe("a");
    expect(s.round).toBeNull();
    expect(s.turn).toBe(0);
    expect(s.roundNo).toBe(1);
    expect(s.turnDeadline).toBe(1000 + TIMING.CHOOSE_MS);
    expect(s.gameNumber).toBe(1);
    expect(s.events).toEqual([{ t: "round", n: 1, chooser: "a" }]);
    expect(s.players.every((p) => p.score === 0)).toBe(true);
  });

  it("só começa do lobby", () => {
    expect(startGame(game({ word: "GATO" }))).toEqual({ ok: false, error: "not_in_lobby" });
  });
});

describe("escolher a palavra", () => {
  it("o escolhedor digita: a rodada começa com o boneco inteiro por desenhar e a vez vai pro primeiro chutador", () => {
    const s = choosing();
    const r = must(chooseWord(s, "a", "borboleta", 500)).state;
    expect(r.phase).toBe("playing");
    expect(r.round).toMatchObject({ n: 1, word: "BORBOLETA", norm: "BORBOLETA", lives: MAX_LIVES, status: "playing", guesses: [] });
    expect(currentPlayer(r)!.id).toBe("b");
    expect(r.turnDeadline).toBe(500 + TIMING.TURN_MS);
    expect(r.events).toEqual([{ t: "chosen", p: "a", letters: 9, words: 1 }]);
    expect(r.stats!.a.chosen).toBe(1);
  });

  it("aceita frase (várias palavras) e acento: as letras contam sem os espaços", () => {
    const r = must(chooseWord(choosing(), "a", "pão  de queijo", 0)).state;
    expect(r.round).toMatchObject({ word: "PÃO DE QUEIJO", norm: "PAO DE QUEIJO" });
    expect(r.events).toEqual([{ t: "chosen", p: "a", letters: 11, words: 3 }]);
  });

  it("só quem escolhe nesta rodada, só na fase de escolha, e só palavra que presta", () => {
    const s = choosing();
    expect(chooseWord(s, "b", "gato", 0)).toEqual({ ok: false, error: "not_chooser" });
    expect(chooseWord(s, "zzz", "gato", 0)).toEqual({ ok: false, error: "not_chooser" });
    for (const bad of ["", "a", "guarda-chuva", "abc1", "x".repeat(31)]) expect(chooseWord(s, "a", bad, 0), bad).toEqual({ ok: false, error: "bad_word" });
    expect(chooseWord(game({ word: "GATO" }), "a", "outra", 0)).toEqual({ ok: false, error: "not_choosing" });
    expect(chooseWord(lobby(ids(2)), "a", "gato", 0)).toEqual({ ok: false, error: "not_choosing" });
  });

  it("o escolhedor gira a cada palavra (na ordem da sala), e o primeiro chutador é o seguinte a ele", () => {
    const r2 = choosing({ roundNo: 2 });
    expect(r2.chooserId).toBe("b");
    const g2 = must(chooseWord(r2, "b", "gato", 0)).state;
    expect(currentPlayer(g2)!.id).toBe("c");
    const g3 = must(chooseWord(choosing({ roundNo: 3 }), "c", "gato", 0)).state;
    expect(currentPlayer(g3)!.id).toBe("a");
    // com 2 pessoas, alternam
    expect(choosing({ players: ids(2), roundNo: 3 }).chooserId).toBe("a");
    expect(choosing({ players: ids(2), roundNo: 4 }).chooserId).toBe("b");
  });

  it("escolhedor que demora (ou sai): a rodada é pulada, sem pontos, e o próximo escolhe — ou o jogo acaba", () => {
    const skipped = must(skipChooser(choosing({ rounds: 3 }), 7000)).state;
    expect(skipped.phase).toBe("choosing");
    expect(skipped.roundNo).toBe(2);
    expect(skipped.chooserId).toBe("b");
    expect(skipped.turnDeadline).toBe(7000 + TIMING.CHOOSE_MS);
    expect(skipped.events).toEqual([
      { t: "skipped", p: "a" },
      { t: "round", n: 2, chooser: "b" },
    ]);
    expect(skipped.players.every((p) => p.score === 0)).toBe(true);
    const last = must(skipChooser(choosing({ rounds: 1 }), 0)).state;
    expect(last.phase).toBe("game_over");
    expect(last.events).toEqual([{ t: "skipped", p: "a" }]);
    expect(skipChooser(game({ word: "GATO" }), 0)).toEqual({ ok: false, error: "not_choosing" });
  });
});

describe("chutar letra", () => {
  it("acertou: +10 por ocorrência, a vez passa pro próximo, o boneco não muda e o relógio recomeça", () => {
    const s = game({ word: "BANANA" });
    const r = must(guessLetter(s, "b", "a", 5000)).state;
    expect(score(r, "b")).toBe(3 * LETTER_POINTS);
    expect(currentPlayer(r)!.id).toBe("c");
    expect(r.round!.lives).toBe(MAX_LIVES);
    expect(r.round!.guesses).toEqual([{ letter: "A", by: "b", hits: 3 }]);
    expect(r.turnDeadline).toBe(5000 + TIMING.TURN_MS);
    expect(r.events).toEqual([{ t: "letter", p: "b", letter: "A", hits: 3 }]);
    expect(r.eventSeq).toBe(s.eventSeq + 1);
  });

  it("errou: o boneco ganha uma parte (a mesa toda divide), a vez passa e ninguém pontua", () => {
    const r = must(guessLetter(game({ word: "GATO" }), "b", "z", 0)).state;
    expect(r.round!.lives).toBe(MAX_LIVES - 1);
    expect(currentPlayer(r)!.id).toBe("c");
    expect(r.players.every((p) => p.score === 0)).toBe(true);
    expect(r.stats!.b.misses).toBe(1);
  });

  it("a vez gira só entre quem chuta: nunca cai no escolhedor (3 e 4 pessoas, escolhedor de qualquer lugar)", () => {
    const order = (players: string[], roundNo: number, n: number) => {
      let s = game({ word: "XYLOPHONE", players, roundNo });
      const seen: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = currentPlayer(s)!.id;
        seen.push(id);
        s = must(guessLetter(s, id, "ZQKWYJ"[i], 0)).state;
      }
      return seen;
    };
    expect(order(ids(3), 1, 5)).toEqual(["b", "c", "b", "c", "b"]);
    expect(order(ids(4), 1, 6)).toEqual(["b", "c", "d", "b", "c", "d"]);
    expect(order(ids(4), 2, 6)).toEqual(["c", "d", "a", "c", "d", "a"]);
    expect(order(ids(4), 4, 4)).toEqual(["a", "b", "c", "a"]);
    expect(order(ids(2), 1, 3)).toEqual(["b", "b", "b"]);
  });

  it("o escolhedor não chuta a própria palavra; fora da vez, letra repetida, não-letra e fora de partida são recusados", () => {
    const s = game({ word: "GATO" });
    expect(guessLetter(s, "a", "A", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessLetter(s, "c", "A", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessLetter(s, "zzz", "A", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessLetter(s, "b", "1", 0)).toEqual({ ok: false, error: "bad_letter" });
    expect(guessLetter(s, "b", "AB", 0)).toEqual({ ok: false, error: "bad_letter" });
    expect(guessLetter(s, "b", "", 0)).toEqual({ ok: false, error: "bad_letter" });
    const after = must(guessLetter(s, "b", "G", 0)).state;
    expect(guessLetter(after, "c", "g", 0)).toEqual({ ok: false, error: "already_guessed" });
    expect(guessLetter(choosing(), "b", "A", 0)).toEqual({ ok: false, error: "not_playing" });
    expect(guessLetter(lobby(ids(2)), "a", "A", 0)).toEqual({ ok: false, error: "not_playing" });
  });

  it("compara sem acento: A revela o Ã de AVIÃO (e minúscula vale)", () => {
    const r = must(guessLetter(game({ word: "avião" }), "b", "a", 0)).state;
    expect(r.round!.guesses[0].hits).toBe(2);
    expect(publicPattern(r.round!)).toEqual(["A", null, null, "Ã", null]);
    expect(guessLetter(r, "c", "ã", 0)).toEqual({ ok: false, error: "already_guessed" });
  });

  it("frase: o espaço já aparece de cara, não é letra pra chutar e não conta como escondido", () => {
    const s = game({ word: "casa de papel" });
    expect(hiddenCount(s.round!)).toBe(11);
    expect(publicPattern(s.round!)).toEqual([null, null, null, null, " ", null, null, " ", null, null, null, null, null]);
    expect(guessLetter(s, "b", " ", 0)).toEqual({ ok: false, error: "bad_letter" });
    const r = must(guessLetter(s, "b", "A", 0)).state;
    expect(r.round!.guesses[0].hits).toBe(3);
    expect(publicPattern(r.round!)[1]).toBe("A");
    expect(publicPattern(r.round!)[4]).toBe(" ");
  });

  it("revelar a última letra completa a palavra: +30 pra quem completou, a rodada acaba", () => {
    const s = game({ word: "GATO", guessed: ["G", "A", "T"] });
    const r = must(guessLetter(s, "b", "O", 0)).state;
    expect(r.phase).toBe("round_end");
    expect(r.round!.status).toBe("won");
    expect(r.round!.solvedBy).toBe("b");
    expect(score(r, "b")).toBe(LETTER_POINTS + FINISH_BONUS);
    expect(r.stats!.b).toMatchObject({ hits: 1, solved: 1 });
    expect(r.events.map((e) => e.t)).toEqual(["letter", "won"]);
    expect(r.turnDeadline).toBe(0);
  });

  it("o escolhedor ganha 10 por parte do boneco que a mesa precisou desenhar pra acertar (palavra difícil paga)", () => {
    const easy = must(guessLetter(game({ word: "GATO", guessed: ["G", "A", "T"] }), "b", "O", 0)).state;
    expect(score(easy, "a")).toBe(0); // acertaram sem errar nada
    const hard = must(guessLetter(game({ word: "GATO", guessed: ["G", "A", "T"], lives: MAX_LIVES - 4 }), "b", "O", 0)).state;
    expect(score(hard, "a")).toBe(4 * CHOOSER_POINTS_PER_ERROR);
    expect(hard.events[1]).toEqual({ t: "won", p: "b", points: LETTER_POINTS + FINISH_BONUS, chooser: 40 });
    // quem completou não é o escolhedor: cada um fica com o seu
    expect(score(hard, "b")).toBe(LETTER_POINTS + FINISH_BONUS);
  });

  it("o boneco ficando completo (com o chapéu) fecha a forca: sem bônus, o escolhedor não ganha nada e conta como 'derrubou a mesa'", () => {
    const s = game({ word: "GATO", lives: 1 });
    const r = must(guessLetter(s, "b", "Z", 0)).state;
    expect(r.phase).toBe("round_end");
    expect(r.round).toMatchObject({ status: "lost", lives: 0, solvedBy: null });
    expect(r.events).toEqual([
      { t: "letter", p: "b", letter: "Z", hits: 0 },
      { t: "lost", word: "GATO" },
    ]);
    expect(r.players.every((p) => p.score === 0)).toBe(true);
    expect(r.stats!.a.stumped).toBe(1);
  });

  it("10 erros seguidos desenham o boneco todo: cabeça, tronco, 2 braços, 2 pernas, olhos, nariz, boca e chapéu", () => {
    expect(MAX_LIVES).toBe(10);
    let s = game({ word: "AAAA", players: ids(2) });
    const wrong = "BCDEFGHIJK";
    for (let i = 0; i < 9; i++) {
      s = must(guessLetter(s, "b", wrong[i], 0)).state;
      expect(s.phase).toBe("playing");
      expect(s.round!.lives).toBe(MAX_LIVES - 1 - i);
    }
    s = must(guessLetter(s, "b", wrong[9], 0)).state;
    expect(s.phase).toBe("round_end");
    expect(s.round!.status).toBe("lost");
  });
});

describe("chutar a palavra inteira", () => {
  it("acertou: +10 por letra escondida + 30; vale sem acento, sem espaço e em minúscula", () => {
    const s = game({ word: "AVIÃO", guessed: ["A"] });
    expect(hiddenCount(s.round!)).toBe(3);
    const r = must(guessWord(s, "b", "aviao", 0)).state;
    expect(r.phase).toBe("round_end");
    expect(r.round!.status).toBe("won");
    expect(score(r, "b")).toBe(3 * LETTER_POINTS + FINISH_BONUS);
    expect(r.events).toEqual([
      { t: "word", p: "b", ok: true },
      { t: "won", p: "b", points: 3 * LETTER_POINTS + FINISH_BONUS, chooser: 0 },
    ]);
    const phrase = must(guessWord(game({ word: "casa de papel" }), "b", "Casa de Papel", 0)).state;
    expect(phrase.round!.status).toBe("won");
    expect(must(guessWord(game({ word: "casa de papel" }), "b", "casadepapel", 0)).state.round!.status).toBe("won");
  });

  it("acertar também paga o escolhedor (10 por parte do boneco)", () => {
    const r = must(guessWord(game({ word: "GATO", lives: 6 }), "b", "GATO", 0)).state;
    expect(score(r, "a")).toBe(40);
    expect(r.events[1]).toMatchObject({ t: "won", chooser: 40 });
  });

  it("errou: o boneco ganha DUAS partes e a vez passa; sem partes suficientes a forca fecha", () => {
    const r = must(guessWord(game({ word: "GATO" }), "b", "CASA", 0)).state;
    expect(r.round!.lives).toBe(MAX_LIVES - WORD_PENALTY);
    expect(currentPlayer(r)!.id).toBe("c");
    expect(r.stats!.b.wordFails).toBe(1);
    const dead = must(guessWord(game({ word: "GATO", lives: 2 }), "b", "CASA", 0)).state;
    expect(dead.round).toMatchObject({ status: "lost", lives: 0 });
    expect(dead.phase).toBe("round_end");
    expect(dead.stats!.a.stumped).toBe(1);
    const one = must(guessWord(game({ word: "GATO", lives: 1 }), "b", "CASA", 0)).state;
    expect(one.round!.lives).toBe(0);
    expect(one.phase).toBe("round_end");
  });

  it("recusa palavra vazia/gigante, fora da vez, o escolhedor e fora de partida", () => {
    const s = game({ word: "GATO" });
    expect(guessWord(s, "b", "", 0)).toEqual({ ok: false, error: "bad_word" });
    expect(guessWord(s, "b", "A", 0)).toEqual({ ok: false, error: "bad_word" });
    expect(guessWord(s, "b", "X".repeat(31), 0)).toEqual({ ok: false, error: "bad_word" });
    expect(guessWord(s, "c", "GATO", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessWord(s, "a", "GATO", 0)).toEqual({ ok: false, error: "not_your_turn" });
    expect(guessWord(choosing(), "b", "GATO", 0)).toEqual({ ok: false, error: "not_playing" });
  });
});

describe("tempo da vez e quem caiu", () => {
  it("estourou: o servidor chuta uma letra comum por quem não jogou (marcada como auto)", () => {
    const s = game({ word: "GATO", now: 0 });
    const r = must(timeoutTurn(s, mulberry32(3), TIMING.TURN_MS)).state;
    const g = r.round!.guesses[0];
    expect(g.auto).toBe(true);
    expect(g.by).toBe("b");
    expect("AEOSR").toContain(g.letter);
    expect(r.events[0]).toMatchObject({ t: "letter", auto: true });
  });

  it("nunca repete uma letra já chutada, até acabar o boneco", () => {
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
    expect(skipTurn(choosing(), 0)).toEqual({ ok: false, error: "not_playing" });
  });

  it("quem devia chutar caiu: a vez passa pro próximo, sem castigo e sem mexer no boneco", () => {
    const s = game({ word: "GATO", now: 0 });
    const r = must(skipTurn(s, 9000)).state;
    expect(currentPlayer(r)!.id).toBe("c");
    expect(r.round!.lives).toBe(MAX_LIVES);
    expect(r.round!.guesses).toEqual([]);
    expect(r.turnDeadline).toBe(9000 + TIMING.TURN_MS);
    expect(r.events).toEqual([{ t: "away", p: "b" }]);
    expect(r.eventSeq).toBe(s.eventSeq + 1);
  });
});

describe("próxima palavra e fim", () => {
  const won = (s: ReturnType<typeof game>) => must(guessWord(s, currentPlayer(s)!.id, s.round!.word, 0)).state;

  it("avança pra palavra seguinte: outro escolhedor, sem palavra ainda, tempo de escolher", () => {
    const end = won(game({ word: "GATO", rounds: 3 }));
    const r = must(advanceRound(end, 9000)).state;
    expect(r.phase).toBe("choosing");
    expect(r.roundNo).toBe(2);
    expect(r.chooserId).toBe("b");
    expect(r.round).toBeNull();
    expect(r.turnDeadline).toBe(9000 + TIMING.CHOOSE_MS);
    expect(r.events).toEqual([{ t: "round", n: 2, chooser: "b" }]);
  });

  it("só avança com a rodada parada", () => {
    expect(advanceRound(game({ word: "GATO" }), 0)).toEqual({ ok: false, error: "not_round_end" });
    expect(advanceRound(choosing(), 0)).toEqual({ ok: false, error: "not_round_end" });
  });

  it("depois da última palavra: fim de jogo com classificação por pontos (vence quem fez mais)", () => {
    let end = won(game({ word: "GATO", rounds: 3, roundNo: 3 }));
    end = { ...end, players: end.players.map((p) => (p.id === "c" ? { ...p, score: 5 } : p)) };
    const r = must(advanceRound(end, 0)).state;
    expect(r.phase).toBe("game_over");
    expect(r.chooserId).toBeNull();
    // na 3ª palavra o escolhedor é o c, então quem chuta primeiro é o a: ele chutou a palavra e levou 4×10 + 30
    expect(r.winnerId).toBe("a");
    expect(r.standings!.map((s) => s.playerId)).toEqual(["a", "c", "b"]);
    expect(r.standings![0]).toMatchObject({ solved: 1, score: 4 * LETTER_POINTS + FINISH_BONUS });
    expect(r.standings![2]).toMatchObject({ hits: 0, misses: 0, solved: 0, wordFails: 0, chosen: 0, stumped: 0 });
  });

  it("empate em pontos desempata por palavras completadas e depois por letras", () => {
    const base = won(game({ word: "GATO", rounds: 1 }));
    const tie = {
      ...base,
      players: base.players.map((p) => ({ ...p, score: 50 })),
      stats: {
        a: { hits: 1, misses: 0, solved: 0, wordFails: 0, chosen: 0, stumped: 0 },
        b: { hits: 1, misses: 0, solved: 2, wordFails: 0, chosen: 0, stumped: 0 },
        c: { hits: 9, misses: 0, solved: 0, wordFails: 0, chosen: 0, stumped: 0 },
      },
    };
    expect(must(advanceRound(tie, 0)).state.winnerId).toBe("b");
  });

  it("revanche volta pro lobby mantendo só quem segue conectado, com a pontuação zerada", () => {
    let s = game({ word: "GATO", players: ids(4) });
    s = setPlayerConnected(s, "c", false);
    const back = returnToLobby({ ...s, phase: "game_over" });
    expect(back.phase).toBe("lobby");
    expect(back.players.map((p) => p.id)).toEqual(["a", "b", "d"]);
    expect(back.players.every((p) => p.score === 0)).toBe(true);
    expect(back.round).toBeNull();
    expect(back.chooserId).toBeNull();
    expect(back.gameNumber).toBe(s.gameNumber);
  });
});

describe("o que os clientes enxergam", () => {
  it("antes de escolherem a palavra ninguém tem nada dela", () => {
    const v = toView(choosing(), "a");
    expect(v.pattern).toEqual([]);
    expect(v.word).toBeNull();
    expect(v.chooserId).toBe("a");
    expect(v.phase).toBe("choosing");
  });

  it("durante a rodada só o escolhedor vê a palavra; os outros (e quem só assiste) veem o que foi revelado", () => {
    const s = game({ word: "AVIÃO", guessed: ["A", "Z"] });
    const chooser = toView(s, "a");
    expect(chooser.word).toBe("AVIÃO");
    for (const who of ["b", "c", null, "intruso"]) {
      const v = toView(s, who);
      expect(v.word, String(who)).toBeNull();
      expect(v.pattern).toEqual(["A", null, null, "Ã", null]);
      const raw = JSON.stringify(v);
      expect(raw).not.toContain("AVIÃO");
      expect(raw).not.toContain("AVIAO");
      expect(raw).not.toContain('"norm"');
    }
    expect(chooser.lives).toBe(MAX_LIVES);
    expect(chooser.maxLives).toBe(MAX_LIVES);
  });

  it("frase: os espaços aparecem no padrão de todo mundo, mas as letras escondidas não", () => {
    const v = toView(game({ word: "pão de queijo", guessed: ["Q"] }), "b");
    expect(v.pattern).toEqual([null, null, null, " ", null, null, " ", "Q", null, null, null, null, null]);
    expect(JSON.stringify(v)).not.toContain("QUEIJO");
  });

  it("o evento da forca fechando não vaza a palavra enquanto a rodada está aberta (defesa extra)", () => {
    const s = game({ word: "GATO" });
    const v = toView({ ...s, events: [{ t: "lost", word: "GATO" }] }, "b");
    expect(JSON.stringify(v)).not.toContain("GATO");
  });

  it("depois que a rodada acaba, todo mundo vê a palavra inteira, com acento", () => {
    const end = must(guessWord(game({ word: "AVIÃO" }), "b", "avião", 0)).state;
    for (const who of ["a", "b", "c", null]) {
      const v = toView(end, who);
      expect(v.word).toBe("AVIÃO");
      expect(v.pattern.join("")).toBe("AVIÃO");
      expect(v.status).toBe("won");
      expect(v.solvedBy).toBe("b");
    }
  });

  it("no lobby a visão não tem rodada nenhuma", () => {
    const v = toView(lobby(ids(2)), "a");
    expect(v.pattern).toEqual([]);
    expect(v.status).toBeNull();
    expect(v.chooserId).toBeNull();
  });
});
