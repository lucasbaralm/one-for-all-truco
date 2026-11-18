import { describe, expect, it } from "vitest";
import { MonoState, actionsFor, declineProperty, proposeTrade, toView } from "./engine";
import { at, game, lobby, must, own, ownAll, rollBy, withCash, withPlayer } from "./testKit";

describe("o que cada pessoa pode fazer (actionsFor)", () => {
  it("fora da partida, ou sem ser jogador, nada (nem desistir)", () => {
    expect(actionsFor(lobby("monopoly", ["a", "b"]), "a")).toMatchObject({ roll: false, resign: false });
    expect(actionsFor(game(), "zzz").roll).toBe(false);
    expect(actionsFor(game(), null).resign).toBe(false);
    expect(actionsFor(game(), "a").build).toEqual([]);
  });

  it("antes de rolar: só rolar (e construir/hipotecar/trocar)", () => {
    const s = ownAll(game(), "a", [1, 3]);
    expect(actionsFor(s, "a")).toMatchObject({ roll: true, endTurn: false, buy: false, propose: true, resign: true, build: [1, 3] });
    // os outros só podem desistir
    const b = actionsFor(s, "b");
    expect(b).toMatchObject({ roll: false, propose: false, build: [], resign: true, bid: false, respondTrade: false });
  });

  it("depois de rolar numa casa livre: comprar (se der) ou recusar; nada de construir no meio", () => {
    const s = must(rollBy(ownAll(game(), "a", [1, 3]), "a", 6)).state;
    expect(s.step).toBe("buy");
    expect(actionsFor(s, "a")).toMatchObject({ buy: true, decline: true, roll: false, endTurn: false, build: [], propose: false });
    // hipotecar/vender continuam valendo pra levantar dinheiro
    expect(actionsFor(s, "a").mortgage).toEqual([1, 3]);
  });

  it("fase livre: encerrar, construir, tirar hipoteca, propor troca", () => {
    const s = { ...own(ownAll(game(), "a", [1, 3]), 6, "a", { mortgaged: true }), step: "manage" as const };
    expect(actionsFor(s, "a")).toMatchObject({ endTurn: true, build: [1, 3], unmortgage: [6], propose: true, roll: false });
    expect(actionsFor(withCash(s, "a", 10), "a")).toMatchObject({ build: [], unmortgage: [] });
  });

  it("leilão: só quem tem a vez de dar lance, com o mínimo e o máximo", () => {
    let s = must(declineProperty(must(rollBy(game(), "a", 6)).state, "a")).state;
    expect(actionsFor(s, "b")).toMatchObject({ bid: true, passBid: true, minBid: 1, maxBid: 1500 });
    expect(actionsFor(s, "c")).toMatchObject({ bid: false, passBid: false });
    expect(actionsFor(s, "a")).toMatchObject({ roll: false, decline: false, bid: false });
    s = { ...s, auction: { ...s.auction!, bid: 400, leader: "c" } };
    expect(actionsFor(withCash(s, "b", 400), "b").bid).toBe(false);
    expect(actionsFor(withCash(s, "b", 401), "b")).toMatchObject({ bid: true, minBid: 401, maxBid: 401 });
  });

  it("prisão: fiança só com dinheiro, carta só se tiver", () => {
    let s = withPlayer(at(game(), "a", 10), "a", { jail: 1, jailCards: [{ deck: "chest", idx: 4 }] });
    expect(actionsFor(s, "a")).toMatchObject({ roll: true, payBail: true, useJailCard: true });
    s = withCash(s, "a", 49);
    expect(actionsFor(s, "a")).toMatchObject({ payBail: false, useJailCard: true });
    expect(actionsFor(game(), "a")).toMatchObject({ payBail: false, useJailCard: false });
  });

  it("troca pendente: o destinatário responde, o proponente cancela e fica travado", () => {
    const s = must(proposeTrade(own(game(), 1, "a"), "a", { to: "b", give: { props: [1] } })).state;
    expect(actionsFor(s, "b")).toMatchObject({ respondTrade: true, cancelTrade: false });
    expect(actionsFor(s, "a")).toMatchObject({ respondTrade: false, cancelTrade: true, roll: false });
    expect(actionsFor(s, "c")).toMatchObject({ respondTrade: false, cancelTrade: false });
  });

  it("a lista de propriedades pra vender/hipotecar só traz o que é da pessoa", () => {
    const s = own(own(game(), 1, "a"), 3, "b");
    expect(actionsFor(s, "a").mortgage).toEqual([1]);
    expect(actionsFor(s, "b").mortgage).toEqual([]);
  });
});

describe("visão que vai pro cliente", () => {
  const view = (s: MonoState, who: string | null) => toView(s, who);

  it("é pública: dinheiro, casas, vez — e as MINHAS ações", () => {
    const s = own(game({ edition: "banco" }), 1, "b", { houses: 2 });
    const v = view(s, "a");
    expect(v.edition).toBe("banco");
    expect(v.players.map((p) => p.cash)).toEqual([2500, 2500, 2500]);
    expect(v.props[1]).toEqual({ owner: "b", houses: 2, mortgaged: false });
    expect(v.me.roll).toBe(true);
    expect(view(s, "b").me.roll).toBe(false);
    expect(view(s, null).me.resign).toBe(false);
    expect(v.supply).toEqual({ houses: 30, hotels: 12 });
  });

  it("no lobby o estoque está cheio e não há props", () => {
    const v = view(lobby("monopoly", ["a", "b"]), "a");
    expect(v.supply).toEqual({ houses: 32, hotels: 12 });
    expect(v.props).toEqual([]);
    expect(v.phase).toBe("lobby");
  });

  it("serializa em JSON sem segredo", () => {
    const json = JSON.stringify(view(game(), "a"));
    expect(json).not.toContain('"decks"');
    expect(JSON.parse(json).players).toHaveLength(3);
  });
});
