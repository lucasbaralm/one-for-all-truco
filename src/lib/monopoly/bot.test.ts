import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { chooseBotAction, decideTrade } from "./bot";
import { MonoController } from "./controller";
import { MonoState, actionsFor, declineProperty, proposeTrade } from "./engine";
import type { MonoClientMessage } from "./protocol";
import { at, game, must, own, ownAll, rollBy, withCash, withPlayer } from "./testKit";

type Level = "easy" | "medium" | "hard";
const LEVELS: Level[] = ["easy", "medium", "hard"];

const fixed = (v: number) => () => v;
const BROWN = [1, 3];

/** Aplica uma mensagem do bot pelo controlador (o motor de verdade) e devolve o estado novo. */
function apply(s: MonoState, id: string, msg: MonoClientMessage): MonoState {
  const ctl = new MonoController(s, { rng: mulberry32(1), setTimer: () => 0, clearTimer: () => {} });
  return must(ctl.dispatch(id, msg)).state;
}

/** Continua pedindo a jogada do bot e aplicando, até ele encerrar a vez, pagar a dívida ou quebrar (essas três ficam só na lista). */
function playOn(s: MonoState, id: string, level: Level, rng = fixed(0), max = 40): { msgs: MonoClientMessage[]; state: MonoState } {
  const msgs: MonoClientMessage[] = [];
  let cur = s;
  for (let i = 0; i < max; i++) {
    const m = chooseBotAction(cur, id, level, rng);
    msgs.push(m);
    if (m.type === "end_turn" || m.type === "pay_debt" || m.type === "bankrupt") break;
    cur = apply(cur, id, m);
  }
  return { msgs, state: cur };
}

const manage = (s: MonoState): MonoState => ({ ...s, step: "manage" });
const cashOf = (s: MonoState, id = "a") => s.players.find((p) => p.id === id)!.cash;

describe("rolar e a prisão", () => {
  it("livre: rola; fora da vez não faz nada (end_turn, que o motor recusa)", () => {
    for (const level of LEVELS) {
      expect(chooseBotAction(game(), "a", level, fixed(0.5))).toEqual({ type: "roll" });
      expect(chooseBotAction(game(), "b", level, fixed(0.5))).toEqual({ type: "end_turn" });
    }
  });

  it("preso com carta: usa a carta, de graça, em qualquer nível", () => {
    const s = withPlayer(at(game(), "a", 10), "a", { jail: 0, jailCards: [{ deck: "chance", idx: 7 }] });
    for (const level of LEVELS) expect(chooseBotAction(s, "a", level, fixed(0.9))).toEqual({ type: "use_card" });
  });

  it("preso sem carta: paga a fiança se sobra folga, senão tenta a dupla", () => {
    const jailed = (cash: number) => withCash(withPlayer(at(game(), "a", 10), "a", { jail: 0 }), "a", cash);
    // médio: folga de $250 depois da fiança
    expect(chooseBotAction(jailed(1500), "a", "medium", fixed(0))).toEqual({ type: "pay_bail" });
    expect(chooseBotAction(jailed(299), "a", "medium", fixed(0))).toEqual({ type: "roll" });
    expect(chooseBotAction(jailed(300), "a", "medium", fixed(0))).toEqual({ type: "pay_bail" });
    // sem dinheiro pra fiança, rola
    for (const level of LEVELS) expect(chooseBotAction(jailed(30), "a", level, fixed(0))).toEqual({ type: "roll" });
    // fácil: depende da sorte
    expect(chooseBotAction(jailed(1500), "a", "easy", fixed(0.1))).toEqual({ type: "pay_bail" });
    expect(chooseBotAction(jailed(1500), "a", "easy", fixed(0.9))).toEqual({ type: "roll" });
  });

  it("difícil sai cedo, mas no fim do jogo (tudo vendido) prefere ficar na prisão", () => {
    const early = withCash(withPlayer(at(game(), "a", 10), "a", { jail: 0 }), "a", 400);
    expect(chooseBotAction(early, "a", "hard", fixed(0))).toEqual({ type: "pay_bail" });
    const late = game().props.reduce((s, p, i) => (p ? own(s, i, "b") : s), early);
    expect(chooseBotAction(late, "a", "hard", fixed(0))).toEqual({ type: "roll" });
    // o médio não olha o estágio do jogo
    expect(chooseBotAction(late, "a", "medium", fixed(0))).toEqual({ type: "pay_bail" });
  });
});

describe("comprar ou recusar", () => {
  /** `a` cai na Oriental Avenue (6, $100) com `cash` no bolso. */
  const atOriental = (cash: number, prep: (s: MonoState) => MonoState = (s) => s) => must(rollBy(prep(withCash(game(), "a", cash)), "a", 6)).state;

  it("sem dinheiro pro preço, recusa — em qualquer nível", () => {
    for (const level of LEVELS) expect(chooseBotAction(atOriental(99), "a", level, fixed(0))).toEqual({ type: "decline" });
  });

  it("fácil: ~60% das vezes que pode", () => {
    const s = atOriental(1500);
    expect(chooseBotAction(s, "a", "easy", fixed(0.59))).toEqual({ type: "buy" });
    expect(chooseBotAction(s, "a", "easy", fixed(0.61))).toEqual({ type: "decline" });
    let buys = 0;
    for (let seed = 1; seed <= 500; seed++) if (chooseBotAction(s, "a", "easy", mulberry32(seed)).type === "buy") buys++;
    expect(buys / 500).toBeGreaterThan(0.5);
    expect(buys / 500).toBeLessThan(0.7);
    // gasta tudo: sem reserva
    expect(chooseBotAction(atOriental(100), "a", "easy", fixed(0))).toEqual({ type: "buy" });
  });

  it("médio: compra quando sobra reserva de $150", () => {
    expect(chooseBotAction(atOriental(250), "a", "medium", fixed(0.99))).toEqual({ type: "buy" });
    expect(chooseBotAction(atOriental(249), "a", "medium", fixed(0))).toEqual({ type: "decline" });
  });

  it("difícil: reserva menor (mais agressivo) que o médio", () => {
    expect(chooseBotAction(atOriental(175), "a", "hard", fixed(0.99))).toEqual({ type: "buy" });
    expect(chooseBotAction(atOriental(174), "a", "hard", fixed(0))).toEqual({ type: "decline" });
    expect(chooseBotAction(atOriental(175), "a", "medium", fixed(0))).toEqual({ type: "decline" });
  });

  it("médio e difícil compram a rua que FECHA o grupo mesmo ficando sem reserva", () => {
    const prep = (s: MonoState) => ownAll(s, "a", [8, 9]);
    for (const level of ["medium", "hard"] as const) expect(chooseBotAction(atOriental(100, prep), "a", level, fixed(0.99))).toEqual({ type: "buy" });
  });

  it("só o difícil compra pra BLOQUEAR o adversário que fecharia o grupo", () => {
    const prep = (s: MonoState) => ownAll(s, "b", [8, 9]);
    expect(chooseBotAction(atOriental(110, prep), "a", "hard", fixed(0.99))).toEqual({ type: "buy" });
    expect(chooseBotAction(atOriental(110, prep), "a", "medium", fixed(0.99))).toEqual({ type: "decline" });
  });

  it("difícil gasta mais nas cores quentes (laranja e vermelho) do que nas outras", () => {
    // St. James Place (16, laranja, $180): sobra $30 depois de comprar
    const orange = must(rollBy(at(withCash(game(), "a", 210), "a", 10), "a", 6)).state;
    expect(chooseBotAction(orange, "a", "hard", fixed(0))).toEqual({ type: "buy" });
    expect(chooseBotAction(withCash(orange, "a", 190), "a", "hard", fixed(0))).toEqual({ type: "decline" });
    // Oriental (azul-claro) com a mesma sobra de $30: não
    expect(chooseBotAction(atOriental(130), "a", "hard", fixed(0))).toEqual({ type: "decline" });
  });

  it("ferrovia e companhia também são compradas", () => {
    const s = must(rollBy(withCash(game(), "a", 1500), "a", 5)).state; // Reading Railroad
    for (const level of ["medium", "hard"] as const) expect(chooseBotAction(s, "a", level, fixed(0))).toEqual({ type: "buy" });
  });
});

describe("leilão", () => {
  /** `a` recusou a Oriental ($100): leilão com b, c, a nessa ordem; a vez de dar lance é do `b`. */
  const auction = (prep: (s: MonoState) => MonoState = (s) => s) => must(declineProperty(must(rollBy(prep(game()), "a", 6)).state, "a")).state;
  const withBid = (s: MonoState, bid: number, leader = "c"): MonoState => ({ ...s, auction: { ...s.auction!, bid, leader } });
  const bidOf = (m: MonoClientMessage) => (m.type === "bid" ? m.amount : null);

  it("médio vai até ~90% do preço, e depois passa", () => {
    const s = auction();
    expect(bidOf(chooseBotAction(s, "b", "medium", fixed(0)))).toBe(10); // abre baixo
    expect(bidOf(chooseBotAction(withBid(s, 85), "b", "medium", fixed(0)))).toBe(90); // não passa do teto
    expect(chooseBotAction(withBid(s, 90), "b", "medium", fixed(0))).toEqual({ type: "pass_bid" });
  });

  it("difícil vai até ~110%; fácil fica bem abaixo do preço, ao acaso", () => {
    const s = auction();
    expect(bidOf(chooseBotAction(withBid(s, 105), "b", "hard", fixed(0)))).toBe(110);
    expect(chooseBotAction(withBid(s, 110), "b", "hard", fixed(0))).toEqual({ type: "pass_bid" });
    let top = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const m = chooseBotAction(withBid(s, 0), "b", "easy", mulberry32(seed));
      if (m.type === "bid") top = Math.max(top, m.amount);
    }
    expect(top).toBeLessThanOrEqual(70);
    // com o lance atual já acima do que topa, passa
    expect(chooseBotAction(withBid(s, 70), "b", "easy", fixed(0.99))).toEqual({ type: "pass_bid" });
  });

  it("paga mais pela rua que fecha o seu grupo, e o difícil também pra bloquear", () => {
    const completes = auction((x) => ownAll(x, "b", [8, 9]));
    expect(bidOf(chooseBotAction(withBid(completes, 125), "b", "medium", fixed(0)))).toBe(130); // 1,3 × $100
    expect(bidOf(chooseBotAction(withBid(completes, 195), "b", "hard", fixed(0)))).toBe(200); // 2 × $100
    // adversário (a) fecharia o grupo se levasse
    const blocks = auction((x) => ownAll(x, "a", [8, 9]));
    expect(bidOf(chooseBotAction(withBid(blocks, 135), "b", "hard", fixed(0)))).toBe(140);
    expect(chooseBotAction(withBid(blocks, 95), "b", "medium", fixed(0))).toEqual({ type: "pass_bid" });
  });

  it("nunca dá lance maior que o dinheiro, e guarda a reserva quando não fecha grupo", () => {
    const s = auction();
    expect(bidOf(chooseBotAction(withBid(withCash(s, "b", 160), 50), "b", "medium", fixed(0)))).toBe(60); // 160 − reserva de 100
    expect(chooseBotAction(withBid(withCash(s, "b", 120), 50), "b", "medium", fixed(0))).toEqual({ type: "pass_bid" });
    // sem dinheiro pra cobrir o lance atual: passa
    expect(chooseBotAction(withBid(withCash(s, "b", 50), 50), "b", "hard", fixed(0))).toEqual({ type: "pass_bid" });
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 100; seed++) {
        const m = chooseBotAction(withBid(withCash(s, "b", 80), 20), "b", level, mulberry32(seed));
        if (m.type === "bid") expect(m.amount).toBeLessThanOrEqual(80);
      }
    }
  });

  it("cada lance é aceito pelo motor (e maior que o atual)", () => {
    for (const level of LEVELS) {
      let s = auction();
      for (let i = 0; i < 12 && s.step === "auction"; i++) {
        const who = s.auction!.bidder;
        s = apply(s, who, chooseBotAction(s, who, level, mulberry32(i + 1)));
      }
      expect(s.step === "auction" || s.step === "manage").toBe(true);
    }
  });
});

describe("dívida: levantar dinheiro ou quebrar", () => {
  const owing = (amount: number, cash: number, prep: (s: MonoState) => MonoState = (s) => s): MonoState => ({
    ...withCash(prep(game()), "a", cash),
    step: "debt",
    debt: { amount, to: "b", reason: "rent", next: "finish" },
  });

  it("com dinheiro, paga", () => {
    for (const level of LEVELS) expect(chooseBotAction(owing(80, 100), "a", level, fixed(0))).toEqual({ type: "pay_debt" });
  });

  it("vende as casas e hipoteca as ruas menos valiosas primeiro, até dar pra pagar", () => {
    // a: casas nas marrons (50 cada), ferrovia (200) e a Oriental (100); deve $60 e tem $0
    const s = owing(60, 0, (x) => own(own(ownAll(x, "a", BROWN, { houses: 1 }), 5, "a"), 6, "a"));
    for (const level of LEVELS) {
      const { msgs, state } = playOn(s, "a", level);
      // casas primeiro (valem menos), depois a rua mais barata; a ferrovia e as marrons ficam
      expect(msgs).toEqual([{ type: "sell", sq: 1 }, { type: "sell", sq: 3 }, { type: "mortgage", sq: 6 }, { type: "pay_debt" }]);
      expect(cashOf(state)).toBe(0 + 25 + 25 + 50);
    }
    // e a dívida é paga de fato
    const after = playOn(s, "a", "medium").state;
    expect(apply(after, "a", { type: "pay_debt" }).step).toBe("manage");
  });

  it("não desmonta nada se vai quebrar de qualquer jeito: declara falência de cara", () => {
    const s = owing(5000, 10, (x) => own(x, 6, "a"));
    for (const level of LEVELS) expect(chooseBotAction(s, "a", level, fixed(0))).toEqual({ type: "bankrupt" });
    expect(chooseBotAction(owing(500, 0), "a", "hard", fixed(0))).toEqual({ type: "bankrupt" });
  });

  it("hotel que o banco não consegue devolver em casas trava a venda: sem como pagar, falência", () => {
    // o banco está sem casas (b tem 32): vender o hotel é proibido e hipotecar o grupo construído também
    let s = ownAll(game(), "a", BROWN, { houses: 5 });
    s = ownAll(s, "b", [6, 8, 9, 11, 13, 14], { houses: 4 });
    s = ownAll(s, "b", [16, 18], { houses: 4 });
    const debt = { ...withCash(s, "a", 10), step: "debt" as const, debt: { amount: 400, to: "b", reason: "rent" as const, next: "finish" as const } };
    expect(actionsFor(debt, "a")).toMatchObject({ sell: [], mortgage: [], payDebt: false, bankrupt: true });
    expect(chooseBotAction(debt, "a", "medium", fixed(0))).toEqual({ type: "bankrupt" });
  });

  it("depois de levantar o dinheiro de uma dívida real (aluguel de hotel), a vez segue", () => {
    // a tem as quatro ferrovias e a St. Charles (11): hipotecando tudo chega a $570 — o bastante pra um hotel de $550
    let s = withCash(ownAll(own(game(), 6, "b", { houses: 5 }), "a", [5, 15, 25, 35, 11]), "a", 100);
    s = must(rollBy(s, "a", 6)).state;
    expect(s.step).toBe("debt");
    const { msgs, state } = playOn(s, "a", "hard");
    expect(msgs).toHaveLength(6); // 5 hipotecas e, por fim, pagar
    expect(msgs.slice(0, 5).every((m) => m.type === "mortgage")).toBe(true);
    expect(msgs.at(-1)).toEqual({ type: "pay_debt" });
    expect(state.debt).toEqual(s.debt);
    expect(apply(state, "a", { type: "pay_debt" }).debt).toBeNull();
  });
});

describe("fase livre: construir, hipotecas e encerrar", () => {
  const brown = (cash: number, extra: (s: MonoState) => MonoState = (s) => s) => manage(extra(withCash(ownAll(game(), "a", BROWN), "a", cash)));

  it("sem nada a fazer, encerra a vez", () => {
    for (const level of LEVELS) expect(chooseBotAction(manage(game()), "a", level, fixed(0))).toEqual({ type: "end_turn" });
  });

  it("médio constrói quando sobra reserva ($150 depois da casa)", () => {
    expect(chooseBotAction(brown(200), "a", "medium", fixed(0))).toMatchObject({ type: "build" });
    expect(chooseBotAction(brown(199), "a", "medium", fixed(0))).toEqual({ type: "end_turn" });
  });

  it("difícil constrói mais cedo (reserva de $75) e a 3ª casa vem rápido", () => {
    expect(chooseBotAction(brown(125), "a", "hard", fixed(0))).toMatchObject({ type: "build" });
    expect(chooseBotAction(brown(124), "a", "hard", fixed(0))).toEqual({ type: "end_turn" });
    const three = ownAll(manage(withCash(game(), "a", 1500)), "a", BROWN, { houses: 2 });
    expect(chooseBotAction(three, "a", "hard", fixed(0))).toMatchObject({ type: "build" }); // 3ª casa
  });

  it("a 4ª casa e o hotel pedem reserva maior", () => {
    const four = (cash: number) => manage(withCash(ownAll(game(), "a", BROWN, { houses: 3 }), "a", cash));
    expect(chooseBotAction(four(299), "a", "hard", fixed(0))).toEqual({ type: "end_turn" });
    expect(chooseBotAction(four(300), "a", "hard", fixed(0))).toMatchObject({ type: "build" });
    expect(chooseBotAction(four(399), "a", "medium", fixed(0))).toEqual({ type: "end_turn" });
    expect(chooseBotAction(four(400), "a", "medium", fixed(0))).toMatchObject({ type: "build" });
  });

  it("constrói sempre parelho: nunca duas casas de diferença no grupo", () => {
    for (const level of ["medium", "hard"] as const) {
      const { msgs, state } = playOn(brown(5000), "a", level, fixed(0), 60);
      const houses = BROWN.map((i) => state.props[i]!.houses);
      expect(houses).toEqual([5, 5]); // tudo até o hotel, sem nenhuma recusa do motor
      expect(msgs.filter((m) => m.type === "build")).toHaveLength(10);
    }
    // passo a passo: cada casa vai pra rua que está atrás
    let s = brown(5000);
    for (let i = 0; i < 8; i++) {
      s = apply(s, "a", chooseBotAction(s, "a", "medium", fixed(0)));
      const h = BROWN.map((j) => s.props[j]!.houses);
      expect(Math.abs(h[0] - h[1])).toBeLessThanOrEqual(1);
    }
  });

  it("fácil constrói pouco: só às vezes e nunca passa da 3ª casa", () => {
    expect(chooseBotAction(brown(1500), "a", "easy", fixed(0.1))).toMatchObject({ type: "build" });
    expect(chooseBotAction(brown(1500), "a", "easy", fixed(0.5))).toEqual({ type: "end_turn" });
    const three = manage(withCash(ownAll(game(), "a", BROWN, { houses: 3 }), "a", 5000));
    for (let seed = 1; seed <= 50; seed++) expect(chooseBotAction(three, "a", "easy", mulberry32(seed))).toEqual({ type: "end_turn" });
  });

  it("prefere a rua que dá mais aluguel por dinheiro gasto", () => {
    // marrons: a 2ª rua (Baltic) paga mais que a 1ª (Mediterranean) pela mesma casa
    expect(chooseBotAction(brown(1500), "a", "hard", fixed(0))).toEqual({ type: "build", sq: 3 });
  });

  it("tira a hipoteca quando sobra reserva; antes, a de um grupo que já é seu", () => {
    const mortgaged = (cash: number) => manage(withCash(own(game(), 6, "a", { mortgaged: true }), "a", cash)); // custo $55
    expect(chooseBotAction(mortgaged(1000), "a", "medium", fixed(0))).toEqual({ type: "unmortgage", sq: 6 });
    expect(chooseBotAction(mortgaged(254), "a", "medium", fixed(0))).toEqual({ type: "end_turn" }); // sobraria < $200
    expect(chooseBotAction(mortgaged(255), "a", "medium", fixed(0))).toEqual({ type: "unmortgage", sq: 6 });
    expect(chooseBotAction(mortgaged(205), "a", "hard", fixed(0))).toEqual({ type: "unmortgage", sq: 6 }); // reserva de $150
    expect(chooseBotAction(mortgaged(1000), "a", "easy", fixed(0.1))).toEqual({ type: "unmortgage", sq: 6 });
    expect(chooseBotAction(mortgaged(1000), "a", "easy", fixed(0.9))).toEqual({ type: "end_turn" });
    // marrom fechado com uma hipotecada (não dá pra construir) + Oriental hipotecada: a marrom primeiro
    const both = manage(withCash(own(ownAll(game(), "a", BROWN), 1, "a", { mortgaged: true }), "a", 3000));
    expect(chooseBotAction(own(both, 6, "a", { mortgaged: true }), "a", "medium", fixed(0))).toEqual({ type: "unmortgage", sq: 1 });
  });

  it("difícil hipoteca o que menos vale pra completar o dinheiro de uma construção — e não desipoteca em círculos", () => {
    // a tem as marrons (sem casas), a Oriental solta e $100: falta pra reserva de construir (50 + 75)
    const s = manage(withCash(own(ownAll(game(), "a", BROWN), 6, "a"), "a", 100));
    expect(chooseBotAction(s, "a", "hard", fixed(0))).toEqual({ type: "mortgage", sq: 6 });
    // o médio e o fácil não fazem isso
    expect(chooseBotAction(s, "a", "medium", fixed(0))).toEqual({ type: "end_turn" });
    expect(chooseBotAction(s, "a", "easy", fixed(0))).toEqual({ type: "end_turn" });
    // a mesma vez inteira: hipoteca, constrói e encerra — sem tirar a hipoteca de volta
    const { msgs } = playOn(s, "a", "hard", fixed(0), 30);
    expect(msgs[0]).toEqual({ type: "mortgage", sq: 6 });
    expect(msgs[1]).toMatchObject({ type: "build" });
    expect(msgs.at(-1)).toEqual({ type: "end_turn" });
    expect(msgs.some((m) => m.type === "unmortgage")).toBe(false);
    // se hipotecar tudo o que pode ainda não completa, nem começa
    const poor = manage(withCash(own(ownAll(game(), "a", BROWN), 6, "a"), "a", 40));
    expect(chooseBotAction(poor, "a", "hard", fixed(0))).toEqual({ type: "end_turn" });
  });

  it("nunca hipoteca ruas de um grupo que ele fechou", () => {
    const s = manage(withCash(ownAll(ownAll(game(), "a", BROWN), "a", [11, 13, 14]), "a", 60));
    // marrons e rosas são todas dele: nada é "sobra"; sem dinheiro pra construir, só encerra
    expect(chooseBotAction(s, "a", "hard", fixed(0))).toEqual({ type: "end_turn" });
  });

  it("não tira hipoteca se há construção esperando dinheiro (guarda pra construir)", () => {
    const s = manage(withCash(own(ownAll(game(), "a", BROWN), 6, "a", { mortgaged: true }), "a", 200));
    // hard: 200 − 55 = 145 < 150 de qualquer jeito; sobe o dinheiro: sobra pro desipotecar, mas a construção (50 + 75) vem antes
    const rich = withCash(s, "a", 1000);
    expect(chooseBotAction(rich, "a", "hard", fixed(0))).toMatchObject({ type: "build" });
    // sem dinheiro pra construir e com uma construção esperando: não desipoteca
    const waiting = manage(withCash(own(ownAll(game(), "a", BROWN), 6, "a", { mortgaged: true }), "a", 70));
    expect(chooseBotAction(waiting, "a", "medium", fixed(0))).toEqual({ type: "end_turn" });
  });
});

describe("decideTrade (troca proposta pelo humano ao bot `b`)", () => {
  /** `a` (humano) propõe a `b`. Cada um começa com $1500. */
  function offer(offerSpec: { give?: { cash?: number; props?: number[]; jailCards?: number }; take?: { cash?: number; props?: number[]; jailCards?: number } }, prep: (s: MonoState) => MonoState = (s) => s): MonoState {
    return must(proposeTrade(prep(game()), "a", { to: "b", ...offerSpec })).state;
  }
  const verdicts = (s: MonoState) => LEVELS.map((l) => decideTrade(s, "b", l)).join(",");

  it("presente é aceito por todos; sem proposta ou proposta de outro, recusa", () => {
    const gift = offer({ give: { props: [6] } }, (s) => own(s, 6, "a"));
    expect(verdicts(gift)).toBe("accept,accept,accept");
    expect(decideTrade(game(), "b", "easy")).toBe("decline");
    expect(decideTrade(gift, "c", "easy")).toBe("decline");
    expect(decideTrade(gift, "a", "easy")).toBe("decline");
  });

  it("compara o que ganha com o que entrega: fácil ≥ 1×, médio ≥ 1,1×, difícil ≥ 1,25×", () => {
    const base = (s: MonoState) => own(own(s, 6, "a"), 8, "b"); // as duas valem $100
    const swap = (cashFromA: number) => offer({ give: { props: [6], cash: cashFromA }, take: { props: [8] } }, base);
    expect(verdicts(swap(0))).toBe("accept,decline,decline"); // 100 por 100: só o fácil topa (≥ 1×)
    expect(verdicts(swap(5))).toBe("accept,decline,decline"); // 1,05×
    expect(verdicts(swap(10))).toBe("accept,accept,decline"); // 1,10×
    expect(verdicts(swap(24))).toBe("accept,accept,decline"); // 1,24×
    expect(verdicts(swap(25))).toBe("accept,accept,accept"); // 1,25×
    // troca ruim: dá mais do que recebe
    expect(verdicts(offer({ give: { cash: 50 }, take: { props: [6] } }, (s) => own(s, 6, "b")))).toBe("decline,decline,decline");
  });

  it("fechar o grupo de cor vale um bônus grande pra quem recebe", () => {
    // b já tem Vermont e Connecticut; a oferece a Oriental (fecha o azul-claro) e pede dinheiro
    const prep = (s: MonoState) => own(ownAll(s, "b", [8, 9]), 6, "a");
    const ask = (cash: number) => offer({ give: { props: [6] }, take: { cash } }, prep);
    // ganha 100 + bônus (200 + metade de 320 = 360) = 460
    expect(verdicts(ask(300))).toBe("accept,accept,accept"); // 460 ≥ 1,25 × 300 = 375
    expect(verdicts(ask(400))).toBe("accept,accept,decline"); // 460 ≥ 1,1 × 400 = 440; 1,25 × 400 = 500 não
    expect(verdicts(ask(450))).toBe("accept,decline,decline");
    expect(verdicts(ask(500))).toBe("decline,decline,decline");
  });

  it("entregar a peça que FECHA o grupo do adversário custa o bônus dele — e o difícil exige o dobro", () => {
    // a tem Vermont e Connecticut; b tem a Oriental; a pede a Oriental em troca de dinheiro
    const prep = (s: MonoState) => own(ownAll(s, "a", [8, 9]), 6, "b");
    const pay = (cash: number) => offer({ give: { cash }, take: { props: [6] } }, prep);
    // o que b entrega: 100 + bônus 360 = 460
    expect(verdicts(pay(300))).toBe("decline,decline,decline");
    expect(verdicts(pay(480))).toBe("accept,decline,decline"); // só o fácil: 480 ≥ 460
    expect(verdicts(pay(510))).toBe("accept,accept,decline"); // médio: 510 ≥ 506; difícil: 575 e dobro
    expect(verdicts(pay(700))).toBe("accept,accept,decline"); // difícil: 700 ≥ 575 mas < 920 (dobro de 460)
    expect(verdicts(pay(950))).toBe("accept,accept,accept");
  });

  it("desfazer o próprio grupo fechado também custa", () => {
    // b tem as duas marrons; a quer a Mediterranean ($60) por $70 — mais que o preço, menos que o grupo
    const s = offer({ give: { cash: 70 }, take: { props: [1] } }, (x) => ownAll(x, "b", BROWN));
    expect(verdicts(s)).toBe("decline,decline,decline");
  });

  it("hipotecada vale metade; carta de sair da prisão vale $50", () => {
    const mortgaged = offer({ give: { props: [6] }, take: { cash: 60 } }, (s) => own(s, 6, "a", { mortgaged: true }));
    expect(decideTrade(mortgaged, "b", "easy")).toBe("decline"); // $50 por $60
    const plain = offer({ give: { props: [6] }, take: { cash: 60 } }, (s) => own(s, 6, "a"));
    expect(decideTrade(plain, "b", "easy")).toBe("accept"); // $100 por $60
    const card = offer({ give: { jailCards: 1 }, take: { cash: 40 } }, (s) => withPlayer(s, "a", { jailCards: [{ deck: "chance", idx: 7 }] }));
    expect(verdicts(card)).toBe("accept,accept,accept"); // 50 ≥ 1,25 × 40
    const dear = offer({ give: { jailCards: 1 }, take: { cash: 48 } }, (s) => withPlayer(s, "a", { jailCards: [{ deck: "chance", idx: 7 }] }));
    expect(verdicts(dear)).toBe("accept,decline,decline"); // 50 / 48 = 1,04: só o fácil
  });

  it("proposta que deixou de valer (dinheiro gasto) é recusada, sem quebrar", () => {
    const s = offer({ give: { props: [6] }, take: { cash: 100 } }, (x) => own(x, 6, "a"));
    expect(decideTrade(withCash(s, "b", 10), "b", "easy")).toBe("decline");
  });
});

describe("chooseBotAction com troca pendente", () => {
  const pending = () => must(proposeTrade(own(game(), 6, "a"), "a", { to: "b", give: { props: [6] } })).state;

  it("o destinatário responde (aceita presente); o proponente cancela; os outros esperam", () => {
    expect(chooseBotAction(pending(), "b", "hard", fixed(0))).toEqual({ type: "accept_trade" });
    const bad = must(proposeTrade(own(game(), 6, "b"), "a", { to: "b", take: { props: [6] } })).state;
    expect(chooseBotAction(bad, "b", "hard", fixed(0))).toEqual({ type: "decline_trade" });
    expect(chooseBotAction(pending(), "a", "medium", fixed(0))).toEqual({ type: "cancel_trade" });
    expect(chooseBotAction(pending(), "c", "medium", fixed(0))).toEqual({ type: "end_turn" });
  });
});

describe("nunca produz uma ação ilegal", () => {
  it("em 200 estados sorteados (dinheiro, casas, hipotecas, passos), toda jogada é aceita pelo motor", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      let s = game({ edition: seed % 2 ? "monopoly" : "banco", players: ["a", "b", "c"] });
      // espalha casas pelos jogadores e sorteia o dinheiro
      s.props.forEach((p, i) => {
        if (p && rng() < 0.6) s = own(s, i, ["a", "b", "c"][Math.floor(rng() * 3)], { mortgaged: rng() < 0.15 });
      });
      for (const id of ["a", "b", "c"]) s = withCash(s, id, Math.floor(rng() * 800));
      s = at(s, "a", Math.floor(rng() * 40));
      const steps = ["roll", "manage", "buy", "debt"] as const;
      const step = steps[Math.floor(rng() * steps.length)];
      s = { ...s, step };
      if (step === "debt") s = { ...s, debt: { amount: 100 + Math.floor(rng() * 900), to: "b", reason: "rent", next: "finish" } };
      for (const level of LEVELS) {
        const m = chooseBotAction(s, "a", level, rng);
        const probe = new MonoController(s, { rng: mulberry32(seed), setTimer: () => 0, clearTimer: () => {} });
        const r = probe.dispatch("a", m);
        expect(r.ok, `seed ${seed} ${level} ${step}: ${JSON.stringify(m)} → ${!r.ok && r.error}`).toBe(true);
      }
    }
  });
});
