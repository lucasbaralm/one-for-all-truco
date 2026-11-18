import { describe, expect, it } from "vitest";
import {
  MonoState,
  actionsFor,
  build,
  closeIfNoHumans,
  declareBankruptcy,
  endTurn,
  forfeit,
  mortgage,
  netWorth,
  payDebt,
  roll,
  sellBuilding,
} from "./engine";
import { at, faces, game, must, own, ownAll, rollBy, withCash, withPlayer } from "./testKit";

const me = (s: MonoState, id: string) => s.players.find((p) => p.id === id)!;

/** `a` (com `cash`) cai na Oriental Avenue (6) de `b`, que tem `houses` casas lá. */
function owes(cash: number, houses: number, prep: (s: MonoState) => MonoState = (s) => s): MonoState {
  let s = prep(own(game(), 6, "b", { houses }));
  s = withCash(s, "a", cash);
  return must(rollBy(s, "a", 6)).state;
}

describe("dívida", () => {
  it("sem dinheiro pro aluguel: a vez espera, e a dívida diz quanto, a quem e por quê", () => {
    const s = owes(100, 5); // hotel: $550
    expect(s.step).toBe("debt");
    expect(s.debt).toEqual({ amount: 550, to: "b", reason: "rent", sq: 6, per: undefined, next: "finish" });
    expect(me(s, "a").cash).toBe(100);
    expect(me(s, "b").cash).toBe(1500);
    expect(s.events).toContainEqual({ t: "debt", p: "a", amount: 550, to: "b" });
  });

  it("enquanto deve, só levanta dinheiro, paga ou quebra: nada de rolar, construir, encerrar", () => {
    const s = owes(100, 5);
    expect(roll(s, "a", faces(1, 2))).toEqual({ ok: false, error: "wrong_step" });
    expect(endTurn(s, "a")).toEqual({ ok: false, error: "wrong_step" });
    expect(build(s, "a", 1)).toEqual({ ok: false, error: "wrong_step" });
    expect(payDebt(s, "b")).toEqual({ ok: false, error: "not_your_turn" });
    expect(declareBankruptcy(s, "b")).toEqual({ ok: false, error: "not_your_turn" });
    expect(actionsFor(s, "a")).toMatchObject({ roll: false, endTurn: false, payDebt: false, bankrupt: true, build: [], unmortgage: [], propose: false });
  });

  it("hipoteca e venda de casas levantam o dinheiro; aí paga e a vez segue", () => {
    let s = owes(70, 2, (x) => ownAll(x, "a", [1, 3], { houses: 1 })); // aluguel $90
    expect(s.step).toBe("debt");
    expect(actionsFor(s, "a").sell).toEqual([1, 3]);
    expect(actionsFor(s, "a").mortgage).toEqual([]); // grupo com casas
    s = must(sellBuilding(s, "a", 1)).state; // +25 = 95
    expect(actionsFor(s, "a").payDebt).toBe(true);
    s = must(payDebt(s, "a")).state;
    expect(me(s, "a").cash).toBe(5);
    expect(me(s, "b").cash).toBe(1590);
    expect(s.step).toBe("manage");
    expect(s.debt).toBeNull();
    expect(s.stats.a.rentOut).toBe(90);
    expect(s.events).toContainEqual({ t: "rent", p: "a", to: "b", sq: 6, amount: 90, dice: undefined });
  });

  it("pagar a dívida de uma rodada em dupla ainda dá a jogada de novo", () => {
    let s = withCash(own(own(game(), 8, "b", { houses: 3 }), 1, "a"), "a", 50);
    s = must(roll(s, "a", faces(4, 4))).state; // dupla caindo em Vermont (aluguel $270)
    expect(s.step).toBe("debt");
    s = withCash(s, "a", 300);
    s = must(payDebt(s, "a")).state;
    expect(s.step).toBe("roll");
  });

  it("não paga sem ter o dinheiro", () => {
    expect(payDebt(owes(100, 5), "a")).toEqual({ ok: false, error: "not_enough_cash" });
    expect(payDebt(game(), "a")).toEqual({ ok: false, error: "wrong_step" });
  });
});

describe("falência", () => {
  const rich = (s: MonoState) => {
    let x = ownAll(s, "a", [1, 3], { houses: 1 });
    x = own(x, 5, "a", { mortgaged: true });
    return withPlayer(x, "a", { jailCards: [{ deck: "chance", idx: 7 }] });
  };

  it("pro credor: dinheiro, propriedades (hipoteca mantida), cartas — casas vendem pro banco por metade", () => {
    const s0 = owes(100, 5, rich);
    const s = must(declareBankruptcy(s0, "a")).state;
    const a = me(s, "a");
    expect(a).toMatchObject({ bankrupt: true, cash: 0, jailCards: [] });
    // b ganha: $100 + 2 casas × $25
    expect(me(s, "b").cash).toBe(1500 + 100 + 50);
    expect(s.props[1]).toEqual({ owner: "b", houses: 0, mortgaged: false });
    expect(s.props[3]).toEqual({ owner: "b", houses: 0, mortgaged: false });
    expect(s.props[5]).toEqual({ owner: "b", houses: 0, mortgaged: true });
    expect(me(s, "b").jailCards).toEqual([{ deck: "chance", idx: 7 }]);
    expect(s.events).toContainEqual({ t: "bankrupt", p: "a", to: "b" });
    expect(s.eliminated).toEqual(["a"]);
    // a vez passa pra próxima pessoa; o jogo continua com 2
    expect(s.phase).toBe("playing");
    expect(s.turn).toBe(1);
    expect(s.step).toBe("roll");
    expect(s.debt).toBeNull();
  });

  it("pro banco (imposto): tudo volta livre e sem hipoteca; cartas de prisão voltam pro baralho", () => {
    let s0 = withCash(at(rich(game()), "a", 1), "a", 100);
    s0 = must(rollBy(s0, "a", 3)).state; // imposto de renda $200
    expect(s0.debt).toMatchObject({ to: "bank", reason: "tax" });
    const s = must(declareBankruptcy(s0, "a")).state;
    for (const i of [1, 3, 5]) expect(s.props[i]).toEqual({ owner: null, houses: 0, mortgaged: false });
    expect(s.decks.chance).toContain(7);
    expect(me(s, "b").cash).toBe(1500);
  });

  it("dívida 'a cada jogador' que quebra vai pro banco, não pros outros", () => {
    let s = withCash(game(), "a", 20);
    s = { ...s, step: "debt", debt: { amount: 100, to: "each", reason: "card", per: 50, next: "finish" } };
    s = must(declareBankruptcy(s, "a")).state;
    expect(me(s, "b").cash).toBe(1500);
    expect(me(s, "c").cash).toBe(1500);
  });

  it("com dois jogadores, quem sobra ganha na hora", () => {
    const s0 = owes(100, 5, (x) => ({ ...x, players: x.players.filter((p) => p.id !== "c") }));
    const s = must(declareBankruptcy(s0, "a")).state;
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("b");
    expect(s.standings!.map((x) => x.playerId)).toEqual(["b", "a"]);
    expect(s.standings![1].bankrupt).toBe(true);
    expect(s.standings![0].netWorth).toBeGreaterThan(1500);
    expect(s.events.at(-1)).toEqual({ t: "end", mode: "last" });
    expect(actionsFor(s, "b").roll).toBe(false);
    expect(roll(s, "b", faces(1, 2))).toEqual({ ok: false, error: "not_playing" });
  });

  it("a classificação final segue a ordem inversa de saída: o último a quebrar fica em 2º", () => {
    let s = game();
    s = must(forfeit(s, "a")).state;
    s = must(forfeit(s, "b")).state;
    expect(s.phase).toBe("game_over");
    expect(s.winnerId).toBe("c");
    expect(s.standings!.map((x) => x.playerId)).toEqual(["c", "b", "a"]);
  });

  it("quebrar não sobra pro falido: patrimônio zero", () => {
    const s = must(declareBankruptcy(owes(100, 5), "a")).state;
    expect(netWorth(s, "a")).toBe(0);
  });
});

describe("desistir / ser removido", () => {
  it("quem desiste na própria vez passa a vez; o que tinha vai pro banco", () => {
    let s = own(game(), 6, "a");
    s = must(forfeit(s, "a")).state;
    expect(me(s, "a").bankrupt).toBe(true);
    expect(s.props[6]!.owner).toBeNull();
    expect(s.turn).toBe(1);
    expect(s.step).toBe("roll");
    expect(s.round).toBe(1);
  });

  it("quem desiste fora da vez não mexe na vez de ninguém; troca dele cai", () => {
    let s = must(forfeit(game(), "c")).state;
    expect(s.turn).toBe(0);
    expect(s.phase).toBe("playing");
    // o último na ordem desiste na vez dele: volta pro primeiro e a rodada sobe
    s = must(forfeit({ ...s, turn: 1 }, "b")).state;
    expect(s.phase).toBe("game_over");
  });

  it("desistir da vez do último jogador volta pro primeiro e conta uma rodada nova", () => {
    const s = must(forfeit({ ...game({ players: ["a", "b", "c", "d"] }), turn: 3 }, "d")).state;
    expect(s.turn).toBe(0);
    expect(s.round).toBe(2);
  });

  it("não vale no lobby, nem pra quem já saiu ou não existe", () => {
    expect(forfeit(game(), "zzz")).toEqual({ ok: false, error: "not_in_game" });
    const out = must(forfeit(game({ players: ["a", "b", "c", "d"] }), "d")).state;
    expect(forfeit(out, "d")).toEqual({ ok: false, error: "not_in_game" });
    expect(forfeit({ ...game(), phase: "lobby" }, "a")).toEqual({ ok: false, error: "not_playing" });
    expect(actionsFor(out, "d").resign).toBe(false);
    expect(actionsFor(out, "a").resign).toBe(true);
  });

  it("desistir durante a dívida ou a compra também funciona", () => {
    const s = must(forfeit(owes(100, 5), "a")).state;
    expect(s.debt).toBeNull();
    expect(s.turn).toBe(1);
    const buying = must(forfeit(must(rollBy(game(), "a", 6)).state, "a")).state;
    expect(buying.step).toBe("roll");
  });
});

describe("duração da partida (limite de rodadas)", () => {
  const endAll = (s: MonoState) => {
    let cur = s;
    for (const id of ["a", "b", "c"]) cur = must(endTurn({ ...cur, step: "manage" }, id)).state;
    return cur;
  };

  it("acabou a última rodada: vence quem tem o maior patrimônio", () => {
    let s = withCash(game({ limit: 1 }), "b", 2000);
    s = own(s, 39, "c"); // Boardwalk ($400) pra c: 1900 < 2000
    const done = endAll(s);
    expect(done.phase).toBe("game_over");
    expect(done.winnerId).toBe("b");
    expect(done.standings!.map((x) => x.playerId)).toEqual(["b", "c", "a"]);
    expect(done.standings!.map((x) => x.netWorth)).toEqual([2000, 1900, 1500]);
    expect(done.events.at(-1)).toEqual({ t: "end", mode: "limit" });
  });

  it("antes disso o jogo continua; com limite 0 nunca acaba por rodada", () => {
    expect(endAll(game({ limit: 2 })).phase).toBe("playing");
    expect(endAll(endAll(endAll(game()))).phase).toBe("playing");
    expect(endAll(game({ limit: 2 })).round).toBe(2);
    expect(endAll(endAll(game({ limit: 2 }))).phase).toBe("game_over");
  });

  it("empate de patrimônio desempata por dinheiro; falidos ficam depois dos vivos", () => {
    let s = game({ limit: 1, players: ["a", "b", "c", "d"] });
    s = own(withCash(s, "a", 1000), 39, "a"); // 1000 + 400
    s = withCash(withCash(s, "b", 1400), "c", 900);
    s = must(forfeit(s, "d")).state;
    for (const id of ["a", "b", "c"]) s = must(endTurn({ ...s, step: "manage" }, id)).state;
    expect(s.phase).toBe("game_over");
    expect(s.standings!.map((x) => x.playerId)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("patrimônio", () => {
  it("dinheiro + propriedades + casas; hipotecada vale metade; falido, zero", () => {
    let s = game();
    expect(netWorth(s, "a")).toBe(1500);
    s = own(s, 1, "a", { houses: 2 }); // 60 + 2×50
    s = own(s, 5, "a", { mortgaged: true }); // 100
    expect(netWorth(s, "a")).toBe(1500 + 160 + 100);
    expect(netWorth(withPlayer(s, "a", { bankrupt: true }), "a")).toBe(0);
    expect(netWorth(s, "zzz")).toBe(0);
  });

  it("hipotecar não muda o patrimônio (o dinheiro entra, o valor da casa cai)", () => {
    const s = own(game(), 6, "a");
    expect(netWorth(must(mortgage(s, "a", 6)).state, "a")).toBe(netWorth(s, "a") - 50 + 50);
  });
});

describe("só sobraram bots", () => {
  const withBot = (s: MonoState) => ({ ...s, players: s.players.map((p) => (p.id === "c" ? { ...p, bot: "hard" as const } : p)) });

  it("quando o último humano vivo sai, a partida acaba na hora por patrimônio", () => {
    let s = withBot(game({ players: ["a", "b", "c", "d"] }));
    s = { ...s, players: s.players.map((p) => (p.id === "d" ? { ...p, bot: "easy" as const } : p)) };
    s = own(withCash(s, "d", 2000), 39, "d");
    expect(closeIfNoHumans(s)).toBeNull();
    s = must(forfeit(s, "a")).state;
    expect(closeIfNoHumans(s)).toBeNull(); // b ainda é humano
    s = must(forfeit(s, "b")).state;
    const closed = closeIfNoHumans(s)!;
    expect(closed.phase).toBe("game_over");
    expect(closed.winnerId).toBe("d"); // o mais rico dos bots
    expect(closed.standings!.map((x) => x.playerId)).toEqual(["d", "c", "b", "a"]);
    expect(closed.events.at(-1)).toEqual({ t: "end", mode: "humans" });
    expect(closed.eventSeq).toBe(s.eventSeq + 1);
  });

  it("não mexe em partida acabada, em lobby, nem quando restam dois humanos vivos", () => {
    expect(closeIfNoHumans(game())).toBeNull();
    expect(closeIfNoHumans({ ...game(), phase: "lobby" })).toBeNull();
    expect(closeIfNoHumans({ ...game(), phase: "game_over" })).toBeNull();
  });
});
