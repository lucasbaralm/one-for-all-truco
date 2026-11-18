import { describe, expect, it } from "vitest";
import { buyProperty, mortgage, payDebt, spendJailCard, MonoState } from "./engine";
import { getEdition } from "./editions";
import { at, cardIndex, faces, game, must, own, ownAll, rollBy, withCash, withDeck, withPlayer } from "./testKit";

const me = (s: MonoState, id = "a") => s.players.find((p) => p.id === id)!;

type Fx = ReturnType<typeof getEdition>["decks"]["chance"][number]["fx"];
const chanceIdx = (pred: (fx: Fx) => boolean, edition: "monopoly" | "banco" = "monopoly") => cardIndex(edition, "chance", pred);
const chestIdx = (pred: (fx: Fx) => boolean) => cardIndex("monopoly", "chest", pred);

/** Joga a partir de `from` caindo numa casa de carta com o baralho na ordem dada. */
function drawChance(order: number[], opts: { from?: number; dist?: number; edition?: "monopoly" | "banco"; prep?: (s: MonoState) => MonoState } = {}): MonoState {
  let s = game({ edition: opts.edition });
  s = withDeck(s, "chance", order);
  s = at(s, "a", opts.from ?? 0);
  if (opts.prep) s = opts.prep(s);
  return must(rollBy(s, "a", opts.dist ?? 7)).state;
}

describe("Sorte (Monopoly): avançar", () => {
  it("até uma casa à frente: anda sem salário e fica na compra", () => {
    const s = drawChance([chanceIdx((f) => f.t === "advance" && f.to === 24)]);
    expect(me(s)).toMatchObject({ pos: 24, cash: 1500 });
    expect(s.step).toBe("buy");
    expect(s.events.some((e) => e.t === "card" && e.deck === "chance")).toBe(true);
  });

  it("até uma casa que fica ATRÁS passa pela saída e recebe $200", () => {
    // a 29 + 7 = 36 (Sorte) → St. Charles Place (11)
    const s = drawChance([chanceIdx((f) => f.t === "advance" && f.to === 11)], { from: 29 });
    expect(me(s)).toMatchObject({ pos: 11, cash: 1700 });
    expect(s.events).toContainEqual({ t: "go", p: "a", amount: 200 });
  });

  it("até a Saída recebe o salário", () => {
    const s = drawChance([chanceIdx((f) => f.t === "advance" && f.to === 0)]);
    expect(me(s)).toMatchObject({ pos: 0, cash: 1700 });
    expect(s.step).toBe("manage");
  });

  it("Reading Railroad (5) estando na 7 dá a volta e recebe o salário", () => {
    const s = drawChance([chanceIdx((f) => f.t === "advance" && f.to === 5)]);
    expect(me(s)).toMatchObject({ pos: 5, cash: 1700 });
    expect(s.step).toBe("buy");
  });

  it("avançando pra uma casa com dono, paga o aluguel normal", () => {
    const s = drawChance([chanceIdx((f) => f.t === "advance" && f.to === 24)], { prep: (x) => own(x, 24, "b") });
    expect(me(s).cash).toBe(1500 - 20);
    expect(s.step).toBe("manage");
  });

  it("a carta usada vai pro fundo do baralho", () => {
    const s = drawChance([3, 4, 5]);
    expect(s.decks.chance).toEqual([4, 5, 3]);
  });
});

describe("Sorte (Monopoly): ferrovia e serviço mais próximos", () => {
  const nearestRail = chanceIdx((f) => f.t === "nearest" && f.kind === "railroad");
  const nearestUtil = chanceIdx((f) => f.t === "nearest" && f.kind === "utility");

  it("ferrovia: da 7 vai pra 15; livre = compra; com dono = o DOBRO do aluguel", () => {
    expect(drawChance([nearestRail])).toMatchObject({ step: "buy" });
    expect(me(drawChance([nearestRail])).pos).toBe(15);
    const owned = drawChance([nearestRail], { prep: (x) => own(x, 15, "b") });
    expect(me(owned).cash).toBe(1500 - 50);
    const two = drawChance([nearestRail], { prep: (x) => ownAll(x, "b", [15, 25]) });
    expect(me(two).cash).toBe(1500 - 100);
  });

  it("ferrovia: da 36 dá a volta até a 5 (salário); da 22 vai pra 25", () => {
    const wrap = drawChance([nearestRail], { from: 29 });
    expect(me(wrap)).toMatchObject({ pos: 5, cash: 1700 });
    const mid = drawChance([nearestRail], { from: 15 });
    expect(me(mid).pos).toBe(25);
  });

  it("serviço: com dono joga os dados de novo e paga 10× o que tirar", () => {
    const rng = faces(3, 4, 2, 3); // 3+4 anda; 2+3 = 5 pro aluguel
    let s = withDeck(own(game(), 12, "b"), "chance", [nearestUtil]);
    s = must(rollBy(s, "a", 7, rng)).state;
    expect(me(s)).toMatchObject({ pos: 12, cash: 1500 - 50 });
    expect(s.events).toContainEqual({ t: "rent", p: "a", to: "b", sq: 12, amount: 50, dice: 5 });
    expect(s.dice).toEqual([3, 4]);
  });

  it("serviço livre: dá pra comprar; da 22 vai pra Water Works (28)", () => {
    expect(drawChance([nearestUtil])).toMatchObject({ step: "buy" });
    expect(me(drawChance([nearestUtil], { from: 15 })).pos).toBe(28);
  });
});

describe("Sorte (Monopoly): dinheiro, voltar, prisão", () => {
  it("ganha e paga", () => {
    expect(me(drawChance([chanceIdx((f) => f.t === "gain" && f.amount === 50)])).cash).toBe(1550);
    const pay = drawChance([chanceIdx((f) => f.t === "pay" && f.amount === 15)]);
    expect(me(pay).cash).toBe(1485);
    expect(pay.step).toBe("manage");
  });

  it("volta 3 casas e resolve a casa nova (sem salário)", () => {
    const back = chanceIdx((f) => f.t === "back");
    expect(me(drawChance([back])).cash).toBe(1300); // 7 → 4: imposto de renda
    const vacant = drawChance([back], { from: 15 }); // 22 → 19: New York, livre
    expect(me(vacant)).toMatchObject({ pos: 19, cash: 1500 });
    expect(vacant.step).toBe("buy");
  });

  it("volta 3 e cai numa casa de carta: tira outra carta na hora", () => {
    const back = chanceIdx((f) => f.t === "back");
    const chestGain = chestIdx((f) => f.t === "gain" && f.amount === 200);
    const s = drawChance([back], { from: 29, prep: (x) => withDeck(x, "chest", [chestGain]) }); // 36 → 33 (Caixa)
    expect(me(s)).toMatchObject({ pos: 33, cash: 1700 });
    expect(s.events.filter((e) => e.t === "card")).toHaveLength(2);
  });

  it("'Vá para a prisão' não paga salário e encerra", () => {
    const s = drawChance([chanceIdx((f) => f.t === "jail")]);
    expect(me(s)).toMatchObject({ pos: 10, jail: 0, cash: 1500 });
    expect(s.step).toBe("manage");
    expect(s.events).toContainEqual({ t: "jail", p: "a", why: "card" });
  });

  it("'Saia livre da prisão' fica com quem tirou (e some do baralho) até ser usada", () => {
    const idx = chanceIdx((f) => f.t === "jail_free");
    let s = drawChance([idx, 1, 2]);
    expect(me(s).jailCards).toEqual([{ deck: "chance", idx }]);
    expect(s.decks.chance).toEqual([1, 2]);
    s = withPlayer(s, "a", { jail: 1, pos: 10 });
    s = must(spendJailCard({ ...s, step: "roll" }, "a")).state;
    expect(s.decks.chance).toEqual([1, 2, idx]);
    expect(me(s).jailCards).toEqual([]);
  });
});

describe("Sorte e Caixa: pagar e receber de todos", () => {
  const payEach = chanceIdx((f) => f.t === "pay_each");
  const gainEach = chestIdx((f) => f.t === "gain_each");

  it("pagar a cada jogador: $50 × os outros", () => {
    const s = drawChance([payEach]);
    expect(me(s).cash).toBe(1400);
    expect(me(s, "b").cash).toBe(1550);
    expect(me(s, "c").cash).toBe(1550);
    expect(s.events).toContainEqual({ t: "each", p: "a", per: -50, total: 100 });
  });

  it("sem dinheiro: dívida 'a cada jogador' que se paga depois de levantar o dinheiro", () => {
    let s = drawChance([payEach], { prep: (x) => own(withCash(x, "a", 80), 1, "a") });
    expect(s.step).toBe("debt");
    expect(s.debt).toMatchObject({ amount: 100, to: "each", per: 50, reason: "card" });
    s = must(mortgage(s, "a", 1)).state;
    s = must(payDebt(s, "a")).state;
    expect(me(s)).toMatchObject({ cash: 80 + 30 - 100 });
    expect(me(s, "b").cash).toBe(1550);
    expect(me(s, "c").cash).toBe(1550);
    expect(s.step).toBe("manage");
  });

  it("receber de cada jogador: quem não tem tudo paga o que tem", () => {
    let s = withDeck(withCash(at(game(), "a", 10), "c", 4), "chest", [gainEach]);
    s = must(rollBy(s, "a", 7)).state; // 17: Caixa Comunitária
    expect(me(s).cash).toBe(1500 + 10 + 4);
    expect(me(s, "b").cash).toBe(1490);
    expect(me(s, "c").cash).toBe(0);
    expect(s.events).toContainEqual({ t: "each", p: "a", per: 10, total: 14 });
  });

  it("reparos: $25 por casa e $100 por hotel (Sorte)", () => {
    const repairs = chanceIdx((f) => f.t === "repairs");
    let s = withDeck(at(game(), "a", 0), "chance", [repairs]);
    s = own(own(own(s, 1, "a", { houses: 3 }), 3, "a", { houses: 2 }), 6, "a", { houses: 5 });
    s = must(rollBy(s, "a", 7)).state;
    expect(me(s).cash).toBe(1500 - (5 * 25 + 100));
    expect(s.events).toContainEqual({ t: "repairs", p: "a", amount: 225 });
  });

  it("reparos sem construções não custam nada", () => {
    const repairs = chestIdx((f) => f.t === "repairs");
    let s = withDeck(at(game(), "a", 10), "chest", [repairs]);
    s = must(rollBy(s, "a", 7)).state;
    expect(me(s).cash).toBe(1500);
    expect(s.step).toBe("manage");
  });
});

describe("Caixa Comunitária (Monopoly)", () => {
  it("tem ganhos, multas e a carta de sair da prisão", () => {
    const land = (idx: number) => must(rollBy(withDeck(at(game(), "a", 10), "chest", [idx]), "a", 7)).state;
    expect(me(land(chestIdx((f) => f.t === "gain" && f.amount === 100))).cash).toBe(1600);
    expect(me(land(chestIdx((f) => f.t === "pay" && f.amount === 100))).cash).toBe(1400);
    const free = chestIdx((f) => f.t === "jail_free");
    expect(me(land(free)).jailCards).toEqual([{ deck: "chest", idx: free }]);
  });
});

describe("Sorte ou Revés (Banco Imobiliário)", () => {
  const luck = (pred: (fx: Fx) => boolean) => chanceIdx(pred, "banco");

  it("só existe um baralho: todas as casas de carta tiram dele", () => {
    const s = game({ edition: "banco" });
    expect(s.decks.chance).toHaveLength(getEdition("banco").decks.chance.length);
    expect(s.decks.chest).toHaveLength(0);
    for (const spot of [7, 22]) {
      const from = at(withDeck(s, "chance", [luck((f) => f.t === "gain" && f.amount === 100)]), "a", spot - 7);
      expect(me(must(rollBy(from, "a", 7)).state).cash).toBe(2600);
    }
  });

  it("companhia mais próxima: com dono, aluguel em dobro", () => {
    const s = drawChance([luck((f) => f.t === "nearest")], { edition: "banco", prep: (x) => own(x, 12, "b") });
    expect(me(s)).toMatchObject({ pos: 12, cash: 2500 - 50 });
  });

  it("Habeas Corpus é a carta de sair da prisão", () => {
    const idx = luck((f) => f.t === "jail_free");
    const s = drawChance([idx], { edition: "banco" });
    expect(me(s).jailCards).toEqual([{ deck: "chance", idx }]);
    expect(getEdition("banco").jailCardName).toBe("Habeas Corpus");
  });

  it("blitz manda pra prisão e engarrafamento volta 3 casas", () => {
    expect(me(drawChance([luck((f) => f.t === "jail")], { edition: "banco" }))).toMatchObject({ pos: 10, jail: 0 });
    const back = drawChance([luck((f) => f.t === "back")], { edition: "banco" });
    expect(me(back)).toMatchObject({ pos: 4, cash: 2300 }); // imposto de renda
  });

  it("tirar uma carta e comprar a casa onde parou funcionam juntos", () => {
    let s = drawChance([luck((f) => f.t === "advance" && f.to === 26)], { edition: "banco" });
    expect(me(s).pos).toBe(26);
    expect(s.step).toBe("buy");
    s = must(buyProperty(s, "a")).state;
    expect(s.props[26]!.owner).toBe("a");
    expect(me(s).cash).toBe(2500 - 260);
  });
});
