import { describe, expect, it } from "vitest";
import { ALL_CARDS, DECK_SIZE, commonSymbol } from "./cards";
import {
  DobbleState,
  LOCK_MS,
  MAX_PLAYERS,
  addBot,
  advanceRound,
  beginPlay,
  canStart,
  claim,
  createLobby,
  joinLobby,
  matchFor,
  removePlayer,
  returnToLobby,
  setMode,
  setPlayerConnected,
  startGame,
  toView,
} from "./engine";

function unwrap(r: { ok: true; state: DobbleState } | { ok: false; error: string }): DobbleState {
  if (!r.ok) throw new Error(`esperava ok, veio erro: ${r.error}`);
  return r.state;
}

function room(ids: string[], mode: "tower" | "well" = "tower"): DobbleState {
  let s = createLobby();
  for (const id of ids) s = unwrap(joinLobby(s, { id, name: id }));
  return unwrap(setMode(s, mode));
}

/** Partida já na 1ª rodada. */
function playing(ids: string[], mode: "tower" | "well" = "tower"): DobbleState {
  return unwrap(beginPlay(unwrap(startGame(room(ids, mode)))));
}

describe("lobby", () => {
  it("o primeiro humano é o host; bots nunca viram host", () => {
    let s = createLobby();
    s = unwrap(addBot(s, "easy"));
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
    expect(s.hostId).toBe("ana");
    s = removePlayer(s, "ana");
    expect(s.hostId).toBeNull();
  });

  it("aceita até 8 jogadores e recusa quem chega com a partida rolando", () => {
    let s = createLobby();
    for (let i = 0; i < MAX_PLAYERS; i++) s = unwrap(joinLobby(s, { id: `p${i}`, name: `p${i}` }));
    expect(joinLobby(s, { id: "extra", name: "x" })).toEqual({ ok: false, error: "room_full" });
    expect(addBot(s, "easy")).toEqual({ ok: false, error: "room_full" });

    const started = unwrap(startGame(s));
    expect(joinLobby(started, { id: "extra", name: "x" })).toEqual({ ok: false, error: "game_in_progress" });
  });

  it("reconexão só marca como conectado; precisa de 2+ pra começar", () => {
    let s = room(["ana"]);
    expect(canStart(s)).toBe(false);
    expect(startGame(s)).toEqual({ ok: false, error: "not_enough_players" });
    s = setPlayerConnected(s, "ana", false);
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana", avatarUrl: "a.png" }));
    expect(s.players[0]).toMatchObject({ connected: true, avatarUrl: "a.png" });
  });

  it("modo só muda no lobby", () => {
    const s = room(["a", "b"]);
    expect(unwrap(setMode(s, "well")).mode).toBe("well");
    expect(setMode(playing(["a", "b"]), "well")).toEqual({ ok: false, error: "not_in_lobby" });
    expect(setMode(s, "x" as never)).toEqual({ ok: false, error: "bad_mode" });
  });
});

describe("distribuição", () => {
  it("Torre: uma carta pra cada, centro à parte, o resto no monte — nada repetido", () => {
    const s = unwrap(startGame(room(["a", "b", "c"], "tower")));
    expect(s.phase).toBe("countdown");
    const all = [s.center!, ...s.players.map((p) => p.hand!), ...s.draw];
    expect(all).toHaveLength(DECK_SIZE);
    expect(new Set(all).size).toBe(DECK_SIZE);
    expect(s.players.every((p) => p.stack === 1)).toBe(true);
  });

  it("Poço: montes iguais, sem repetir carta (sobras ficam de fora)", () => {
    const s = unwrap(startGame(room(["a", "b", "c"], "well")));
    const per = Math.floor((DECK_SIZE - 1) / 3);
    expect(s.players.map((p) => p.pile.length)).toEqual([per, per, per]);
    const all = [s.center!, ...s.players.flatMap((p) => p.pile)];
    expect(new Set(all).size).toBe(all.length);
  });

  it("durante a contagem a visão pública esconde todas as cartas; depois mostra só o que está virado", () => {
    const s = unwrap(startGame(room(["a", "b"], "tower")));
    const v0 = toView(s);
    expect(v0.center).toBeNull();
    expect(v0.players.every((p) => p.hand === null)).toBe(true);
    expect(JSON.stringify(v0)).not.toContain('"draw"');

    const v1 = toView(unwrap(beginPlay(s)));
    expect(v1.center).not.toBeNull();
    expect(v1.players.every((p) => p.hand !== null)).toBe(true);
    // o monte nunca vaza: só a contagem
    expect(v1.drawCount).toBe(DECK_SIZE - 1 - 2);
    expect(JSON.stringify(v1)).not.toContain('"pile"');
  });
});

describe("claim", () => {
  it("acertar o símbolo em comum ganha a rodada e segura a mesa em round_end", () => {
    const s = playing(["ana", "beto"]);
    const sym = matchFor(s, "ana")!;
    const next = unwrap(claim(s, "ana", sym, s.round, 1000));
    expect(next.phase).toBe("round_end");
    expect(next.lastClaim).toMatchObject({ playerId: "ana", symbol: sym, round: 1 });
    // as cartas só trocam ao avançar
    expect(next.center).toBe(s.center);
    expect(next.players[0].hand).toBe(s.players[0].hand);
  });

  it("errar dá castigo (LOCK_MS) e não encerra a rodada", () => {
    const s = playing(["ana", "beto"]);
    const hand = s.players[0].hand!;
    const wrong = ALL_CARDS[hand].find((x) => x !== matchFor(s, "ana"))!;
    const next = unwrap(claim(s, "ana", wrong, s.round, 5000));
    expect(next.phase).toBe("playing");
    expect(next.lastWrong).toMatchObject({ playerId: "ana", symbol: wrong });
    expect(next.lockedUntil.ana).toBe(5000 + LOCK_MS);
    // de castigo não joga — nem o símbolo certo
    expect(claim(next, "ana", matchFor(next, "ana")!, next.round, 5000 + LOCK_MS - 1)).toEqual({ ok: false, error: "locked" });
    // passou o castigo: joga normal
    expect(claim(next, "ana", matchFor(next, "ana")!, next.round, 5000 + LOCK_MS).ok).toBe(true);
  });

  it("um símbolo que só está numa das cartas também é erro", () => {
    const s = playing(["ana", "beto"]);
    const onlyCenter = ALL_CARDS[s.center!].find((x) => x !== matchFor(s, "ana"))!;
    const next = unwrap(claim(s, "ana", onlyCenter, s.round, 0));
    expect(next.lastWrong?.symbol).toBe(onlyCenter);
    expect(next.phase).toBe("playing");
  });

  it("rodada errada, fora da fase e jogador desconhecido são recusados", () => {
    const s = playing(["ana", "beto"]);
    const sym = matchFor(s, "ana")!;
    expect(claim(s, "ana", sym, 99, 0)).toEqual({ ok: false, error: "late" });
    expect(claim(s, "zed", sym, s.round, 0)).toEqual({ ok: false, error: "not_in_room" });
    const ended = unwrap(claim(s, "ana", sym, s.round, 0));
    expect(claim(ended, "beto", matchFor(s, "beto")!, s.round, 0)).toEqual({ ok: false, error: "not_playing" });
    expect(claim(unwrap(startGame(room(["a", "b"]))), "a", 1, 0, 0)).toEqual({ ok: false, error: "not_playing" });
  });

  it("o primeiro a acertar vence — o segundo chega tarde", () => {
    const s = playing(["ana", "beto"]);
    const first = unwrap(claim(s, "beto", matchFor(s, "beto")!, s.round, 0));
    expect(claim(first, "ana", matchFor(s, "ana")!, s.round, 0).ok).toBe(false);
    expect(first.lastClaim?.playerId).toBe("beto");
  });
});

describe("modo Torre", () => {
  it("o vencedor leva a carta do centro (vira a carta dele) e uma nova entra no centro", () => {
    const s = playing(["ana", "beto"]);
    const centerBefore = s.center!;
    const won = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 0));
    expect(won.players[0].stack).toBe(2); // pontua na hora
    const next = unwrap(advanceRound(won));
    expect(next.phase).toBe("playing");
    expect(next.round).toBe(2);
    expect(next.players[0].hand).toBe(centerBefore);
    expect(next.players[1].hand).toBe(s.players[1].hand);
    expect(next.center).not.toBe(centerBefore);
    // a regra de ouro vale pra nova rodada: carta de cada um × centro novo = 1 símbolo
    for (const p of next.players) expect(commonSymbol(p.hand!, next.center!)).toBeGreaterThanOrEqual(0);
    expect(next.draw).toHaveLength(s.draw.length - 1);
  });

  it("termina quando o centro acaba: vence quem tem mais cartas", () => {
    let s = playing(["ana", "beto"]);
    let guard = 0;
    while (s.phase !== "game_over" && guard++ < 100) {
      const winner = s.round % 3 === 0 ? "beto" : "ana"; // beto leva 1 em cada 3
      const won = unwrap(claim(s, winner, matchFor(s, winner)!, s.round, 0));
      s = unwrap(advanceRound(won));
    }
    expect(s.phase).toBe("game_over");
    expect(s.center).toBeNull();
    expect(s.standings![0].playerId).toBe(s.winnerId);
    expect(s.winnerId).toBe("ana");
    // cada carta do baralho (55) está numa pilha: 2 iniciais + 53 do centro (a primeira + 52 do monte)
    const total = s.standings!.reduce((n, x) => n + x.cards, 0);
    expect(total).toBe(DECK_SIZE);
  });
});

describe("modo Poço", () => {
  it("o vencedor joga a carta no centro e vira a próxima do monte", () => {
    const s = playing(["ana", "beto"], "well");
    const handBefore = s.players[0].hand!;
    const pileBefore = s.players[0].pile.length;
    const won = unwrap(claim(s, "ana", matchFor(s, "ana")!, s.round, 0));
    const next = unwrap(advanceRound(won));
    expect(next.center).toBe(handBefore);
    expect(next.players[0].hand).not.toBe(handBefore);
    expect(next.players[0].pile).toHaveLength(pileBefore - 1);
    expect(next.players[1].hand).toBe(s.players[1].hand); // o outro não mexe
  });

  it("quem esvazia o monte primeiro vence", () => {
    let s = playing(["ana", "beto"], "well");
    let guard = 0;
    while (s.phase !== "game_over" && guard++ < 200) {
      const winner = s.round % 4 === 0 ? "beto" : "ana";
      s = unwrap(advanceRound(unwrap(claim(s, winner, matchFor(s, winner)!, s.round, 0))));
    }
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("ana");
    expect(s.players[0].hand).toBeNull();
    expect(s.standings![0]).toMatchObject({ playerId: "ana", cards: 0 });
    expect(s.standings![1].cards).toBeGreaterThan(0);
  });
});

describe("revanche", () => {
  it("volta pro lobby tirando quem caiu e mantendo bots e o modo", () => {
    let s = room(["ana", "beto"], "well");
    s = unwrap(addBot(s, "hard"));
    s = unwrap(startGame(s));
    s = setPlayerConnected(s, "beto", false);
    const lobby = returnToLobby({ ...s, phase: "game_over", winnerId: "ana" });
    expect(lobby.phase).toBe("lobby");
    expect(lobby.mode).toBe("well");
    expect(lobby.players.map((p) => p.id)).toEqual(["ana", "bot:1"]);
    expect(lobby.players.every((p) => p.hand === null && p.pile.length === 0)).toBe(true);
    expect(lobby.winnerId).toBeNull();
  });
});
