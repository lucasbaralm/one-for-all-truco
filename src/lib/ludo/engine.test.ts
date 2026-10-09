import { describe, it, expect } from "vitest";
import {
  LudoState,
  addBot,
  canStart,
  changeColor,
  createLobby,
  distinctMoves,
  joinLobby,
  legalMoves,
  movePiece,
  passTurn,
  removePlayer,
  returnToLobby,
  rollDice,
  setPlayerConnected,
  startGame,
} from "./engine";
import { FINISHED, IN_BASE } from "./board";

function unwrap(r: ReturnType<typeof joinLobby>): LudoState {
  if (!r.ok) throw new Error(`esperava ok, veio erro: ${r.error}`);
  return r.state;
}

/** Partida pronta: red (Ana) e blue (Beto), vez da Ana, peças posicionadas à mão. */
function game(pieces: { red?: number[]; blue?: number[] }, extra?: Partial<LudoState>): LudoState {
  let s = createLobby();
  s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
  s = unwrap(joinLobby(s, { id: "beto", name: "Beto" }));
  s = unwrap(startGame(s, () => 0));
  return {
    ...s,
    turn: 0,
    players: s.players.map((p) => ({
      ...p,
      pieces: p.color === "red" ? (pieces.red ?? p.pieces) : (pieces.blue ?? p.pieces),
    })),
    ...extra,
  };
}

const roll = (s: LudoState, id: string, v: number) => unwrap(rollDice(s, id, v));
const move = (s: LudoState, id: string, piece: number) => unwrap(movePiece(s, id, piece));

describe("lobby", () => {
  it("dá cores diferentes, com a oposta (azul) pro segundo jogador", () => {
    let s = createLobby();
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
    s = unwrap(joinLobby(s, { id: "beto", name: "Beto" }));
    expect(s.players.map((p) => p.color)).toEqual(["red", "blue"]);
    expect(s.hostId).toBe("ana");
  });

  it("rejeita o quinto jogador e quem chega depois da partida começar", () => {
    let s = createLobby();
    for (const id of ["a", "b", "c", "d"]) s = unwrap(joinLobby(s, { id, name: id }));
    const full = joinLobby(s, { id: "e", name: "e" });
    expect(full).toEqual({ ok: false, error: "room_full" });

    const started = unwrap(startGame(s));
    expect(joinLobby(started, { id: "e", name: "e" })).toEqual({ ok: false, error: "game_in_progress" });
  });

  it("reconexão de quem já está na sala só marca como conectado", () => {
    let s = game({});
    s = setPlayerConnected(s, "ana", false);
    expect(s.players[0].connected).toBe(false);
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana", avatarUrl: "x.png" }));
    expect(s.players[0]).toMatchObject({ connected: true, avatarUrl: "x.png" });
  });

  it("troca de cor só se estiver livre", () => {
    let s = createLobby();
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
    s = unwrap(joinLobby(s, { id: "beto", name: "Beto" }));
    expect(changeColor(s, "beto", "red")).toEqual({ ok: false, error: "color_taken" });
    expect(unwrap(changeColor(s, "beto", "yellow")).players[1].color).toBe("yellow");
  });

  it("o host passa pro próximo humano quando sai (bots nunca viram host)", () => {
    let s = createLobby();
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
    s = unwrap(addBot(s, "easy"));
    s = unwrap(joinLobby(s, { id: "beto", name: "Beto" }));
    s = removePlayer(s, "ana");
    expect(s.hostId).toBe("beto");
    s = removePlayer(s, "beto");
    expect(s.hostId).toBeNull();
  });

  it("bots ganham ids únicos e a partida precisa de 2+ jogadores", () => {
    let s = createLobby();
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
    expect(canStart(s)).toBe(false);
    expect(startGame(s)).toEqual({ ok: false, error: "not_enough_players" });
    s = unwrap(addBot(s, "easy"));
    s = unwrap(addBot(s, "hard"));
    expect(s.players.map((p) => p.id)).toEqual(["ana", "bot:1", "bot:2"]);
    expect(canStart(s)).toBe(true);
  });

  it("startGame ordena os turnos pelo sentido horário e zera as peças", () => {
    let s = createLobby();
    s = unwrap(joinLobby(s, { id: "a", name: "A" }, "yellow"));
    s = unwrap(joinLobby(s, { id: "b", name: "B" }, "green"));
    s = unwrap(joinLobby(s, { id: "c", name: "C" }, "red"));
    s = unwrap(startGame(s, () => 0.99));
    expect(s.players.map((p) => p.color)).toEqual(["red", "green", "yellow"]);
    expect(s.turn).toBe(2);
    expect(s.phase).toBe("rolling");
    expect(s.players.every((p) => p.pieces.every((x) => x === IN_BASE))).toBe(true);
  });
});

describe("rolar e sair da base", () => {
  it("só quem tem a vez rola, e só na fase de rolar", () => {
    const s = game({});
    expect(rollDice(s, "beto", 3)).toEqual({ ok: false, error: "not_your_turn" });
    expect(rollDice(s, "ana", 7)).toEqual({ ok: false, error: "bad_dice" });
    const rolled = roll(s, "ana", 3);
    expect(rollDice(rolled, "ana", 3)).toEqual({ ok: false, error: "not_rolling" });
  });

  it("sem 6 e com tudo na base, não há jogada e a vez passa", () => {
    let s = roll(game({}), "ana", 4);
    expect(legalMoves(s)).toEqual([]);
    s = unwrap(passTurn(s));
    expect(s.phase).toBe("rolling");
    expect(s.players[s.turn].id).toBe("beto");
  });

  it("com 6 todas as peças da base podem sair, mas contam como uma jogada só", () => {
    const s = roll(game({}), "ana", 6);
    const moves = legalMoves(s);
    expect(moves).toHaveLength(4);
    expect(distinctMoves(moves)).toHaveLength(1);
    expect(moves.every((m) => m.to === 0)).toBe(true);
  });

  it("sair da base com 6 dá outra rolada pro mesmo jogador", () => {
    let s = roll(game({}), "ana", 6);
    s = move(s, "ana", 0);
    expect(s.players[0].pieces[0]).toBe(0);
    expect(s.phase).toBe("rolling");
    expect(s.players[s.turn].id).toBe("ana");
    expect(s.extraTurn).toBe("six");
  });
});

describe("andar", () => {
  it("anda o número do dado e passa a vez", () => {
    let s = roll(game({ red: [10, IN_BASE, IN_BASE, IN_BASE] }), "ana", 3);
    s = move(s, "ana", 0);
    expect(s.players[0].pieces[0]).toBe(13);
    expect(s.players[s.turn].id).toBe("beto");
    expect(s.extraTurn).toBeNull();
  });

  it("rejeita jogada ilegal (peça na base sem 6, peça que passaria do fim)", () => {
    const s = roll(game({ red: [10, IN_BASE, 54, IN_BASE] }), "ana", 4);
    expect(movePiece(s, "ana", 1)).toEqual({ ok: false, error: "illegal_move" });
    expect(movePiece(s, "ana", 2)).toEqual({ ok: false, error: "illegal_move" });
    expect(movePiece(s, "beto", 0)).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("chegar em casa exige o número exato e dá outra jogada", () => {
    let s = roll(game({ red: [53, IN_BASE, IN_BASE, IN_BASE] }), "ana", 4);
    expect(legalMoves(s)).toEqual([]); // 53 + 4 = 57 passaria do fim
    s = roll(game({ red: [53, IN_BASE, IN_BASE, IN_BASE] }), "ana", 3);
    s = move(s, "ana", 0);
    expect(s.players[0].pieces[0]).toBe(FINISHED);
    expect(s.lastMove?.finished).toBe(true);
    expect(s.extraTurn).toBe("home");
    expect(s.players[s.turn].id).toBe("ana");
  });

  it("três 6 seguidos perdem a vez, sem mexer em peça nenhuma", () => {
    let s = game({ red: [5, IN_BASE, IN_BASE, IN_BASE] });
    s = roll(s, "ana", 6);
    s = move(s, "ana", 0); // 5 → 11, joga de novo
    s = roll(s, "ana", 6);
    s = move(s, "ana", 0); // 11 → 17, joga de novo
    s = roll(s, "ana", 6);
    expect(s.forfeit).toBe(true);
    expect(legalMoves(s)).toEqual([]);
    expect(s.lastRoll?.forfeited).toBe(true);
    s = unwrap(passTurn(s));
    expect(s.players[s.turn].id).toBe("beto");
    expect(s.players[0].pieces[0]).toBe(17);
    expect(s.sixStreak).toBe(0);
  });

  it("um 6 sem jogada possível ainda dá nova rolada", () => {
    let s = roll(game({ red: [FINISHED, FINISHED, FINISHED, 55] }), "ana", 6);
    expect(legalMoves(s)).toEqual([]);
    s = unwrap(passTurn(s));
    expect(s.players[s.turn].id).toBe("ana");
    expect(s.extraTurn).toBe("six");
  });

  it("passTurn é recusado se ainda há jogada", () => {
    const s = roll(game({ red: [3, IN_BASE, IN_BASE, IN_BASE] }), "ana", 2);
    expect(passTurn(s)).toEqual({ ok: false, error: "has_moves" });
  });
});

describe("captura", () => {
  // Vermelho p=20 → casa 20 do anel. Azul começa em 26; progresso azul q cai na casa (26+q)%52.
  // Casa 20 do anel = progresso azul 46 (26+46=72%52=20).
  it("manda uma peça adversária sozinha de volta pra base e dá outra rolada", () => {
    let s = game({ red: [17, IN_BASE, IN_BASE, IN_BASE], blue: [46, IN_BASE, IN_BASE, IN_BASE] });
    s = roll(s, "ana", 3);
    s = move(s, "ana", 0);
    expect(s.players[0].pieces[0]).toBe(20);
    expect(s.players[1].pieces[0]).toBe(IN_BASE);
    expect(s.lastMove?.captures).toEqual([{ playerId: "beto", piece: 0, from: 46 }]);
    expect(s.extraTurn).toBe("capture");
    expect(s.players[s.turn].id).toBe("ana");
  });

  it("não captura em casa segura (estrela) — as duas peças dividem a casa", () => {
    // Estrela do vermelho: casa 8. Azul progresso 34 → (26+34)%52 = 8.
    let s = game({ red: [5, IN_BASE, IN_BASE, IN_BASE], blue: [34, IN_BASE, IN_BASE, IN_BASE] });
    s = roll(s, "ana", 3);
    s = move(s, "ana", 0);
    expect(s.players[0].pieces[0]).toBe(8);
    expect(s.players[1].pieces[0]).toBe(34);
    expect(s.lastMove?.captures).toEqual([]);
  });

  it("barreira (2 peças da mesma cor) não pode ser capturada", () => {
    let s = game({ red: [17, IN_BASE, IN_BASE, IN_BASE], blue: [46, 46, IN_BASE, IN_BASE] });
    s = roll(s, "ana", 3);
    s = move(s, "ana", 0);
    expect(s.players[1].pieces.slice(0, 2)).toEqual([46, 46]);
    expect(s.lastMove?.captures).toEqual([]);
    expect(s.extraTurn).toBeNull();
  });

  it("peça na reta final nunca é capturada", () => {
    // Azul no progresso 52 está na reta final dele, longe do anel.
    let s = game({ red: [17, IN_BASE, IN_BASE, IN_BASE], blue: [52, IN_BASE, IN_BASE, IN_BASE] });
    s = roll(s, "ana", 3);
    s = move(s, "ana", 0);
    expect(s.players[1].pieces[0]).toBe(52);
  });
});

describe("fim de partida", () => {
  it("a última peça em casa encerra o jogo com classificação", () => {
    let s = game({ red: [FINISHED, FINISHED, FINISHED, 54], blue: [10, IN_BASE, IN_BASE, IN_BASE] });
    s = roll(s, "ana", 2);
    s = move(s, "ana", 3);
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("ana");
    expect(s.standings?.map((x) => x.playerId)).toEqual(["ana", "beto"]);
    expect(s.standings?.[0].finished).toBe(4);
    // depois do fim ninguém joga
    expect(rollDice(s, "beto", 3)).toEqual({ ok: false, error: "not_rolling" });
  });

  it("revanche volta pro lobby tirando quem desconectou e mantendo bots", () => {
    let s = createLobby();
    s = unwrap(joinLobby(s, { id: "ana", name: "Ana" }));
    s = unwrap(joinLobby(s, { id: "beto", name: "Beto" }));
    s = unwrap(addBot(s, "medium"));
    s = unwrap(startGame(s));
    s = setPlayerConnected(s, "beto", false);
    const lobby = returnToLobby({ ...s, phase: "game_over", winnerId: "ana" });
    expect(lobby.phase).toBe("lobby");
    expect(lobby.players.map((p) => p.id)).toEqual(["ana", "bot:1"]);
    expect(lobby.winnerId).toBeNull();
    expect(lobby.players.every((p) => p.pieces.every((x) => x === IN_BASE))).toBe(true);
  });
});
