import { describe, expect, it } from "vitest";
import { MonoState, actionsFor, build, buildError, mortgage, sellBuilding, supply, unmortgage } from "./engine";
import { HOTELS_TOTAL, HOUSES_TOTAL } from "./editions";
import { game, must, own, ownAll, rollBy, withCash } from "./testKit";

const me = (s: MonoState, id = "a") => s.players.find((p) => p.id === id)!;
const BROWN = [1, 3];
const SKY = [6, 8, 9];

/** Constrói n casas em cada rua do grupo, em ordem (uma por vez, parelho). */
function built(s: MonoState, group: number[], perStreet: number): MonoState {
  let cur = s;
  for (let level = 0; level < perStreet; level++) for (const i of group) cur = must(build(cur, "a", i)).state;
  return cur;
}

describe("construir", () => {
  it("só com o grupo inteiro; paga a casa e ela aparece", () => {
    const s0 = ownAll(game(), "a", BROWN);
    const s = must(build(s0, "a", 1)).state;
    expect(s.props[1]!.houses).toBe(1);
    expect(me(s).cash).toBe(1450);
    expect(s.stats.a.built).toBe(1);
    expect(s.events).toEqual([{ t: "build", p: "a", sq: 1, level: 1, cost: 50 }]);
    expect(build(own(game(), 1, "a"), "a", 1)).toEqual({ ok: false, error: "need_group" });
    expect(build(own(game(), 1, "b"), "a", 1)).toEqual({ ok: false, error: "not_yours" });
    expect(build(s0, "a", 5)).toEqual({ ok: false, error: "not_yours" }); // ferrovia
    expect(build(s0, "a", 0)).toEqual({ ok: false, error: "not_yours" });
    expect(build(s0, "a", 99)).toEqual({ ok: false, error: "bad_square" });
    expect(build(s0, "a", -1)).toEqual({ ok: false, error: "bad_square" });
    expect(build(s0, "a", 1.5)).toEqual({ ok: false, error: "bad_square" });
  });

  it("sempre parelho: não dá pra pôr a 2ª casa numa rua antes de todas terem a 1ª", () => {
    let s = must(build(ownAll(game(), "a", SKY), "a", 6)).state;
    expect(build(s, "a", 6)).toEqual({ ok: false, error: "build_evenly" });
    s = must(build(s, "a", 8)).state;
    s = must(build(s, "a", 9)).state;
    expect(must(build(s, "a", 6)).state.props[6]!.houses).toBe(2);
  });

  it("4 casas viram hotel; hotel é o máximo; o banco recebe as 4 casas de volta", () => {
    let s = built(ownAll(game(), "a", BROWN), BROWN, 4);
    expect(supply(s).houses).toBe(HOUSES_TOTAL - 8);
    s = must(build(s, "a", 1)).state;
    expect(s.props[1]!.houses).toBe(5);
    expect(supply(s)).toEqual({ houses: HOUSES_TOTAL - 4, hotels: HOTELS_TOTAL - 1 });
    s = must(build(s, "a", 3)).state;
    expect(build(s, "a", 1)).toEqual({ ok: false, error: "max_built" });
  });

  it("não constrói sem dinheiro, nem com rua hipotecada no grupo", () => {
    expect(build(withCash(ownAll(game(), "a", BROWN), "a", 40), "a", 1)).toEqual({ ok: false, error: "not_enough_cash" });
    const s = own(ownAll(game(), "a", BROWN), 3, "a", { mortgaged: true });
    expect(build(s, "a", 1)).toEqual({ ok: false, error: "mortgaged_in_group" });
  });

  it("o banco só tem 32 casas e 12 hotéis", () => {
    // 8 ruas de outro jogador com 4 casas = as 32 casas
    let s = ownAll(game(), "a", BROWN);
    for (const i of [6, 8, 9, 11, 13, 14, 16, 18]) s = own(s, i, "c", { houses: 4 });
    expect(supply(s).houses).toBe(0);
    expect(build(s, "a", 1)).toEqual({ ok: false, error: "no_supply" });
    // 12 hotéis em uso: nada de hotel novo
    let h = built(ownAll(game(), "a", BROWN), BROWN, 4);
    for (const i of [6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24]) h = own(h, i, "c", { houses: 5 });
    expect(supply(h).hotels).toBe(0);
    expect(buildError(h, "a", 1)).toBe("no_supply");
  });

  it("só na própria vez, na fase livre ou antes de rolar", () => {
    const s = ownAll(game(), "a", BROWN);
    expect(build(s, "b", 1)).toEqual({ ok: false, error: "not_your_turn" });
    expect(build({ ...s, step: "buy" }, "a", 1)).toEqual({ ok: false, error: "wrong_step" });
    expect(build({ ...s, step: "manage" }, "a", 1).ok).toBe(true);
    expect(actionsFor(s, "a").build).toEqual([1, 3]);
    expect(actionsFor(s, "b").build).toEqual([]);
  });

  it("funciona igual no Banco Imobiliário", () => {
    const s = must(build(ownAll(game({ edition: "banco" }), "a", BROWN), "a", 1)).state;
    expect(s.props[1]!.houses).toBe(1);
    expect(me(s).cash).toBe(2450);
  });

  it("a lista de 'pode construir' acompanha a regra do parelho e do dinheiro", () => {
    let s = ownAll(game(), "a", SKY);
    expect(actionsFor(s, "a").build).toEqual([6, 8, 9]);
    s = must(build(s, "a", 6)).state;
    expect(actionsFor(s, "a").build).toEqual([8, 9]);
    expect(actionsFor(withCash(s, "a", 40), "a").build).toEqual([]);
  });
});

describe("vender construções", () => {
  it("devolve metade do custo e tem que ser parelho (começa pela rua mais construída)", () => {
    let s = built(ownAll(game(), "a", BROWN), BROWN, 2);
    s = must(build(s, "a", 1)).state; // 3 e 2
    expect(sellBuilding(s, "a", 3)).toEqual({ ok: false, error: "sell_evenly" });
    const before = me(s).cash;
    s = must(sellBuilding(s, "a", 1)).state;
    expect(me(s).cash).toBe(before + 25);
    expect(s.props[1]!.houses).toBe(2);
    expect(s.events).toEqual([{ t: "sell", p: "a", sq: 1, level: 2, amount: 25 }]);
    expect(sellBuilding(game(), "a", 1)).toEqual({ ok: false, error: "not_yours" });
    expect(sellBuilding(ownAll(game(), "a", BROWN), "a", 1)).toEqual({ ok: false, error: "nothing_to_sell" });
  });

  it("vender um hotel exige 4 casas sobrando no banco", () => {
    let s = built(ownAll(game(), "a", BROWN), BROWN, 4);
    s = must(build(s, "a", 1)).state;
    s = must(build(s, "a", 3)).state; // dois hotéis
    for (const i of [6, 8, 9, 11, 13, 14, 16, 18]) s = own(s, i, "c", { houses: 4 }); // 32 casas em uso
    expect(sellBuilding(s, "a", 1)).toEqual({ ok: false, error: "no_supply" });
  });

  it("dá pra vender na hora de levantar dinheiro (compra e dívida), não só na fase livre", () => {
    const s = built(ownAll(game(), "a", BROWN), BROWN, 1);
    for (const step of ["roll", "manage", "buy", "debt"] as const) expect(sellBuilding({ ...s, step }, "a", 1).ok, step).toBe(true);
    expect(sellBuilding({ ...s, step: "auction" }, "a", 1).ok).toBe(false);
  });
});

describe("hipoteca", () => {
  it("recebe metade do preço e a casa não cobra mais aluguel", () => {
    let s = own(game(), 6, "b");
    s = must(mortgage({ ...s, turn: 1 }, "b", 6)).state;
    expect(me(s, "b").cash).toBe(1550);
    expect(s.props[6]!.mortgaged).toBe(true);
    expect(s.events).toEqual([{ t: "mortgage", p: "b", sq: 6, amount: 50 }]);
    const landed = must(rollBy({ ...s, turn: 0 }, "a", 6)).state;
    expect(me(landed).cash).toBe(1500);
  });

  it("não hipoteca duas vezes, nem rua com casa no grupo; vende as casas primeiro", () => {
    const s = mortgageSetup();
    expect(mortgage(s, "a", 1)).toEqual({ ok: false, error: "sell_buildings_first" });
    expect(mortgage(own(game(), 1, "a", { mortgaged: true }), "a", 1)).toEqual({ ok: false, error: "already_mortgaged" });
    expect(mortgage(game(), "a", 1)).toEqual({ ok: false, error: "not_yours" });
    const sold = must(sellBuilding(s, "a", 1)).state;
    expect(mortgage(sold, "a", 1).ok).toBe(false); // a 3 ainda tem casa
  });

  it("tirar a hipoteca custa o valor + 10%", () => {
    const s0 = own(game(), 6, "a", { mortgaged: true });
    const s = must(unmortgage(s0, "a", 6)).state;
    expect(me(s).cash).toBe(1500 - 55);
    expect(s.props[6]!.mortgaged).toBe(false);
    expect(s.events).toEqual([{ t: "unmortgage", p: "a", sq: 6, cost: 55 }]);
    expect(unmortgage(game(), "a", 6)).toEqual({ ok: false, error: "not_yours" });
    expect(unmortgage(own(game(), 6, "a"), "a", 6)).toEqual({ ok: false, error: "not_mortgaged" });
    expect(unmortgage(withCash(s0, "a", 54), "a", 6)).toEqual({ ok: false, error: "not_enough_cash" });
    // Mediterranean ($60): hipoteca $30, tirar $33
    expect(me(must(unmortgage(own(game(), 1, "a", { mortgaged: true }), "a", 1)).state).cash).toBe(1467);
  });

  it("ferrovia e serviço também hipotecam; só se tira a hipoteca na fase livre", () => {
    const s = ownAll(game(), "a", [5, 12]);
    expect(me(must(mortgage(s, "a", 5)).state).cash).toBe(1600);
    expect(me(must(mortgage(s, "a", 12)).state).cash).toBe(1575);
    const m = own(game(), 6, "a", { mortgaged: true });
    expect(unmortgage({ ...m, step: "debt" }, "a", 6)).toEqual({ ok: false, error: "wrong_step" });
    expect(actionsFor(m, "a").unmortgage).toEqual([6]);
  });

  it("a lista de 'pode hipotecar' esconde o que já está hipotecado e o grupo com casas", () => {
    const s = mortgageSetup();
    expect(actionsFor(s, "a").mortgage).toEqual([]);
    expect(actionsFor(own(game(), 6, "a"), "a").mortgage).toEqual([6]);
  });
});

function mortgageSetup(): MonoState {
  return built(ownAll(game(), "a", BROWN), BROWN, 1);
}
