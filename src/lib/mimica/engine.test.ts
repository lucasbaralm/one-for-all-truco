import { describe, expect, it } from "vitest";
import { SONGS } from "./catalog";
import {
  MAX_PLAYERS,
  MAX_SPEED_BONUS,
  SONG_POINTS,
  acceptGuess,
  advanceTurn,
  autoPick,
  canStart,
  drawCard,
  giveUp,
  joinLobby,
  pickSong,
  removePlayer,
  returnToLobby,
  setPlayerConnected,
  setRounds,
  showHint,
  skipTurn,
  startGame,
  submitGuess,
  timeoutMime,
  toView,
} from "./engine";
import { ids, lobby, miming, must, picking, seq, songNamed } from "./testKit";
import { TIMING } from "./timing";

const BR = "Lapada Dela"; // do Brasil: vale 10
const WORLD = "Blinding Lights"; // do mundo: vale 15

describe("sala", () => {
  it("o primeiro vira host; quem já está volta ao reconectar; a sala enche em 8", () => {
    let s = lobby(["a", "b"]);
    expect(s.hostId).toBe("a");
    s = must(joinLobby(setPlayerConnected(s, "b", false), { id: "b", name: "Novo nome", avatarUrl: "x.png" })).state;
    expect(s.players).toHaveLength(2);
    expect(s.players[1]).toMatchObject({ name: "Novo nome", avatarUrl: "x.png", connected: true });
    for (const id of ["c", "d", "e", "f", "g", "h"]) s = must(joinLobby(s, { id, name: id })).state;
    expect(s.players).toHaveLength(MAX_PLAYERS);
    expect(joinLobby(s, { id: "i", name: "i" })).toEqual({ ok: false, error: "room_full" });
  });

  it("depois que a partida começa só entra quem já era da sala", () => {
    const s = picking();
    expect(joinLobby(s, { id: "z", name: "Z" })).toEqual({ ok: false, error: "game_in_progress" });
    expect(joinLobby(s, { id: "a", name: "A" }).ok).toBe(true);
  });

  it("voltas: 1 a 5, só no lobby", () => {
    const s = lobby(["a", "b"]);
    expect(must(setRounds(s, 4)).state.rounds).toBe(4);
    expect(setRounds(s, 0)).toEqual({ ok: false, error: "bad_rounds" });
    expect(setRounds(s, 6)).toEqual({ ok: false, error: "bad_rounds" });
    expect(setRounds(picking(), 3)).toEqual({ ok: false, error: "not_in_lobby" });
  });

  it("precisa de 2 pessoas; sair do lobby tira a pessoa e passa o host, sair da partida só marca como fora", () => {
    expect(canStart(lobby(["a"]))).toBe(false);
    expect(canStart(lobby(["a", "b"]))).toBe(true);
    expect(startGame(lobby(["a"]))).toEqual({ ok: false, error: "not_enough_players" });
    const l = removePlayer(lobby(["a", "b", "c"]), "a");
    expect(l.players.map((p) => p.id)).toEqual(["b", "c"]);
    expect(l.hostId).toBe("b");
    const g = removePlayer(picking(), "b");
    expect(g.players).toHaveLength(3);
    expect(g.players.find((p) => p.id === "b")!.connected).toBe(false);
  });
});

describe("a carta", () => {
  it("tem 4 músicas diferentes: 3 do Brasil e 1 do mundo", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { card } = drawCard([], seq([(seed * 0.137) % 1, (seed * 0.291) % 1, 0.5, 0.9]));
      expect(new Set(card).size).toBe(4);
      const kinds = card.map((id) => SONGS[id].kind);
      expect(kinds.filter((k) => k === "br")).toHaveLength(3);
      expect(kinds.filter((k) => k === "world")).toHaveLength(1);
    }
  });

  it("a música do mundo não fica sempre na mesma posição", () => {
    const positions = new Set<number>();
    let used: number[] = [];
    let r = 0.123;
    for (let i = 0; i < 40; i++) {
      r = (r * 7919 + 0.31) % 1;
      const next = drawCard(used, () => (r = (r * 7919 + 0.31) % 1));
      used = next.used;
      positions.add(next.card.findIndex((id) => SONGS[id].kind === "world"));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("não repete música enquanto há outras do mesmo lado, e o lado volta ao baralho quando acaba", () => {
    let used: number[] = [];
    const seen = new Set<number>();
    let r = 0.5;
    const rng = () => (r = (r * 9301 + 0.49297) % 1);
    for (let i = 0; i < 100; i++) {
      const next = drawCard(used, rng);
      used = next.used;
      for (const id of next.card) {
        expect(seen.has(id), `música ${id} repetiu antes da hora`).toBe(false);
        seen.add(id);
      }
    }
    // 100 cartas gastam as 300 do Brasil e 100 das 300 do mundo
    expect(seen.size).toBe(400);
    const again = drawCard(used, rng); // o Brasil acabou: volta ao baralho; o mundo segue sem repetir
    expect(again.card.filter((id) => SONGS[id].kind === "br")).toHaveLength(3);
    expect(again.card.filter((id) => SONGS[id].kind === "world").every((id) => !seen.has(id))).toBe(true);
  });
});

describe("começar a partida", () => {
  it("abre a escolha com o 1º jogador, a carta e o prazo", () => {
    const s = must(startGame({ ...lobby(ids(3)), rounds: 2 }, () => 0.3, 5000)).state;
    expect(s.phase).toBe("picking");
    expect(s.turnNo).toBe(1);
    expect(s.totalTurns).toBe(6); // 3 pessoas × 2 voltas
    expect(s.turn!.mimerId).toBe("a");
    expect(s.turn!.card).toHaveLength(4);
    expect(s.turn!.status).toBe("picking");
    expect(s.deadline).toBe(5000 + TIMING.PICK_MS);
    expect(s.gameNumber).toBe(1);
    expect(s.events).toEqual([{ t: "turn", n: 1, mimer: "a" }]);
    expect(s.used).toHaveLength(4);
  });

  it("zera a pontuação de uma partida anterior", () => {
    const l = { ...lobby(ids(2)), players: lobby(ids(2)).players.map((p) => ({ ...p, score: 99 })) };
    expect(must(startGame(l)).state.players.every((p) => p.score === 0)).toBe(true);
  });

  it("só começa no lobby", () => {
    expect(startGame(picking())).toEqual({ ok: false, error: "not_in_lobby" });
  });
});

describe("escolher a música", () => {
  it("só o mimer escolhe, e só da carta", () => {
    const s = picking();
    const [first] = s.turn!.card;
    expect(pickSong(s, "b", first, 0)).toEqual({ ok: false, error: "not_mimer" });
    expect(pickSong(s, "a", 5, 0)).toEqual({ ok: false, error: "bad_song" });
    expect(pickSong(lobby(ids(2)), "a", first, 0)).toEqual({ ok: false, error: "not_picking" });
    expect(pickSong(miming(), "a", first, 0)).toEqual({ ok: false, error: "not_picking" });
  });

  it("começa a mímica: relógio de 90 s, dica na metade, anúncio sem entregar o título", () => {
    const s = picking({ title: BR });
    const song = songNamed(BR);
    const r = must(pickSong(s, "a", song.id, 2000)).state;
    expect(r.phase).toBe("miming");
    expect(r.turn!.songId).toBe(song.id);
    expect(r.turn!.status).toBe("miming");
    expect(r.deadline).toBe(2000 + TIMING.MIME_MS);
    expect(r.hintAt).toBe(2000 + TIMING.MIME_MS * TIMING.HINT_AT);
    expect(r.stats!.a.mimed).toBe(1);
    expect(r.events).toEqual([{ t: "picked", p: "a", kind: "br", words: 2, letters: 10 }]);
    expect(JSON.stringify(r.events)).not.toContain("Lapada");
  });

  it("se o tempo acaba o servidor escolhe uma da carta (marcada como automática)", () => {
    const s = picking();
    const r = must(autoPick(s, seq([0.99]), 1000)).state;
    expect(r.phase).toBe("miming");
    expect(r.turn!.songId).toBe(s.turn!.card[3]);
    expect(r.events[0]).toMatchObject({ t: "picked", p: "a", auto: true });
    expect(autoPick(miming(), () => 0, 0)).toEqual({ ok: false, error: "not_picking" });
  });
});

describe("chutar", () => {
  it("só na mímica, só quem está na mesa e não quem faz a mímica", () => {
    expect(submitGuess(picking(), "b", "qualquer", 0)).toEqual({ ok: false, error: "not_miming" });
    const s = miming();
    expect(submitGuess(s, "a", "qualquer", 0)).toEqual({ ok: false, error: "mimer_cannot_guess" });
    expect(submitGuess(s, "fora", "qualquer", 0)).toEqual({ ok: false, error: "not_in_room" });
  });

  it("recusa texto vazio, só pontuação e comprido demais", () => {
    const s = miming();
    expect(submitGuess(s, "b", "", 0)).toEqual({ ok: false, error: "bad_guess" });
    expect(submitGuess(s, "b", "   ", 0)).toEqual({ ok: false, error: "bad_guess" });
    expect(submitGuess(s, "b", "?!?!", 0)).toEqual({ ok: false, error: "bad_guess" });
    expect(submitGuess(s, "b", "x".repeat(61), 0)).toEqual({ ok: false, error: "bad_guess" });
  });

  it("chute errado fica à mostra pra todos, conta como erro e não muda a vez nem o relógio", () => {
    const s = miming({ title: BR });
    const r = must(submitGuess(s, "b", "  Blinding   Lights ", 1000)).state;
    expect(r.phase).toBe("miming");
    expect(r.turn!.guesses).toEqual([{ n: 1, by: "b", text: "Blinding Lights", ok: false }]);
    expect(r.events).toEqual([{ t: "wrong", p: "b", text: "Blinding Lights" }]);
    expect(r.stats!.b.wrong).toBe(1);
    expect(r.deadline).toBe(s.deadline);
    expect(r.players.every((p) => p.score === 0)).toBe(true);
  });

  it("um chute por vez (700 ms) e o mesmo chute duas vezes não vale", () => {
    let s = miming({ title: BR });
    s = must(submitGuess(s, "b", "um", 1000)).state;
    expect(submitGuess(s, "b", "dois", 1500)).toEqual({ ok: false, error: "too_fast" });
    expect(submitGuess(s, "c", "dois", 1500).ok).toBe(true); // o limite é por pessoa
    expect(submitGuess(s, "b", "dois", 1000 + TIMING.GUESS_COOLDOWN_MS).ok).toBe(true);
    s = must(submitGuess(s, "b", "dois", 2000)).state;
    expect(submitGuess(s, "b", "  DOIS! ", 4000)).toEqual({ ok: false, error: "already_guessed" });
  });

  it("acertar encerra o turno: chutador leva o valor + rapidez, mimer leva o valor", () => {
    const s = miming({ title: BR, startedAt: 0 });
    const r = must(submitGuess(s, "c", "lapada dela", 1000)).state;
    expect(r.phase).toBe("turn_end");
    expect(r.turn!.status).toBe("solved");
    expect(r.turn!.solvedBy).toBe("c");
    expect(r.deadline).toBe(0);
    expect(r.hintAt).toBe(0);
    expect(r.players.find((p) => p.id === "c")!.score).toBe(SONG_POINTS.br + MAX_SPEED_BONUS);
    expect(r.players.find((p) => p.id === "a")!.score).toBe(SONG_POINTS.br);
    expect(r.players.find((p) => p.id === "b")!.score).toBe(0);
    expect(r.stats!.c.guessed).toBe(1);
    expect(r.stats!.a.solvedMimes).toBe(1);
    expect(r.turn!.guesses).toEqual([{ n: 1, by: "c", text: "Lapada Dela", ok: true }]); // o texto certo, não o digitado
    expect(r.events).toEqual([{ t: "solved", p: "c", mimer: "a", points: 15, bonus: 5, mimerPoints: 10, title: "Lapada Dela", artist: "Grupo Menos É Mais" }]);
  });

  it("música do mundo vale 15; aceita acento, caixa, pontuação e um errinho de digitação", () => {
    const s = miming({ title: WORLD });
    expect(must(submitGuess(s, "b", "BLINDING LIGHTS!", 0)).state.players.find((p) => p.id === "a")!.score).toBe(SONG_POINTS.world);
    expect(must(submitGuess(s, "b", "blindin lihts", 0)).state.turn!.status).toBe("solved");
    expect(must(submitGuess(s, "b", "blinding light", 0)).state.turn!.status).toBe("solved");
  });

  it("a rapidez vale de 5 (começo) a 1 (fim)", () => {
    const at = (t: number) => {
      const r = must(submitGuess(miming({ title: BR, startedAt: 0 }), "b", BR, t)).state;
      return r.players.find((p) => p.id === "b")!.score - SONG_POINTS.br;
    };
    expect(at(0)).toBe(5);
    expect(at(1000)).toBe(5);
    expect(at(TIMING.MIME_MS / 2)).toBe(3);
    expect(at(TIMING.MIME_MS * 0.9)).toBe(1);
    expect(at(TIMING.MIME_MS - 1)).toBe(1);
    expect(at(TIMING.MIME_MS + 5000)).toBe(1); // atrasado por um fio: nunca negativo
  });

  it("depois que alguém acertou ninguém mais chuta", () => {
    const solved = must(submitGuess(miming({ title: BR }), "b", BR, 0)).state;
    expect(submitGuess(solved, "c", BR, 100)).toEqual({ ok: false, error: "not_miming" });
  });

  it("só os últimos 30 chutes ficam guardados", () => {
    let s = miming({ title: BR, players: ids(4) });
    for (let i = 0; i < 40; i++) s = must(submitGuess(s, ids(4)[1 + (i % 3)], `chute numero ${i} aleatorio`, 1000 * (i + 1))).state;
    expect(s.turn!.guesses).toHaveLength(30);
    expect(s.turn!.guesses[29].n).toBe(40);
    expect(s.turn!.guesses[0].n).toBe(11);
  });
});

describe("aceitar na mão", () => {
  it("o mimer aceita um chute errado: ele vira acerto de quem chutou", () => {
    let s = miming({ title: WORLD });
    s = must(submitGuess(s, "b", "blinding", 1000)).state; // incompleto: o servidor recusa
    s = must(submitGuess(s, "c", "luzes cegantes", 2000)).state;
    const r = must(acceptGuess(s, "a", 2, 3000)).state;
    expect(r.phase).toBe("turn_end");
    expect(r.turn!.solvedBy).toBe("c");
    expect(r.turn!.guesses.find((g) => g.n === 2)).toMatchObject({ by: "c", ok: true });
    expect(r.players.find((p) => p.id === "c")!.score).toBeGreaterThan(SONG_POINTS.world);
    expect(r.players.find((p) => p.id === "a")!.score).toBe(SONG_POINTS.world);
    expect(r.events[0]).toMatchObject({ t: "solved", p: "c", accepted: true });
  });

  it("só o mimer, só chute que existe e ainda errado", () => {
    let s = miming({ title: WORLD });
    s = must(submitGuess(s, "b", "blinding", 1000)).state;
    expect(acceptGuess(s, "b", 1, 2000)).toEqual({ ok: false, error: "not_mimer" });
    expect(acceptGuess(s, "a", 9, 2000)).toEqual({ ok: false, error: "no_such_guess" });
    expect(acceptGuess(picking(), "a", 1, 0)).toEqual({ ok: false, error: "not_miming" });
  });
});

describe("dica, tempo esgotado, desistir e pular", () => {
  it("a dica mostra a primeira letra de cada palavra, uma vez só", () => {
    const s = miming({ title: BR });
    const show = (state: typeof s, viewer: string) => toView(state, viewer).pattern.map((c) => c ?? "_").join("");
    expect(show(s, "b")).toBe("______ ____");
    const h = must(showHint(s)).state;
    expect(show(h, "b")).toBe("L_____ D___");
    expect(h.hintAt).toBe(0);
    expect(h.events).toEqual([{ t: "hint" }]);
    expect(showHint(h)).toEqual({ ok: false, error: "no_hint" });
    expect(showHint(picking())).toEqual({ ok: false, error: "no_hint" });
  });

  it("o tempo acabar encerra sem pontos e conta como mímica que ninguém entendeu", () => {
    const r = must(timeoutMime(miming({ title: BR }))).state;
    expect(r.phase).toBe("turn_end");
    expect(r.turn!.status).toBe("timeout");
    expect(r.players.every((p) => p.score === 0)).toBe(true);
    expect(r.stats!.a.failedMimes).toBe(1);
    expect(r.events).toEqual([{ t: "timeout", title: "Lapada Dela", artist: "Grupo Menos É Mais" }]);
    expect(timeoutMime(picking())).toEqual({ ok: false, error: "not_miming" });
  });

  it("desistir é do mimer e revela a música", () => {
    const s = miming({ title: BR });
    expect(giveUp(s, "b")).toEqual({ ok: false, error: "not_mimer" });
    const r = must(giveUp(s, "a")).state;
    expect(r.turn!.status).toBe("timeout");
    expect(r.events[0]).toMatchObject({ t: "timeout", gaveUp: true, title: "Lapada Dela" });
    expect(giveUp(picking(), "a")).toEqual({ ok: false, error: "not_miming" });
  });

  it("pular o turno de quem caiu: sem pontos e sem contar como mímica falhada", () => {
    const fromPick = must(skipTurn(picking())).state;
    expect(fromPick.turn!.status).toBe("skipped");
    expect(fromPick.events).toEqual([{ t: "skipped", p: "a", title: null, artist: null }]);
    const fromMime = must(skipTurn(miming({ title: BR }))).state;
    expect(fromMime.events).toEqual([{ t: "skipped", p: "a", title: "Lapada Dela", artist: "Grupo Menos É Mais" }]);
    expect(fromMime.stats!.a.failedMimes ?? 0).toBe(0);
    expect(skipTurn(lobby(ids(2)))).toEqual({ ok: false, error: "not_playing" });
  });
});

describe("passar de turno e terminar", () => {
  it("o rodízio segue a ordem da sala e a carta é nova a cada turno", () => {
    let s = must(timeoutMime(miming({ players: ids(3), rounds: 2 }))).state;
    const mimers: string[] = [s.turn!.mimerId];
    const cards = new Set<string>([s.turn!.card.join()]);
    for (let i = 0; i < 5; i++) {
      s = must(advanceTurn(s, () => 0.4 + i * 0.1, 0)).state;
      expect(s.phase).toBe("picking");
      expect(s.deadline).toBe(TIMING.PICK_MS);
      mimers.push(s.turn!.mimerId);
      cards.add(s.turn!.card.join());
      s = must(timeoutMime(must(autoPick(s, () => 0, 0)).state)).state;
    }
    expect(mimers).toEqual(["a", "b", "c", "a", "b", "c"]);
    expect(cards.size).toBe(6);
  });

  it("só avança de um turno encerrado", () => {
    expect(advanceTurn(miming(), () => 0, 0)).toEqual({ ok: false, error: "not_turn_end" });
  });

  it("depois do último turno termina: vence quem tem mais pontos (empate: quem acertou mais)", () => {
    let s = miming({ players: ids(2), rounds: 1 });
    s = must(submitGuess(s, "b", s.turn!.songId !== null ? SONGS[s.turn!.songId].title : "", 0)).state; // turno 1: b acerta
    s = must(advanceTurn(s, () => 0, 0)).state;
    s = must(autoPick(s, () => 0, 0)).state;
    s = must(timeoutMime(s)).state; // turno 2: ninguém acerta
    const end = must(advanceTurn(s, () => 0, 0)).state;
    expect(end.phase).toBe("game_over");
    expect(end.winnerId).toBe("b");
    expect(end.standings!.map((x) => x.playerId)).toEqual(["b", "a"]);
    expect(end.standings![0]).toMatchObject({ score: 15, guessed: 1, mimed: 1 });
    expect(end.standings![1]).toMatchObject({ score: 10, solvedMimes: 1, mimed: 1 });
    expect(end.events).toEqual([]);
    expect(end.turn).not.toBeNull();
  });

  it("revanche: volta pro lobby só com quem segue conectado e pontos zerados", () => {
    let end = must(advanceTurn(must(timeoutMime(miming({ players: ids(2), rounds: 1 }))).state, () => 0, 0)).state;
    end = must(timeoutMime(must(autoPick(end, () => 0, 0)).state)).state;
    end = must(advanceTurn(end, () => 0, 0)).state;
    expect(end.phase).toBe("game_over");
    const back = returnToLobby(setPlayerConnected(end, "b", false));
    expect(back.phase).toBe("lobby");
    expect(back.players.map((p) => p.id)).toEqual(["a"]);
    expect(back.players[0].score).toBe(0);
    expect(back.turn).toBeNull();
    expect(back.standings).toBeNull();
    expect(back.used.length).toBeGreaterThan(0); // o baralho segue de onde parou
  });
});

describe("o que cada pessoa enxerga (sigilo)", () => {
  const cardTitles = (s: ReturnType<typeof picking>) => s.turn!.card.map((id) => SONGS[id]);
  const raw = (v: unknown) => JSON.stringify(v);

  it("escolhendo: só o mimer recebe a carta", () => {
    const s = picking();
    const mine = toView(s, "a");
    expect(mine.card).toHaveLength(4);
    expect(mine.card!.map((c) => c.id)).toEqual(s.turn!.card);
    expect(mine.card!.every((c) => c.points === SONG_POINTS[c.kind])).toBe(true);
    for (const viewer of ["b", "c", null, "intruso"]) {
      const v = toView(s, viewer);
      expect(v.card).toBeNull();
      expect(v.song).toBeNull();
      expect(v.pattern).toEqual([]);
      for (const song of cardTitles(s)) {
        expect(raw(v)).not.toContain(song.title);
        expect(raw(v)).not.toContain(song.artist);
      }
    }
  });

  it("na mímica: o mimer vê a música; os outros só o lado, o valor e as casinhas", () => {
    const s = miming({ title: WORLD });
    const mine = toView(s, "a");
    expect(mine.song).toMatchObject({ title: WORLD, artist: "The Weeknd", kind: "world", points: 15 });
    expect(mine.card).toBeNull();
    for (const viewer of ["b", "c", null, "intruso"]) {
      const v = toView(s, viewer);
      expect(v.song).toBeNull();
      expect(v.kind).toBe("world");
      expect(v.worth).toBe(15);
      expect(v.pattern.filter((c) => c === null)).toHaveLength(14);
      expect(raw(v)).not.toContain("Blinding");
      expect(raw(v)).not.toContain("Weeknd");
      expect(raw(v)).not.toContain("Lights");
    }
  });

  it("o título só chega a todos quando o turno acaba (pelo evento, pela música e pelas casinhas)", () => {
    const s = must(submitGuess(miming({ title: WORLD }), "b", WORLD, 0)).state;
    for (const viewer of ["a", "b", "c", null]) {
      const v = toView(s, viewer);
      expect(v.song).toMatchObject({ title: WORLD, artist: "The Weeknd" });
      expect(v.pattern.join("")).toBe(WORLD);
      expect(v.events[0]).toMatchObject({ t: "solved", title: WORLD });
    }
  });

  it("um evento com título nunca sai com o turno ainda aberto", () => {
    const open = { ...miming({ title: WORLD }), events: [{ t: "solved", p: "b", mimer: "a", points: 20, bonus: 5, mimerPoints: 15, title: WORLD, artist: "The Weeknd" } as const] };
    expect(raw(toView(open, "b"))).not.toContain("Blinding");
    // o mimer vê a própria música, mas o evento chega sem o título
    expect(toView(open, "a").events).toEqual([{ t: "solved", p: "b", mimer: "a", points: 20, bonus: 5, mimerPoints: 15, title: "", artist: "" }]);
  });

  it("a visão não traz o baralho nem a carta do estado", () => {
    const v = toView(miming(), "b") as unknown as Record<string, unknown>;
    expect(v).not.toHaveProperty("used");
    expect(v).not.toHaveProperty("turn");
    expect(v.card).toBeNull();
  });
});
