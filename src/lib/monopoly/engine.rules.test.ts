import { describe, expect, it } from "vitest";
import { MonoState, actionsFor, buyProperty, declineProperty, endTurn, mortgage, payBail, payDebt, rentOf, roll, spendJailCard } from "./engine";
import { at, faces, game, must, own, ownAll, rollBy, rollDouble, withCash, withDeck, withPlayer } from "./testKit";

const me = (s: ReturnType<typeof game>, id = "a") => s.players.find((p) => p.id === id)!;

describe("andar e comprar", () => {
  it("anda a soma dos dados e, numa casa livre, espera a decisão de compra", () => {
    const r = must(roll(game(), "a", faces(2, 3)));
    expect(me(r.state).pos).toBe(5);
    expect(r.state.dice).toEqual([2, 3]);
    expect(r.state.step).toBe("buy");
    expect(r.state.events[0]).toEqual({ t: "roll", p: "a", d: [2, 3] });
    expect(r.state.events[1]).toEqual({ t: "move", p: "a", from: 0, to: 5 });
    expect(r.state.eventSeq).toBe(game().eventSeq + 1);
  });

  it("só quem tem a vez rola, e só uma vez por passo", () => {
    const s = game();
    expect(roll(s, "b", faces(1, 2))).toEqual({ ok: false, error: "not_your_turn" });
    const after = must(roll(s, "a", faces(1, 2))).state;
    expect(roll(after, "a", faces(1, 2))).toEqual({ ok: false, error: "wrong_step" });
    expect(endTurn(after, "a")).toEqual({ ok: false, error: "wrong_step" });
  });

  it("passar pela saída paga o salário; cair exatamente nela também", () => {
    const passed = must(roll(at(game(), "a", 38), "a", faces(2, 3))).state;
    expect(me(passed).pos).toBe(3);
    expect(me(passed).cash).toBe(1500 + 200);
    expect(passed.events.some((e) => e.t === "go" && e.amount === 200)).toBe(true);
    const exact = must(roll(at(game(), "a", 35), "a", faces(2, 3))).state;
    expect(me(exact).pos).toBe(0);
    expect(me(exact).cash).toBe(1700);
    expect(exact.step).toBe("manage");
  });

  it("comprar: paga o preço, vira dono, e a vez segue pra fase livre", () => {
    let s = must(roll(game(), "a", faces(2, 4))).state; // Oriental Avenue ($100)
    expect(actionsFor(s, "a")).toMatchObject({ buy: true, decline: true, roll: false });
    s = must(buyProperty(s, "a")).state;
    expect(me(s).cash).toBe(1400);
    expect(s.props[6]).toEqual({ owner: "a", houses: 0, mortgaged: false });
    expect(s.step).toBe("manage");
    expect(s.stats.a.bought).toBe(1);
    expect(s.events).toEqual([{ t: "buy", p: "a", sq: 6, price: 100 }]);
  });

  it("sem dinheiro não compra (e a tela nem oferece o botão)", () => {
    const s = must(roll(withCash(game(), "a", 50), "a", faces(2, 4))).state;
    expect(buyProperty(s, "a")).toEqual({ ok: false, error: "not_enough_cash" });
    expect(actionsFor(s, "a")).toMatchObject({ buy: false, decline: true });
  });

  it("Monopoly: recusar leva a leilão; Banco Imobiliário: a propriedade só fica livre", () => {
    const m = must(declineProperty(must(roll(game(), "a", faces(2, 4))).state, "a")).state;
    expect(m.step).toBe("auction");
    expect(m.auction).toMatchObject({ sq: 6, bid: 0, leader: null });

    const b0 = game({ edition: "banco" });
    const b = must(declineProperty(must(roll(b0, "a", faces(2, 4))).state, "a")).state;
    expect(b.step).toBe("manage");
    expect(b.auction).toBeNull();
    expect(b.props[6]!.owner).toBeNull();
  });

  it("encerrar a vez passa pro próximo; a rodada sobe quando volta ao primeiro", () => {
    let s: MonoState = { ...game(), step: "manage" };
    s = must(endTurn(s, "a")).state;
    expect(s.turn).toBe(1);
    expect(s.step).toBe("roll");
    expect(s.round).toBe(1);
    s = must(endTurn({ ...s, step: "manage" }, "b")).state;
    s = must(endTurn({ ...s, step: "manage" }, "c")).state;
    expect(s.turn).toBe(0);
    expect(s.round).toBe(2);
    expect(s.events).toEqual([{ t: "turn", p: "a" }]);
  });

  it("só a pessoa da vez encerra, e só na fase livre", () => {
    const s = { ...game(), step: "manage" as const };
    expect(endTurn(s, "b")).toEqual({ ok: false, error: "not_your_turn" });
    expect(endTurn(game(), "a")).toEqual({ ok: false, error: "wrong_step" });
  });

  it("falido é pulado na ordem", () => {
    let s = withPlayer(game(), "b", { bankrupt: true });
    s = must(endTurn({ ...s, step: "manage" }, "a")).state;
    expect(s.turn).toBe(2);
  });
});

describe("aluguel", () => {
  const rentPaidBy = (s0: ReturnType<typeof game>, dist: number, dice?: () => number) => {
    const s = must(rollBy(s0, "a", dist, dice)).state;
    return { s, paid: 1500 - me(s).cash, received: s.players.find((p) => p.id === "b")!.cash - 1500 };
  };

  it("rua sem o grupo: aluguel base; com o grupo inteiro e sem casas: o dobro", () => {
    const one = rentPaidBy(own(game(), 6, "b"), 6);
    expect(one.paid).toBe(6);
    expect(one.received).toBe(6);
    expect(one.s.step).toBe("manage");
    expect(one.s.stats.a.rentOut).toBe(6);
    expect(one.s.stats.b.rentIn).toBe(6);
    expect(one.s.events).toContainEqual({ t: "rent", p: "a", to: "b", sq: 6, amount: 6, dice: undefined });
    expect(rentPaidBy(ownAll(game(), "b", [6, 8, 9]), 6).paid).toBe(12);
  });

  it("com casas e hotel segue a tabela da rua", () => {
    const base = ownAll(game(), "b", [6, 8, 9]);
    const withHouses = (n: number) => own(base, 6, "b", { houses: n });
    expect([1, 2, 3, 4, 5].map((n) => rentPaidBy(withHouses(n), 6).paid)).toEqual([30, 90, 270, 400, 550]);
  });

  it("hipotecada e do próprio dono não cobram nada", () => {
    expect(rentPaidBy(own(game(), 6, "b", { mortgaged: true }), 6).paid).toBe(0);
    const mine = must(rollBy(own(game(), 6, "a"), "a", 6)).state;
    expect(me(mine).cash).toBe(1500);
    expect(mine.step).toBe("manage");
  });

  it("ferrovias: 25, 50, 100, 200 pela quantidade que o dono tem", () => {
    const rails = [5, 15, 25, 35];
    for (let n = 1; n <= 4; n++) {
      const s = ownAll(game(), "b", rails.slice(0, n));
      expect(rentOf(s, 5, 7)).toBe([25, 50, 100, 200][n - 1]);
    }
    expect(rentPaidBy(ownAll(game(), "b", [5, 15]), 5).paid).toBe(50);
  });

  it("serviços: 4× o dado com um, 10× com os dois", () => {
    expect(rentOf(own(game(), 12, "b"), 12, 9)).toBe(36);
    expect(rentOf(ownAll(game(), "b", [12, 28]), 12, 9)).toBe(90);
    expect(rentPaidBy(own(game(), 12, "b"), 12, faces(5, 7)).paid).toBe(48);
  });

  it("Banco Imobiliário: as 6 companhias pagam 25, 50, 100, 150, 250, 400", () => {
    const companies = [5, 12, 15, 25, 28, 35];
    for (let n = 1; n <= 6; n++) {
      const s = ownAll(game({ edition: "banco" }), "b", companies.slice(0, n));
      expect(rentOf(s, 5, 7)).toBe([25, 50, 100, 150, 250, 400][n - 1]);
    }
  });

  it("rentOf: casa livre = 0", () => {
    expect(rentOf(game(), 6, 7)).toBe(0);
    expect(rentOf(game(), 0, 7)).toBe(0);
  });
});

describe("impostos e casas especiais", () => {
  it("imposto de renda e taxa de luxo vão pro banco", () => {
    const tax = must(rollBy(at(game(), "a", 1), "a", 3)).state; // 4
    expect(me(tax).cash).toBe(1300);
    expect(tax.events).toContainEqual({ t: "tax", p: "a", sq: 4, amount: 200 });
    const lux = must(rollBy(at(game(), "a", 33), "a", 5)).state; // 38
    expect(me(lux).cash).toBe(1425);
  });

  it("sem dinheiro pro imposto: vira dívida (a vez espera)", () => {
    const s = must(rollBy(withCash(at(game(), "a", 1), "a", 100), "a", 3)).state;
    expect(s.step).toBe("debt");
    expect(s.debt).toMatchObject({ amount: 200, to: "bank", reason: "tax", next: "finish" });
    expect(me(s).cash).toBe(100);
    expect(payDebt(s, "a")).toEqual({ ok: false, error: "not_enough_cash" });
    expect(actionsFor(s, "a")).toMatchObject({ payDebt: false, bankrupt: true, roll: false, endTurn: false });
  });

  it("Banco Imobiliário: 'Lucros ou Dividendos' paga R$ 100", () => {
    const s = must(rollBy(at(game({ edition: "banco" }), "a", 33), "a", 5)).state; // 38
    expect(me(s).cash).toBe(2600);
    expect(s.events).toContainEqual({ t: "bonus", p: "a", sq: 38, amount: 100 });
    expect(s.step).toBe("manage");
  });

  it("estacionamento, prisão (só visita) e saída não fazem nada", () => {
    for (const [from, dist, expected] of [[17, 3, 20], [6, 4, 10], [34, 6, 0]] as const) {
      const s = must(rollBy(at(game(), "a", from), "a", dist)).state;
      expect(me(s).pos).toBe(expected);
      expect(s.step).toBe("manage");
    }
    expect(me(must(rollBy(at(game(), "a", 6), "a", 4)).state).jail).toBeNull();
  });

  it("'Vá para a Prisão' manda direto, sem salário, e encerra as jogadas", () => {
    const s = must(rollBy(at(game(), "a", 24), "a", 6)).state; // 30
    expect(me(s)).toMatchObject({ pos: 10, jail: 0, cash: 1500 });
    expect(s.step).toBe("manage");
    expect(s.stats.a.jailed).toBe(1);
    expect(s.events).toContainEqual({ t: "jail", p: "a", why: "square" });
  });
});

describe("dados dobrados", () => {
  it("dupla = joga de novo (depois de resolver a casa)", () => {
    const s0 = own(game(), 8, "b"); // Vermont
    const s = must(rollDouble(s0, "a", 4)).state; // 8
    expect(me(s).pos).toBe(8);
    expect(me(s).cash).toBe(1494);
    expect(s.step).toBe("roll");
    expect(s.doubles).toBe(1);
    expect(s.stats.a.doubles).toBe(1);
    const next = must(roll(s, "a", faces(1, 2))).state;
    expect(next.step).not.toBe("roll");
    expect(next.doubles).toBe(0);
  });

  it("dupla numa casa livre: decide a compra e DEPOIS joga de novo", () => {
    let s = must(rollDouble(game(), "a", 4)).state;
    expect(s.step).toBe("buy");
    s = must(buyProperty(s, "a")).state;
    expect(s.step).toBe("roll");
  });

  it("a terceira dupla seguida vai pra prisão sem andar", () => {
    const s0 = { ...game(), doubles: 2 };
    const s = must(rollDouble(s0, "a", 3)).state;
    expect(me(s)).toMatchObject({ pos: 10, jail: 0 });
    expect(s.step).toBe("manage");
    expect(s.doubles).toBe(0);
    expect(s.events).toContainEqual({ t: "jail", p: "a", why: "doubles" });
  });

  it("cair na prisão por dupla não dá outra jogada", () => {
    const s = must(rollDouble(at(game(), "a", 24), "a", 3)).state; // 30
    expect(me(s).jail).toBe(0);
    expect(s.step).toBe("manage");
  });
});

describe("prisão", () => {
  const jailed = (s0 = game()) => withPlayer(at(s0, "a", 10), "a", { jail: 0 });

  it("pagar a fiança solta e a pessoa joga normalmente", () => {
    let s = must(payBail(jailed(), "a")).state;
    expect(me(s)).toMatchObject({ jail: null, cash: 1450 });
    expect(s.step).toBe("roll");
    s = must(roll(s, "a", faces(1, 2))).state;
    expect(me(s).pos).toBe(13);
  });

  it("sem dinheiro pra fiança, ou fora da prisão, não paga", () => {
    expect(payBail(withCash(jailed(), "a", 10), "a")).toEqual({ ok: false, error: "not_enough_cash" });
    expect(payBail(game(), "a")).toEqual({ ok: false, error: "not_in_jail" });
    expect(actionsFor(withCash(jailed(), "a", 10), "a").payBail).toBe(false);
    expect(actionsFor(jailed(), "a")).toMatchObject({ payBail: true, useJailCard: false, roll: true });
  });

  it("a carta solta e volta pro fundo do baralho", () => {
    const s0 = withPlayer(jailed(withDeck(game(), "chance", [3, 4])), "a", { jailCards: [{ deck: "chance", idx: 7 }] });
    expect(actionsFor(s0, "a").useJailCard).toBe(true);
    const s = must(spendJailCard(s0, "a")).state;
    expect(me(s)).toMatchObject({ jail: null, jailCards: [] });
    expect(s.decks.chance).toEqual([3, 4, 7]);
    expect(spendJailCard(game(), "a")).toEqual({ ok: false, error: "not_in_jail" });
    expect(spendJailCard(jailed(), "a")).toEqual({ ok: false, error: "no_jail_card" });
  });

  it("tirar dupla solta e anda o que tirou — mas não joga de novo", () => {
    const s = must(rollDouble(jailed(), "a", 2)).state; // 10 + 4 = 14 (Virginia, livre)
    expect(me(s)).toMatchObject({ jail: null, pos: 14 });
    expect(s.events).toContainEqual({ t: "bail", p: "a", how: "doubles" });
    expect(s.doubles).toBe(0);
    // saiu por dupla: decide a compra e a vez acaba (nada de jogar de novo)
    expect(s.step).toBe("buy");
    expect(must(buyProperty(s, "a")).state.step).toBe("manage");
  });

  it("sem dupla: continua preso e a vez acaba; a terceira tentativa paga e anda", () => {
    let s = must(roll(jailed(), "a", faces(1, 2))).state;
    expect(me(s)).toMatchObject({ jail: 1, pos: 10 });
    expect(s.step).toBe("manage");
    expect(s.events).toContainEqual({ t: "jail_fail", p: "a", tries: 1 });
    s = must(roll({ ...s, step: "roll" }, "a", faces(1, 2))).state;
    expect(me(s).jail).toBe(2);
    s = must(roll({ ...s, step: "roll" }, "a", faces(1, 2))).state;
    // terceira: paga $50 e anda 3
    expect(me(s)).toMatchObject({ jail: null, pos: 13, cash: 1450 });
    expect(s.events).toContainEqual({ t: "bail", p: "a", how: "forced" });
    expect(s.step).toBe("buy");
  });

  it("terceira tentativa sem dinheiro: dívida; paga depois de levantar e só então anda", () => {
    let s = withCash(withPlayer(jailed(), "a", { jail: 2 }), "a", 20);
    s = own(s, 1, "a"); // algo pra hipotecar
    s = must(roll(s, "a", faces(1, 2))).state;
    expect(s.step).toBe("debt");
    expect(s.debt).toMatchObject({ amount: 50, reason: "bail", next: "move" });
    expect(me(s)).toMatchObject({ pos: 10, jail: 3 });
    s = must(mortgage(s, "a", 1)).state;
    s = must(payDebt(s, "a")).state;
    expect(me(s)).toMatchObject({ jail: null, pos: 13, cash: 20 + 30 - 50 });
    expect(s.step).toBe("buy");
  });

  it("preso pode construir antes de rolar, mas não encerrar a vez sem jogar", () => {
    expect(actionsFor(jailed(), "a").endTurn).toBe(false);
  });
});
