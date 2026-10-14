import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { DECK, DECK_SIZE, cardOf } from "./cards";
import {
  HAND_SIZE,
  MAX_PLAYERS,
  UnoState,
  addBot,
  callUno,
  canCallUno,
  canStart,
  catchUno,
  createLobby,
  drawCard,
  joinLobby,
  legalCards,
  passTurn,
  playCard,
  removePlayer,
  returnToLobby,
  setBotLevel,
  setPlayerConnected,
  startGame,
  toView,
} from "./engine";
import { allCards, find, game, lobby, must } from "./testKit";

const R5 = find("red", "number", 5); // sempre o TOPO nos testes
const R5h = find("red", "number", 5, 1); // a outra cópia, pra pôr na mão
const R9 = find("red", "number", 9);
const B5 = find("blue", "number", 5);
const B7 = find("blue", "number", 7);
const G3 = find("green", "number", 3);
const Y2 = find("yellow", "number", 2);
const SKIP_R = find("red", "skip");
const REV_R = find("red", "reverse");
const D2_R = find("red", "draw2");
const D2_B = find("blue", "draw2");
const WILD = find(null, "wild");
const W4 = find(null, "wild4");

const play = (s: UnoState, who: string, card: number, color?: "red" | "yellow" | "green" | "blue", uno = false) =>
  playCard(s, who, card, color, uno, mulberry32(7));

describe("lobby", () => {
  it("o primeiro humano é o host; bots nunca viram host; até 8 jogadores", () => {
    let s = must(addBot(createLobby(), "easy")).state;
    s = must(joinLobby(s, { id: "ana", name: "Ana" })).state;
    expect(s.hostId).toBe("ana");
    expect(removePlayer(s, "ana").hostId).toBeNull();

    let full = createLobby();
    for (let i = 0; i < MAX_PLAYERS; i++) full = must(joinLobby(full, { id: `p${i}`, name: `P${i}` })).state;
    expect(joinLobby(full, { id: "extra", name: "x" })).toEqual({ ok: false, error: "room_full" });
    expect(addBot(full, "easy")).toEqual({ ok: false, error: "room_full" });
  });

  it("precisa de 2 pra começar; quem chega com a partida rolando não entra; reconexão devolve o assento", () => {
    const one = lobby(["a"]);
    expect(canStart(one)).toBe(false);
    expect(startGame(one)).toEqual({ ok: false, error: "not_enough_players" });
    const started = must(startGame(lobby(["a", "b"]), mulberry32(1))).state;
    expect(joinLobby(started, { id: "zed", name: "Zed" })).toEqual({ ok: false, error: "game_in_progress" });
    const dropped = setPlayerConnected(started, "b", false);
    expect(dropped.players[1].connected).toBe(false);
    expect(must(joinLobby(dropped, { id: "b", name: "B" })).state.players[1].connected).toBe(true);
  });

  it("bot muda de nível; só bot", () => {
    const s = must(addBot(lobby(["a"]), "easy")).state;
    expect(must(setBotLevel(s, "bot:1", "hard")).state.players[1].bot).toBe("hard");
    expect(setBotLevel(s, "a", "hard")).toEqual({ ok: false, error: "not_a_bot" });
  });
});

describe("começo da partida", () => {
  it("7 cartas pra cada um, 1 no centro, o resto no monte — as 108 cartas sem repetir", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const n = 2 + (seed % 7);
      const s = must(startGame(lobby(["a", "b", "c", "d", "e", "f", "g", "h"].slice(0, n)), mulberry32(seed))).state;
      expect(s.phase).toBe("playing");
      expect(s.players.every((p) => p.hand.length === HAND_SIZE || p.hand.length === HAND_SIZE + 2)).toBe(true); // +2 se a 1ª carta foi um +2
      const all = allCards(s);
      expect(all).toHaveLength(DECK_SIZE);
      expect(new Set(all).size).toBe(DECK_SIZE);
      expect(s.discard).toHaveLength(1);
    }
  });

  it("a carta do centro nunca é Coringa +4; coringa inicial ganha uma cor", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const s = must(startGame(lobby(["a", "b", "c"]), mulberry32(seed))).state;
      const top = cardOf(s.discard[0]);
      expect(top.kind).not.toBe("wild4");
      expect(["red", "yellow", "green", "blue"]).toContain(s.color);
      if (top.color) expect(s.color).toBe(top.color);
    }
  });

  it("o efeito da carta inicial vale pra quem joga primeiro (Pular, Inverter, +2)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 3000 && seen.size < 3; seed++) {
      const s = must(startGame(lobby(["a", "b", "c"]), mulberry32(seed))).state;
      const kind = cardOf(s.discard[0]).kind;
      if (kind === "skip") {
        seen.add(kind);
        expect(s.events.map((e) => e.t)).toEqual(["skip"]);
      } else if (kind === "reverse") {
        seen.add(kind);
        expect(s.direction).toBe(-1);
      } else if (kind === "draw2") {
        seen.add(kind);
        expect(s.events.map((e) => e.t)).toEqual(["draw", "skip"]);
        expect(s.players.filter((p) => p.hand.length === HAND_SIZE + 2)).toHaveLength(1);
      }
    }
    expect(seen.size).toBe(3);
  });

  it("começar de novo zera estatísticas e sobe o número da partida", () => {
    const a = must(startGame(lobby(["a", "b"]), mulberry32(1))).state;
    const over = returnToLobby(a);
    expect(over.phase).toBe("lobby");
    expect(over.players.every((p) => p.hand.length === 0)).toBe(true);
    const b = must(startGame(over, mulberry32(2))).state;
    expect(b.gameNumber).toBe(a.gameNumber + 1);
    expect(b.stats).toEqual({});
  });
});

describe("o que dá pra jogar", () => {
  it("mesma cor, mesmo número, mesmo símbolo ou coringa", () => {
    const s = game({ hands: { a: [R9, B5, B7, G3, WILD], b: [Y2] }, top: R5 });
    expect(legalCards(s, "a").sort()).toEqual([R9, B5, WILD].sort());
  });

  it("não é a vez dela: nada; partida não rolando: nada", () => {
    const s = game({ hands: { a: [R9], b: [R5h] }, top: R5 });
    expect(legalCards(s, "b")).toEqual([]);
    expect(legalCards({ ...s, phase: "lobby" }, "a")).toEqual([]);
  });

  it("Coringa +4 só vale sem carta da cor atual na mão", () => {
    const withColor = game({ hands: { a: [W4, R9], b: [Y2] }, top: R5 });
    expect(legalCards(withColor, "a")).toEqual([R9]);
    expect(play(withColor, "a", W4, "blue")).toEqual({ ok: false, error: "wild4_blocked" });
    const without = game({ hands: { a: [W4, B7], b: [Y2] }, top: R5 });
    expect(legalCards(without, "a").sort()).toEqual([W4].sort());
    expect(must(play(without, "a", W4, "blue")).state.color).toBe("blue");
  });

  it("a restrição do +4 olha a cor VALENDO (a escolhida no coringa anterior), não a cor do topo", () => {
    const s = game({ hands: { a: [W4, R9, B7], b: [Y2] }, top: WILD, color: "green" });
    expect(legalCards(s, "a")).toContain(W4); // sem verde na mão: pode, mesmo tendo vermelho
  });
});

describe("jogar uma carta", () => {
  it("recusa carta que não combina, fora da vez, fora da mão, e coringa sem cor", () => {
    const s = game({ hands: { a: [B7, R9, WILD], b: [R5h] }, top: R5 });
    expect(play(s, "a", B7)).toEqual({ ok: false, error: "illegal_card" });
    expect(play(s, "b", R5h)).toEqual({ ok: false, error: "not_your_turn" });
    expect(play(s, "a", G3)).toEqual({ ok: false, error: "not_in_hand" });
    expect(play(s, "a", WILD)).toEqual({ ok: false, error: "need_color" });
    expect(playCard(s, "a", WILD, "purple" as never, false, mulberry32(1))).toEqual({ ok: false, error: "need_color" });
    expect(play({ ...s, phase: "lobby" }, "a", R9)).toEqual({ ok: false, error: "not_playing" });
  });

  it("carta comum: sai da mão, vai pro topo, muda a cor valendo e passa a vez", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h], c: [G3] }, top: R5 });
    const n = must(play(s, "a", R9)).state;
    expect(n.players[0].hand).toEqual([B7]);
    expect(n.discard[n.discard.length - 1]).toBe(R9);
    expect(n.color).toBe("red");
    expect(n.turn).toBe(1);
    expect(n.events).toEqual([{ t: "play", p: "a", card: R9, color: "red" }]);
    expect(n.stats!.a.played).toBe(1);
  });

  it("Coringa: a cor escolhida passa a valer", () => {
    const s = game({ hands: { a: [WILD, B7], b: [R5h] }, top: R5 });
    const n = must(play(s, "a", WILD, "green")).state;
    expect(n.color).toBe("green");
    expect(n.events[0]).toMatchObject({ t: "play", color: "green" });
  });

  it("Pular: o próximo perde a vez", () => {
    const s = game({ hands: { a: [SKIP_R, B7], b: [R5h], c: [G3] }, top: R5 });
    const n = must(play(s, "a", SKIP_R)).state;
    expect(n.turn).toBe(2);
    expect(n.events.map((e) => e.t)).toEqual(["play", "skip"]);
    expect(n.events[1]).toEqual({ t: "skip", p: "b" });
  });

  it("Inverter com 3+: muda o sentido e a vez vai pro lado contrário", () => {
    const s = game({ hands: { a: [REV_R, B7], b: [R5h], c: [G3] }, top: R5, turn: 0 });
    const n = must(play(s, "a", REV_R)).state;
    expect(n.direction).toBe(-1);
    expect(n.turn).toBe(2); // c, não b
    expect(n.events.map((e) => e.t)).toEqual(["play", "reverse"]);
    // e o jogo segue nesse sentido: c joga e a vez vai pra b (c → b → a)
    const withC = { ...n, players: n.players.map((p) => (p.id === "c" ? { ...p, hand: [R9, G3] } : p)) };
    expect(must(play(withC, "c", R9)).state.turn).toBe(1);
  });

  it("Inverter com 2 jogadores vale como Pular: quem jogou joga de novo", () => {
    const s = game({ hands: { a: [REV_R, B7], b: [R5h] }, top: R5 });
    const n = must(play(s, "a", REV_R)).state;
    expect(n.turn).toBe(0);
    expect(n.direction).toBe(1);
    expect(n.events.map((e) => e.t)).toEqual(["play", "skip"]);
  });

  it("+2: o próximo compra 2 e perde a vez", () => {
    const s = game({ hands: { a: [D2_R, B7], b: [R5h], c: [G3] }, top: R5 });
    const n = must(play(s, "a", D2_R)).state;
    expect(n.players[1].hand).toHaveLength(3);
    expect(n.turn).toBe(2);
    expect(n.events.map((e) => e.t)).toEqual(["play", "draw", "skip"]);
    expect(n.events[1]).toEqual({ t: "draw", p: "b", n: 2, penalty: true });
    expect(n.stats!.b.drawn).toBe(2);
  });

  it("+4: o próximo compra 4, perde a vez, e a cor muda", () => {
    const s = game({ hands: { a: [W4, B7], b: [R5h], c: [G3] }, top: R5, color: "green" });
    const n = must(play(s, "a", W4, "yellow")).state;
    expect(n.players[1].hand).toHaveLength(5);
    expect(n.color).toBe("yellow");
    expect(n.turn).toBe(2);
  });

  it("+2 com 2 jogadores: o outro compra e quem jogou joga de novo", () => {
    const s = game({ hands: { a: [D2_R, B7], b: [R5h] }, top: R5 });
    const n = must(play(s, "a", D2_R)).state;
    expect(n.players[1].hand).toHaveLength(3);
    expect(n.turn).toBe(0);
  });

  it("o sentido invertido vale pra Pular e +2 também", () => {
    const s = game({ hands: { a: [D2_R, B7], b: [R5h], c: [G3], d: [Y2] }, top: R5, turn: 0, direction: -1 });
    const n = must(play(s, "a", D2_R)).state;
    expect(n.players[3].hand).toHaveLength(3); // d é o "próximo" no sentido contrário
    expect(n.turn).toBe(2); // pula d, chega em c
  });

  it("as 108 cartas continuam existindo, sem repetir, depois de qualquer jogada", () => {
    let s = game({ hands: { a: [D2_R, W4, B7], b: [R5h], c: [G3] }, top: R5 });
    s = must(play(s, "a", D2_R)).state;
    expect(new Set(allCards(s)).size).toBe(DECK_SIZE);
    expect(allCards(s)).toHaveLength(DECK_SIZE);
  });
});

describe("fim da partida", () => {
  it("quem joga a última carta ganha; classificação: vencedor, depois menos cartas / menos pontos", () => {
    const s = game({ hands: { a: [R9], b: [R5h, WILD], c: [B7, G3], d: [D2_B] }, top: R5 });
    const n = must(play(s, "a", R9)).state;
    expect(n.phase).toBe("game_over");
    expect(n.winnerId).toBe("a");
    expect(n.standings!.map((x) => x.playerId)).toEqual(["a", "d", "c", "b"]);
    expect(n.standings![0]).toMatchObject({ cards: 0, handPoints: 0, played: 1 });
    expect(n.standings![3]).toMatchObject({ cards: 2, handPoints: 50 + 5 });
    expect(n.exposed).toBeNull();
  });

  it("se a última carta é +2/+4, o castigo ainda vale", () => {
    const s = game({ hands: { a: [D2_R], b: [R5h], c: [G3] }, top: R5 });
    const n = must(play(s, "a", D2_R)).state;
    expect(n.phase).toBe("game_over");
    expect(n.players[1].hand).toHaveLength(3);
    expect(n.standings![1].cards).toBe(1); // c
  });

  it("depois do fim ninguém mais joga", () => {
    const over = must(play(game({ hands: { a: [R9], b: [R5h] }, top: R5 }), "a", R9)).state;
    expect(play(over, "b", R5h)).toEqual({ ok: false, error: "not_playing" });
    expect(drawCard(over, "b")).toEqual({ ok: false, error: "not_playing" });
  });
});

describe("comprar e passar", () => {
  it("comprou uma carta que dá pra jogar: a vez continua, só ela (ou passar)", () => {
    // topo vermelho 5; a próxima carta do monte é o vermelho 9 (jogável)
    const s = game({ hands: { a: [B7, G3], b: [R5h] }, top: R5, draw: [Y2, R9] });
    const n = must(drawCard(s, "a", mulberry32(1))).state;
    expect(n.turn).toBe(0);
    expect(n.pendingDrawn).toBe(R9);
    expect(n.players[0].hand).toContain(R9);
    expect(legalCards(n, "a")).toEqual([R9]);
    expect(play(n, "a", B7)).toEqual({ ok: false, error: "must_play_drawn" });
    expect(drawCard(n, "a")).toEqual({ ok: false, error: "already_drew" });
    expect(must(play(n, "a", R9)).state.pendingDrawn).toBeNull();
  });

  it("passar depois de comprar uma carta jogável", () => {
    const s = game({ hands: { a: [B7, G3], b: [R5h] }, top: R5, draw: [Y2, R9] });
    const n = must(drawCard(s, "a", mulberry32(1))).state;
    const p = must(passTurn(n, "a")).state;
    expect(p.turn).toBe(1);
    expect(p.pendingDrawn).toBeNull();
    expect(p.events).toEqual([{ t: "pass", p: "a" }]);
  });

  it("comprou uma carta que NÃO dá pra jogar: passa a vez sozinho", () => {
    const s = game({ hands: { a: [B7, G3], b: [R5h] }, top: R5, draw: [R9, Y2] }); // próxima = Y2 (amarelo 2: não combina)
    const n = must(drawCard(s, "a", mulberry32(1))).state;
    expect(n.turn).toBe(1);
    expect(n.pendingDrawn).toBeNull();
    expect(n.events.map((e) => e.t)).toEqual(["draw", "pass"]);
    expect(n.players[0].hand).toHaveLength(3);
    expect(n.stats!.a.drawn).toBe(1);
  });

  it("passar sem ter comprado é recusado", () => {
    const s = game({ hands: { a: [B7], b: [R5h] }, top: R5 });
    expect(passTurn(s, "a")).toEqual({ ok: false, error: "must_draw" });
    expect(drawCard(s, "b")).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("monte acabou: o descarte (menos o topo) é embaralhado de volta", () => {
    const s = { ...game({ hands: { a: [B7], b: [R5h] }, top: R5, draw: [] }), discard: [G3, Y2, B5, R5] };
    const n = must(drawCard(s, "a", mulberry32(3))).state;
    expect(n.events[0]).toEqual({ t: "reshuffle" });
    expect(n.discard).toEqual([R5]);
    expect(n.players[0].hand).toHaveLength(2);
    expect(n.draw).toHaveLength(2);
  });

  it("sem nada pra comprar (tudo nas mãos): só passa a vez", () => {
    const s = game({ hands: { a: [B7], b: [R5h] }, top: R5, draw: [] });
    const n = must(drawCard(s, "a", mulberry32(3))).state;
    expect(n.turn).toBe(1);
    expect(n.events).toEqual([{ t: "pass", p: "a" }]);
  });

  it("depois de comprar, o UNO de quem estava com 1 carta se perde (ela cresceu)", () => {
    const s = { ...game({ hands: { a: [B7], b: [R5h] }, top: R5, draw: [Y2] }) };
    s.players = s.players.map((p) => (p.id === "a" ? { ...p, unoCalled: true } : p));
    expect(must(drawCard(s, "a")).state.players[0].unoCalled).toBe(false);
  });
});

describe("UNO", () => {
  it("ficar com 1 carta sem gritar deixa você vulnerável; gritar na jogada, não", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h], c: [G3] }, top: R5 });
    expect(must(play(s, "a", R9)).state.exposed).toBe("a");
    const called = must(play(s, "a", R9, undefined, true)).state;
    expect(called.exposed).toBeNull();
    expect(called.players[0].unoCalled).toBe(true);
    expect(called.events.map((e) => e.t)).toEqual(["play", "uno"]);
  });

  it("gritar UNO antes (com 2 cartas na sua vez) também protege", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h, Y2], c: [G3] }, top: R5 });
    expect(canCallUno(s, "a")).toBe(true);
    const pre = must(callUno(s, "a")).state;
    expect(pre.players[0].unoCalled).toBe(true);
    expect(must(play(pre, "a", R9)).state.exposed).toBeNull();
    // com 2 cartas e fora da sua vez ainda não dá
    expect(canCallUno(s, "b")).toBe(false);
    expect(callUno(s, "b")).toEqual({ ok: false, error: "cannot_uno" });
  });

  it("gritar UNO sem necessidade (mão grande) é recusado", () => {
    const s = game({ hands: { a: [R9, B7, G3], b: [R5h] }, top: R5 });
    expect(canCallUno(s, "a")).toBe(false);
    expect(callUno(s, "a")).toEqual({ ok: false, error: "cannot_uno" });
  });

  it("gritar UNO atrasado (já com 1 carta) livra de ser pego", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h], c: [G3] }, top: R5 });
    const exposed = must(play(s, "a", R9)).state;
    const late = must(callUno(exposed, "a")).state;
    expect(late.exposed).toBeNull();
    expect(catchUno(late, "b")).toEqual({ ok: false, error: "nobody_to_catch" });
  });

  it("pegar quem esqueceu: ele compra 2 e o UNO é limpo", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h], c: [G3] }, top: R5 });
    const exposed = must(play(s, "a", R9)).state;
    const caught = must(catchUno(exposed, "c", mulberry32(1))).state;
    expect(caught.players[0].hand).toHaveLength(3);
    expect(caught.exposed).toBeNull();
    expect(caught.events.map((e) => e.t)).toEqual(["catch", "draw"]);
    expect(caught.events[0]).toEqual({ t: "catch", by: "c", target: "a" });
    expect(caught.stats!.c.caught).toBe(1);
    expect(caught.stats!.a.forgot).toBe(1);
    expect(caught.turn).toBe(exposed.turn); // pegar não passa a vez
  });

  it("não dá pra se pegar, nem pegar quando ninguém está exposto, nem quem não está na sala", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h], c: [G3] }, top: R5 });
    expect(catchUno(s, "b")).toEqual({ ok: false, error: "nobody_to_catch" });
    const exposed = must(play(s, "a", R9)).state;
    expect(catchUno(exposed, "a")).toEqual({ ok: false, error: "nobody_to_catch" });
    expect(catchUno(exposed, "zed")).toEqual({ ok: false, error: "not_in_room" });
  });

  it("a próxima pessoa que age (jogar, comprar ou passar) encerra a chance de pegar", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h, B5, Y2], c: [G3] }, top: R5 });
    const exposed = must(play(s, "a", R9)).state;
    expect(exposed.exposed).toBe("a");
    expect(must(play(exposed, "b", R5h)).state.exposed).toBeNull();
    expect(must(drawCard(exposed, "b", mulberry32(1))).state.exposed).toBeNull();
  });

  it("quem joga a carta que o deixa com 1 e a próxima também: só o último fica exposto", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h, B5], c: [G3] }, top: R5 });
    let n = must(play(s, "a", R9)).state;
    n = must(play(n, "b", R5h)).state;
    expect(n.exposed).toBe("b");
  });
});

describe("visão de cada jogador (a mão é segredo)", () => {
  const s = game({ hands: { a: [R9, B7, WILD], b: [R5h, B5], c: [G3] }, top: R5 });

  it("cada um vê só a própria mão; dos outros, só quantas cartas", () => {
    const va = toView(s, "a");
    expect(va.hand).toEqual([R9, B7, WILD]);
    expect(va.players.map((p) => p.cards)).toEqual([3, 2, 1]);
    for (const p of va.players) expect(Object.keys(p)).not.toContain("hand");
    expect(toView(s, "b").hand).toEqual([R5h, B5]);
  });

  it("nunca vaza o monte nem a mão alheia: nada no JSON além das cartas do próprio jogador", () => {
    const raw = JSON.stringify(toView(s, "a"));
    expect(raw).not.toContain('"draw":');
    expect(Object.keys(toView(s, "a"))).not.toContain("draw");
    // o único array de ids de carta que pertence a outro jogador não aparece em lugar nenhum
    const bobsCards = JSON.stringify([R5h, B5]);
    expect(raw).not.toContain(bobsCards);
  });

  it("espectador (ou quem não está na sala) não vê mão nenhuma", () => {
    for (const viewer of ["zed", null]) {
      const v = toView(s, viewer);
      expect(v.hand).toEqual([]);
      expect(v.legal).toEqual([]);
      expect(v.canUno || v.canDraw || v.canPass || v.canCatch).toBe(false);
    }
  });

  it("jogadas possíveis, comprar, passar, UNO e pegar só aparecem pra quem pode", () => {
    const va = toView(s, "a");
    expect(va.legal.sort()).toEqual([R9, WILD].sort());
    expect(va.canDraw).toBe(true);
    expect(va.canPass).toBe(false);
    const vb = toView(s, "b");
    expect(vb.canDraw).toBe(false);
    expect(vb.legal).toEqual([]);
    // depois de comprar uma jogável: passar, não comprar
    const drew = must(drawCard(game({ hands: { a: [B7, G3], b: [R5h] }, top: R5, draw: [Y2, R9] }), "a")).state;
    const v = toView(drew, "a");
    expect(v.canPass).toBe(true);
    expect(v.canDraw).toBe(false);
    expect(v.drawnCard).toBe(R9);
    expect(toView(drew, "b").drawnCard).toBeNull();
    // exposto: os outros podem pegar, ele não
    const exposed = must(play(game({ hands: { a: [R9, B7], b: [R5h], c: [G3] }, top: R5 }), "a", R9)).state;
    expect(toView(exposed, "b").canCatch).toBe(true);
    expect(toView(exposed, "a").canCatch).toBe(false);
    expect(toView(exposed, "a").canUno).toBe(true);
  });

  it("antes de começar não há topo nem cor; depois há, com as últimas cartas do descarte", () => {
    const lobbyView = toView(lobby(["a", "b"]), "a");
    expect(lobbyView.top).toBeNull();
    expect(lobbyView.color).toBeNull();
    const v = toView(s, "a");
    expect(v.top).toBe(R5);
    expect(v.color).toBe("red");
    expect(v.recent).toEqual([R5]);
    expect(v.drawCount).toBe(DECK.length - 6 - 1);
  });
});
