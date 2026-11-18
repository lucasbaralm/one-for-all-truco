import { describe, expect, it } from "vitest";
import { MonoState, actionsFor, declineProperty, endTurn, forfeit, passBid, placeBid, roll } from "./engine";
import { at, faces, game, must, rollBy, rollDouble, withCash } from "./testKit";

const me = (s: MonoState, id: string) => s.players.find((p) => p.id === id)!;

/** `a` cai na Oriental Avenue (6) e recusa: leilão aberto entre b, c, a (nessa ordem). */
function auction(spec: Parameters<typeof game>[0] = {}, prep: (s: MonoState) => MonoState = (s) => s): MonoState {
  let s = prep(game(spec));
  s = must(rollBy(s, "a", 6)).state;
  return must(declineProperty(s, "a")).state;
}

describe("leilão (Monopoly)", () => {
  it("começa em quem vem depois de quem recusou; quem recusou dá lance por último", () => {
    const s = auction();
    expect(s.step).toBe("auction");
    expect(s.auction).toMatchObject({ sq: 6, bid: 0, leader: null, order: ["b", "c", "a"], bidder: "b", passed: [] });
    expect(s.events).toContainEqual({ t: "auction", sq: 6 });
  });

  it("só quem tem a vez dá lance; lance tem que subir e caber no bolso", () => {
    const s = auction();
    expect(placeBid(s, "c", 10)).toEqual({ ok: false, error: "not_your_turn" });
    expect(placeBid(s, "b", 0)).toEqual({ ok: false, error: "bid_too_low" });
    expect(placeBid(s, "b", 1501)).toEqual({ ok: false, error: "not_enough_cash" });
    expect(placeBid(s, "b", 12.5)).toEqual({ ok: false, error: "bid_too_low" });
    expect(actionsFor(s, "b")).toMatchObject({ bid: true, minBid: 1, maxBid: 1500, passBid: true, roll: false });
    expect(actionsFor(s, "a")).toMatchObject({ bid: false, passBid: false });
  });

  it("o maior lance leva: paga, vira dono e a vez segue", () => {
    let s = auction();
    s = must(placeBid(s, "b", 50)).state;
    expect(s.auction).toMatchObject({ bid: 50, leader: "b", bidder: "c" });
    s = must(placeBid(s, "c", 60)).state;
    s = must(passBid(s, "a")).state;
    expect(s.auction!.bidder).toBe("b"); // b ainda não passou
    s = must(placeBid(s, "b", 70)).state;
    s = must(passBid(s, "c")).state;
    // só sobrou o líder (b): fecha
    expect(s.auction).toBeNull();
    expect(s.props[6]!.owner).toBe("b");
    expect(me(s, "b").cash).toBe(1430);
    expect(me(s, "a").cash).toBe(1500);
    expect(s.step).toBe("manage");
    expect(s.events).toContainEqual({ t: "sold", sq: 6, to: "b", amount: 70 });
    expect(s.stats.b.bought).toBe(1);
  });

  it("todo mundo passa: ninguém leva e a propriedade continua livre", () => {
    let s = auction();
    s = must(passBid(s, "b")).state;
    s = must(passBid(s, "c")).state;
    s = must(passBid(s, "a")).state;
    expect(s.auction).toBeNull();
    expect(s.props[6]!.owner).toBeNull();
    expect(s.step).toBe("manage");
    expect(s.events).toContainEqual({ t: "sold", sq: 6, to: null, amount: 0 });
  });

  it("quem passou não volta; o líder não dá lance contra si mesmo", () => {
    let s = auction();
    s = must(placeBid(s, "b", 10)).state;
    s = must(passBid(s, "c")).state;
    s = must(passBid(s, "a")).state;
    expect(s.auction).toBeNull(); // só b (líder) restou
    expect(s.props[6]!.owner).toBe("b");
  });

  it("quem não tem dinheiro pra cobrir o lance atual é pulado", () => {
    let s = auction({}, (x) => withCash(x, "c", 40));
    s = must(placeBid(s, "b", 50)).state;
    // c só tem 40: a próxima é a (c é pulada)
    expect(s.auction!.bidder).toBe("a");
    s = must(passBid(s, "a")).state;
    expect(s.auction).toBeNull();
    expect(me(s, "b").cash).toBe(1450);
  });

  it("se ninguém pode dar nem $1, fecha na hora sem vencedor", () => {
    const s = auction({}, (x) => withCash(withCash(withCash(x, "a", 0), "b", 0), "c", 0));
    expect(s.auction).toBeNull();
    expect(s.step).toBe("manage");
  });

  it("depois do leilão de uma dupla ainda joga de novo", () => {
    let s = must(rollDouble(at(game(), "a", 4), "a", 1)).state; // 4 → 6 (Oriental)
    s = must(declineProperty(s, "a")).state;
    s = must(passBid(must(passBid(must(passBid(s, "b")).state, "c")).state, "a")).state;
    expect(s.step).toBe("roll");
    expect(s.doubles).toBe(1);
  });

  it("não dá pra rolar, encerrar a vez nem lançar durante o leilão", () => {
    const s = auction();
    expect(roll(s, "a", faces(1, 2))).toEqual({ ok: false, error: "wrong_step" });
    expect(endTurn(s, "a")).toEqual({ ok: false, error: "wrong_step" });
    expect(passBid(game(), "a")).toEqual({ ok: false, error: "no_auction" });
  });

  it("quem desiste (ou é removido) no meio do leilão sai dele", () => {
    let s = auction();
    s = must(placeBid(s, "b", 30)).state;
    // c tem a vez; c some
    s = must(forfeit(s, "c")).state;
    expect(s.auction!.order).toEqual(["b", "a"]);
    expect(s.auction!.bidder).toBe("a");
    // o líder some: o lance cai
    s = must(forfeit(s, "b")).state;
    expect(s.phase).toBe("game_over"); // só sobrou a
  });

  it("se o líder desiste, o lance dele não vale", () => {
    let s = auction({ players: ["a", "b", "c", "d"] });
    s = must(placeBid(s, "b", 30)).state;
    s = must(forfeit(s, "b")).state;
    expect(s.auction).toMatchObject({ bid: 0, leader: null });
    expect(s.auction!.order).not.toContain("b");
    expect(s.auction!.bidder).toBeTruthy();
  });

  it("quem recusou desiste do jogo no meio do leilão: o leilão acaba e a vez passa", () => {
    let s = auction({ players: ["a", "b", "c", "d"] });
    s = must(forfeit(s, "a")).state;
    expect(s.auction).toBeNull();
    expect(s.turn).toBe(1);
    expect(s.step).toBe("roll");
  });
});

describe("sem leilão (Banco Imobiliário)", () => {
  it("recusar não abre leilão e nenhum lance é aceito", () => {
    const s = must(declineProperty(must(rollBy(game({ edition: "banco" }), "a", 6)).state, "a")).state;
    expect(s.auction).toBeNull();
    expect(placeBid(s, "b", 10)).toEqual({ ok: false, error: "no_auction" });
  });
});
