import { describe, expect, it } from "vitest";
import { MonoState, acceptTrade, actionsFor, cancelTrade, declineTrade, endTurn, forfeit, proposeTrade, roll } from "./engine";
import { faces, game, must, own, ownAll, withCash, withPlayer } from "./testKit";

const me = (s: MonoState, id: string) => s.players.find((p) => p.id === id)!;

/** a tem Mediterranean (1) e uma ferrovia (5); b tem Oriental (6). */
function setup(): MonoState {
  return own(own(own(game(), 1, "a"), 5, "a"), 6, "b");
}

describe("propor e aceitar", () => {
  it("troca propriedade + dinheiro nos dois sentidos", () => {
    let s = must(proposeTrade(setup(), "a", { to: "b", give: { props: [1], cash: 100 }, take: { props: [6] } })).state;
    expect(s.trade).toEqual({ from: "a", to: "b", give: { cash: 100, props: [1], jailCards: 0 }, take: { cash: 0, props: [6], jailCards: 0 } });
    expect(s.events).toEqual([{ t: "trade_offer", from: "a", to: "b" }]);
    expect(actionsFor(s, "b").respondTrade).toBe(true);
    expect(actionsFor(s, "a").cancelTrade).toBe(true);
    s = must(acceptTrade(s, "b")).state;
    expect(s.trade).toBeNull();
    expect(s.props[1]!.owner).toBe("b");
    expect(s.props[6]!.owner).toBe("a");
    expect(me(s, "a").cash).toBe(1400);
    expect(me(s, "b").cash).toBe(1600);
    expect(s.stats.a.trades).toBe(1);
    expect(s.stats.b.trades).toBe(1);
    expect(s.events).toEqual([{ t: "trade_done", from: "a", to: "b" }]);
  });

  it("dá pra pedir só dinheiro, só presente, ou mandar cartas de sair da prisão", () => {
    const withCards = withPlayer(game(), "a", { jailCards: [{ deck: "chance", idx: 7 }, { deck: "chest", idx: 4 }] });
    let s = must(proposeTrade(withCards, "a", { to: "b", give: { jailCards: 1 }, take: { cash: 50 } })).state;
    s = must(acceptTrade(s, "b")).state;
    expect(me(s, "a").jailCards).toEqual([{ deck: "chest", idx: 4 }]);
    expect(me(s, "b").jailCards).toEqual([{ deck: "chance", idx: 7 }]);
    expect(me(s, "a").cash).toBe(1550);
    const gift = must(acceptTrade(must(proposeTrade(setup(), "a", { to: "b", give: { props: [5] } })).state, "b")).state;
    expect(gift.props[5]!.owner).toBe("b");
  });

  it("hipotecada pode ser trocada e continua hipotecada", () => {
    const s0 = own(game(), 1, "a", { mortgaged: true });
    const s = must(acceptTrade(must(proposeTrade(s0, "a", { to: "b", give: { props: [1] } })).state, "b")).state;
    expect(s.props[1]).toEqual({ owner: "b", houses: 0, mortgaged: true });
  });

  it("a oferta ganha número e dinheiro 'limpos' (entrada do cliente é desconfiável)", () => {
    const s = must(proposeTrade(setup(), "a", { to: "b", give: { cash: 10.9, props: ["1" as unknown as number] }, take: { cash: NaN } })).state;
    expect(s.trade!.give).toEqual({ cash: 10, props: [1], jailCards: 0 });
    expect(s.trade!.take.cash).toBe(0);
  });
});

describe("recusar, cancelar e invalidar", () => {
  const offered = () => must(proposeTrade(setup(), "a", { to: "b", give: { props: [1] }, take: { props: [6] } })).state;

  it("recusar descarta; o proponente pode cancelar; ninguém mais mexe", () => {
    expect(must(declineTrade(offered(), "b")).state.trade).toBeNull();
    expect(declineTrade(offered(), "c")).toEqual({ ok: false, error: "not_your_turn" });
    expect(acceptTrade(offered(), "a")).toEqual({ ok: false, error: "not_your_turn" });
    expect(acceptTrade(offered(), "c")).toEqual({ ok: false, error: "not_your_turn" });
    expect(must(cancelTrade(offered(), "a")).state.events).toEqual([{ t: "trade_no", from: "a", to: "b", cancelled: true }]);
    expect(cancelTrade(offered(), "b")).toEqual({ ok: false, error: "not_your_turn" });
    expect(must(declineTrade(offered(), "b")).state.events).toEqual([{ t: "trade_no", from: "a", to: "b", cancelled: false }]);
    expect(declineTrade(setup(), "b")).toEqual({ ok: false, error: "no_trade" });
    expect(acceptTrade(setup(), "b")).toEqual({ ok: false, error: "no_trade" });
    expect(cancelTrade(setup(), "a")).toEqual({ ok: false, error: "no_trade" });
  });

  it("com oferta na mesa o proponente não joga: nem rola nem encerra nem propõe outra", () => {
    const s = offered();
    expect(roll(s, "a", faces(1, 2))).toEqual({ ok: false, error: "trade_pending" });
    expect(proposeTrade(s, "a", { to: "c", give: { cash: 1 } })).toEqual({ ok: false, error: "trade_pending" });
    expect(endTurn({ ...s, step: "manage" }, "a")).toEqual({ ok: false, error: "trade_pending" });
    expect(actionsFor(s, "a")).toMatchObject({ roll: false, propose: false, build: [], mortgage: [] });
  });

  it("se a oferta deixou de valer quando a pessoa aceita (gastou o dinheiro), cai sem trocar nada", () => {
    let s = must(proposeTrade(game(), "a", { to: "b", take: { cash: 1000 } })).state;
    s = withPlayer(s, "b", { cash: 10 });
    const r = must(acceptTrade(s, "b")).state;
    expect(r.trade).toBeNull();
    expect(me(r, "a").cash).toBe(1500);
    expect(r.events).toEqual([{ t: "trade_no", from: "a", to: "b", cancelled: true }]);
  });

  it("a oferta some quando alguém dela sai do jogo", () => {
    expect(must(forfeit(offered(), "b")).state.trade).toBeNull();
    const out = must(forfeit(offered(), "c")).state;
    expect(out.trade).not.toBeNull();
  });
});

describe("o que não pode ser trocado", () => {
  it("só na vez de quem propõe; não consigo propor pra mim, pra falido ou pra ninguém", () => {
    expect(proposeTrade(setup(), "b", { to: "a", give: { props: [6] } })).toEqual({ ok: false, error: "not_your_turn" });
    expect(proposeTrade(setup(), "a", { to: "a", give: { props: [1] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(setup(), "a", { to: "zzz", give: { props: [1] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(withPlayer(setup(), "b", { bankrupt: true }), "a", { to: "b", give: { props: [1] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade({ ...setup(), step: "buy" }, "a", { to: "b", give: { props: [1] } })).toEqual({ ok: false, error: "wrong_step" });
  });

  it("oferta vazia, propriedade que não é minha/dele, repetida, ou dinheiro que não tenho", () => {
    expect(proposeTrade(setup(), "a", { to: "b" })).toEqual({ ok: false, error: "empty_trade" });
    expect(proposeTrade(setup(), "a", { to: "b", give: { props: [6] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(setup(), "a", { to: "b", take: { props: [1] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(setup(), "a", { to: "b", give: { props: [1, 1] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(setup(), "a", { to: "b", give: { props: [0] } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(setup(), "a", { to: "b", give: { cash: 2000 } })).toEqual({ ok: false, error: "not_enough_cash" });
    expect(proposeTrade(setup(), "a", { to: "b", take: { cash: 2000 } })).toEqual({ ok: false, error: "not_enough_cash" });
    expect(proposeTrade(setup(), "a", { to: "b", give: { cash: -5 } })).toEqual({ ok: false, error: "bad_trade" });
    expect(proposeTrade(setup(), "a", { to: "b", give: { jailCards: 1 } })).toEqual({ ok: false, error: "bad_trade" });
  });

  it("rua com casa (ou do grupo com casa) não troca: vende as construções antes", () => {
    const s = ownAll(game(), "a", [1, 3], { houses: 1 });
    expect(proposeTrade(s, "a", { to: "b", give: { props: [1] } })).toEqual({ ok: false, error: "sell_buildings_first" });
    expect(proposeTrade(own(s, 3, "a", { houses: 0 }), "a", { to: "b", give: { props: [3] } })).toEqual({ ok: false, error: "sell_buildings_first" });
  });

  it("dinheiro exatamente igual ao que a pessoa tem é permitido", () => {
    expect(proposeTrade(withCash(game(), "a", 300), "a", { to: "b", give: { cash: 300 } }).ok).toBe(true);
  });
});
