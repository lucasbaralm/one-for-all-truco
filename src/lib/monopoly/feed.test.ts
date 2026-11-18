import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { describeMonoEvents, diffMono } from "./feed";
import {
  MonoEvent,
  MonoState,
  acceptTrade,
  build,
  declineProperty,
  declineTrade,
  forfeit,
  mortgage,
  passBid,
  placeBid,
  proposeTrade,
  roll,
  startGame,
  toView,
  unmortgage,
} from "./engine";
import { game, lobby, must, own, ownAll, rollBy, withCash } from "./testKit";

const ctx = { me: "a" };
const viewOf = (s: MonoState, who = "a") => toView(s, who);
const texts = (items: { text: string }[]) => items.map((i) => i.text);
/** As linhas de uma lista de eventos, vistas por `me` (jogo "monopoly" ou "banco", 3 jogadores A, B, C). */
const say = (events: MonoEvent[], me = "a", edition: "monopoly" | "banco" = "monopoly", limit = 0) => {
  const s = game({ edition, limit });
  return describeMonoEvents(viewOf(s, me), events, { me });
};

describe("describeMonoEvents — dados e movimento", () => {
  it("dados (com 'dupla!'), andar e passar pela saída", () => {
    expect(texts(say([{ t: "roll", p: "a", d: [3, 4] }]))).toEqual(["🎲 Você rolou 3 e 4"]);
    expect(texts(say([{ t: "roll", p: "b", d: [3, 4] }]))).toEqual(["🎲 B rolou 3 e 4"]);
    const dbl = say([{ t: "roll", p: "a", d: [4, 4] }]);
    expect(dbl[0]).toMatchObject({ text: "🎲 Você rolou 4 e 4 — dupla!", tone: "special" });
    expect(texts(say([{ t: "move", p: "a", from: 0, to: 6 }]))).toEqual(["🚶 Você andou até Oriental Avenue"]);
    // mais de 12 casas (ou pra trás) é salto: "foi para"
    expect(texts(say([{ t: "move", p: "b", from: 0, to: 13 }]))).toEqual(["🚶 B foi para States Avenue"]);
    expect(texts(say([{ t: "move", p: "a", from: 10, to: 7 }]))).toEqual(["🚶 Você foi para Sorte"]);
    // casa de carta usa o nome do baralho; cada edição, o seu vocabulário
    expect(texts(say([{ t: "go", p: "a", amount: 200 }]))).toEqual(["💰 Você recebeu $200 de salário ao passar por Saída"]);
    expect(texts(say([{ t: "go", p: "b", amount: 200 }], "a", "banco"))).toEqual(["💰 B recebeu R$ 200 de salário ao passar por Ponto de Partida"]);
  });

  it("ir pra prisão: a linha da prisão substitui a do movimento (só do mesmo jogador)", () => {
    const jail: MonoEvent[] = [{ t: "move", p: "a", from: 30, to: 10 }, { t: "jail", p: "a", why: "square" }];
    expect(texts(say(jail))).toEqual(["🚔 Você foi para a Prisão"]);
    const other: MonoEvent[] = [{ t: "move", p: "b", from: 30, to: 10 }, { t: "jail", p: "a", why: "square" }];
    expect(texts(say(other))).toEqual(["🚶 B foi para Prisão", "🚔 Você foi para a Prisão"]);
  });
});

describe("describeMonoEvents — dinheiro", () => {
  it("compra, aluguel (quem paga e quem recebe), imposto, bônus, cartas de dinheiro e reparos", () => {
    expect(say([{ t: "buy", p: "a", sq: 6, price: 100 }])[0]).toMatchObject({ text: "🏠 Você comprou Oriental Avenue por $100", tone: "good" });
    expect(say([{ t: "buy", p: "b", sq: 6, price: 100 }], "a")[0]).toMatchObject({ text: "🏠 B comprou Oriental Avenue por $100", tone: "info" });

    const pays = say([{ t: "rent", p: "a", to: "b", sq: 6, amount: 6 }]);
    expect(pays[0]).toMatchObject({ text: "💸 Você pagou $6 de aluguel a B em Oriental Avenue", tone: "bad" });
    const gets = say([{ t: "rent", p: "b", to: "a", sq: 6, amount: 6 }]);
    expect(gets[0]).toMatchObject({ text: "💸 B pagou $6 de aluguel a você em Oriental Avenue", tone: "good" });
    expect(say([{ t: "rent", p: "b", to: "c", sq: 12, amount: 28, dice: 7 }])[0]).toMatchObject({ text: "💸 B pagou $28 de aluguel a C em Electric Company (dados: 7)", tone: "info" });

    expect(texts(say([{ t: "tax", p: "a", sq: 4, amount: 200 }]))).toEqual(["🧾 Você pagou $200 de Imposto de Renda"]);
    expect(texts(say([{ t: "bonus", p: "a", sq: 38, amount: 100 }], "a", "banco"))).toEqual(["🎁 Você recebeu R$ 100 em Lucros ou Dividendos"]);
    expect(texts(say([{ t: "cash", p: "a", amount: 50 }, { t: "cash", p: "b", amount: -75 }]))).toEqual(["💰 Você recebeu $50", "💸 B pagou $75"]);
    expect(texts(say([{ t: "repairs", p: "a", amount: 175 }]))).toEqual(["🔧 Você pagou $175 em reparos nas construções"]);
    expect(texts(say([{ t: "each", p: "a", per: 10, total: 20 }, { t: "each", p: "b", per: -50, total: 100 }]))).toEqual([
      "🎉 Você recebeu $10 de cada jogador ($20 no total)",
      "💸 B pagou $50 a cada jogador ($100 no total)",
    ]);
  });

  it("carta tirada traz o texto da carta e o nome do baralho (Sorte ou Revés no Banco)", () => {
    expect(say([{ t: "card", p: "a", deck: "chance", card: 0 }])[0]).toMatchObject({ text: "🎴 Você tirou uma carta de Sorte: “Avance até a Saída e receba $200.”", tone: "special" });
    expect(texts(say([{ t: "card", p: "b", deck: "chest", card: 1 }]))).toEqual(["🎴 B tirou uma carta de Caixa Comunitária: “Erro do banco a seu favor: receba $200.”"]);
    expect(texts(say([{ t: "card", p: "b", deck: "chance", card: 0 }], "a", "banco"))[0]).toMatch(/^🎴 B tirou uma carta de Sorte ou Revés: “Seu time foi campeão!/);
  });
});

describe("describeMonoEvents — prisão", () => {
  it("por que foi preso e como saiu (fiança, carta, dupla, 3ª tentativa)", () => {
    expect(texts(say([{ t: "jail", p: "a", why: "card" }, { t: "jail", p: "b", why: "doubles" }]))).toEqual(["🚔 Você foi para a Prisão (carta)", "🚔 B foi para a Prisão (3 duplas seguidas)"]);
    expect(texts(say([{ t: "bail", p: "a", how: "paid" }]))).toEqual(["🔓 Você pagou $50 de fiança e saiu da Prisão"]);
    expect(texts(say([{ t: "bail", p: "a", how: "card" }]))).toEqual(["🔓 Você usou a carta “Saia livre da prisão” e saiu da Prisão"]);
    expect(texts(say([{ t: "bail", p: "a", how: "card" }], "a", "banco"))).toEqual(["🔓 Você usou a carta “Habeas Corpus” e saiu da Prisão"]);
    expect(texts(say([{ t: "bail", p: "b", how: "doubles" }]))).toEqual(["🔓 B tirou dupla e saiu da Prisão"]);
    expect(texts(say([{ t: "bail", p: "b", how: "forced" }]))).toEqual(["🔓 B não tirou dupla 3 vezes: pagou $50 de fiança e saiu"]);
    expect(say([{ t: "jail_fail", p: "a", tries: 2 }])[0]).toMatchObject({ text: "🔒 Você não tirou dupla (2ª tentativa de 3)", tone: "bad" });
  });
});

describe("describeMonoEvents — leilão", () => {
  it("abre, lances, saída e arremate (ou ninguém levou)", () => {
    expect(texts(say([{ t: "auction", sq: 6 }, { t: "bid", p: "b", amount: 120 }, { t: "auction_pass", p: "c" }]))).toEqual([
      "🔨 Leilão: Oriental Avenue",
      "💵 B deu um lance de $120",
      "🙅 C saiu do leilão",
    ]);
    expect(say([{ t: "sold", sq: 6, to: "a", amount: 130 }])[0]).toMatchObject({ text: "🔨 Você arrematou Oriental Avenue por $130", tone: "good" });
    expect(say([{ t: "sold", sq: 6, to: "b", amount: 130 }])[0]).toMatchObject({ text: "🔨 B arrematou Oriental Avenue por $130", tone: "special" });
    expect(texts(say([{ t: "sold", sq: 6, to: null, amount: 0 }]))).toEqual(["🔨 Ninguém deu lance por Oriental Avenue"]);
  });
});

describe("describeMonoEvents — construções e hipotecas", () => {
  it("casa, hotel, venda de casa/hotel, hipoteca e tirar a hipoteca", () => {
    expect(texts(say([{ t: "build", p: "a", sq: 6, level: 1, cost: 50 }, { t: "build", p: "b", sq: 6, level: 2, cost: 50 }]))).toEqual([
      "🏗️ Você construiu uma casa em Oriental Avenue (1 casa)",
      "🏗️ B construiu uma casa em Oriental Avenue (2 casas)",
    ]);
    expect(texts(say([{ t: "build", p: "a", sq: 6, level: 5, cost: 50 }]))).toEqual(["🏨 Você construiu um hotel em Oriental Avenue"]);
    expect(texts(say([{ t: "sell", p: "a", sq: 6, level: 3, amount: 25 }, { t: "sell", p: "b", sq: 6, level: 4, amount: 25 }]))).toEqual([
      "🏚️ Você vendeu uma casa de Oriental Avenue e recebeu $25",
      "🏚️ B vendeu o hotel de Oriental Avenue e recebeu $25",
    ]);
    expect(texts(say([{ t: "mortgage", p: "a", sq: 6, amount: 50 }, { t: "unmortgage", p: "b", sq: 6, cost: 55 }]))).toEqual([
      "🏦 Você hipotecou Oriental Avenue e recebeu $50",
      "🏦 B pagou $55 pra tirar a hipoteca de Oriental Avenue",
    ]);
  });
});

describe("describeMonoEvents — trocas, dívida, falência e fim", () => {
  it("proposta, troca fechada, recusa e cancelamento, na pessoa certa", () => {
    expect(say([{ t: "trade_offer", from: "a", to: "b" }])[0]).toMatchObject({ text: "🤝 Você propôs uma troca a B", tone: "info" });
    expect(say([{ t: "trade_offer", from: "b", to: "a" }])[0]).toMatchObject({ text: "🤝 B propôs uma troca a você", tone: "special" });
    expect(say([{ t: "trade_done", from: "a", to: "b" }])[0]).toMatchObject({ text: "🤝 Você e B fecharam uma troca", tone: "good" });
    expect(say([{ t: "trade_done", from: "b", to: "c" }])[0]).toMatchObject({ text: "🤝 B e C fecharam uma troca", tone: "info" });
    expect(say([{ t: "trade_no", from: "a", to: "b", cancelled: false }])[0]).toMatchObject({ text: "❌ B recusou a sua troca", tone: "bad" });
    expect(texts(say([{ t: "trade_no", from: "b", to: "c", cancelled: false }]))).toEqual(["❌ C recusou a troca de B"]);
    expect(texts(say([{ t: "trade_no", from: "a", to: "b", cancelled: true }]))).toEqual(["❌ A sua proposta de troca foi cancelada"]);
    expect(texts(say([{ t: "trade_no", from: "b", to: "a", cancelled: true }]))).toEqual(["❌ A proposta de troca de B foi cancelada"]);
  });

  it("dívida (a quem deve) e falência (pra onde vão os bens)", () => {
    expect(say([{ t: "debt", p: "a", amount: 550, to: "b" }])[0]).toMatchObject({ text: "⚠️ Você precisa pagar $550 a B e está sem dinheiro", tone: "bad" });
    expect(texts(say([{ t: "debt", p: "b", amount: 200, to: "bank" }, { t: "debt", p: "b", amount: 90, to: "each" }, { t: "debt", p: "b", amount: 30, to: "a" }]))).toEqual([
      "⚠️ B precisa pagar $200 ao banco e está sem dinheiro",
      "⚠️ B precisa pagar $90 a cada jogador e está sem dinheiro",
      "⚠️ B precisa pagar $30 a você e está sem dinheiro",
    ]);
    expect(say([{ t: "bankrupt", p: "a", to: "bank" }])[0]).toMatchObject({ text: "💀 Você faliu — os bens vão para o banco", tone: "bad" });
    expect(say([{ t: "bankrupt", p: "b", to: "a" }])[0]).toMatchObject({ text: "💀 B faliu — os bens vão para você", tone: "good" });
    expect(say([{ t: "bankrupt", p: "b", to: "c" }])[0]).toMatchObject({ text: "💀 B faliu — os bens vão para C", tone: "special" });
  });

  it("vez e fim de jogo (por rodadas ou último sobrevivente)", () => {
    expect(say([{ t: "turn", p: "a" }])[0]).toMatchObject({ text: "👉 É a sua vez", tone: "special" });
    expect(say([{ t: "turn", p: "b" }])[0]).toMatchObject({ text: "👉 Vez de B", tone: "info" });
    expect(texts(say([{ t: "end", mode: "last" }]))).toEqual(["🏁 Só sobrou um jogador — fim de jogo"]);
    expect(texts(say([{ t: "end", mode: "limit" }], "a", "monopoly", 20))).toEqual(["🏁 Acabaram as 20 rodadas — fim de jogo"]);
  });

  it("cada linha traz a cor de quem fez", () => {
    const [line] = say([{ t: "buy", p: "b", sq: 6, price: 100 }]);
    expect(line.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(say([{ t: "auction", sq: 6 }])[0].color).toBeUndefined();
  });
});

describe("com o motor de verdade", () => {
  it("rolar e comprar, pagar aluguel, construir e hipotecar viram as linhas esperadas", () => {
    let s = must(rollBy(game(), "a", 6)).state;
    expect(texts(describeMonoEvents(viewOf(s), s.events, ctx))).toEqual(["🎲 Você rolou 2 e 4", "🚶 Você andou até Oriental Avenue"]);
    expect(texts(describeMonoEvents(viewOf(s, "b"), s.events, { me: "b" }))).toEqual(["🎲 A rolou 2 e 4", "🚶 A andou até Oriental Avenue"]);

    s = must(rollBy(own(game(), 6, "b"), "a", 6)).state;
    expect(texts(describeMonoEvents(viewOf(s), s.events, ctx))).toEqual(["🎲 Você rolou 2 e 4", "🚶 Você andou até Oriental Avenue", "💸 Você pagou $6 de aluguel a B em Oriental Avenue"]);

    const b = must(build(ownAll(game(), "a", [1, 3]), "a", 1)).state;
    expect(texts(describeMonoEvents(viewOf(b), b.events, ctx))).toEqual(["🏗️ Você construiu uma casa em Mediterranean Avenue (1 casa)"]);
    const m = must(mortgage(own(game(), 6, "a"), "a", 6)).state;
    expect(texts(describeMonoEvents(viewOf(m), m.events, ctx))).toEqual(["🏦 Você hipotecou Oriental Avenue e recebeu $50"]);
    const u = must(unmortgage(own(game(), 6, "a", { mortgaged: true }), "a", 6)).state;
    expect(texts(describeMonoEvents(viewOf(u), u.events, ctx))).toEqual(["🏦 Você pagou $55 pra tirar a hipoteca de Oriental Avenue"]);
  });

  it("leilão inteiro, troca e falência", () => {
    let s = must(declineProperty(must(rollBy(game(), "a", 6)).state, "a")).state;
    expect(texts(describeMonoEvents(viewOf(s), s.events.slice(-1), ctx))).toEqual(["🔨 Leilão: Oriental Avenue"]);
    s = must(placeBid(s, "b", 50)).state;
    expect(texts(describeMonoEvents(viewOf(s), s.events, ctx))).toEqual(["💵 B deu um lance de $50"]);
    s = must(passBid(s, "c")).state;
    s = must(passBid(s, "a")).state;
    expect(texts(describeMonoEvents(viewOf(s), s.events, ctx))).toEqual(["🙅 Você saiu do leilão", "🔨 B arrematou Oriental Avenue por $50"]);

    const offered = must(proposeTrade(own(game(), 6, "a"), "a", { to: "b", give: { props: [6] } })).state;
    expect(texts(describeMonoEvents(viewOf(offered, "b"), offered.events, { me: "b" }))).toEqual(["🤝 A propôs uma troca a você"]);
    expect(texts(describeMonoEvents(viewOf(offered), must(acceptTrade(offered, "b")).state.events, ctx))).toEqual(["🤝 Você e B fecharam uma troca"]);
    expect(texts(describeMonoEvents(viewOf(offered), must(declineTrade(offered, "b")).state.events, ctx))).toEqual(["❌ B recusou a sua troca"]);

    const quit = must(forfeit(game(), "b")).state;
    expect(texts(describeMonoEvents(viewOf(quit), quit.events, ctx))).toEqual(["💀 B faliu — os bens vão para o banco"]);
    const owed = must(rollBy(withCash(own(game(), 6, "b", { houses: 5 }), "a", 10), "a", 6)).state;
    expect(texts(describeMonoEvents(viewOf(owed), owed.events, ctx)).at(-1)).toBe("⚠️ Você precisa pagar $550 a B e está sem dinheiro");
  });
});

describe("diffMono", () => {
  const started = must(startGame(lobby("monopoly", ["a", "b", "c"]), mulberry32(3))).state;
  const lobbyView = toView(lobby("monopoly", ["a", "b", "c"]), "a");

  it("lobby zera a lista", () => {
    expect(diffMono(null, lobbyView, ctx)).toEqual({ reset: true, items: [] });
    expect(diffMono(toView(started, "a"), lobbyView, ctx)).toEqual({ reset: true, items: [] });
  });

  it("partida nova (do lobby, ou primeira tela de uma partida em que ninguém rolou) anuncia quem começa — sem repetir 'Vez de'", () => {
    const first = started.players[started.turn];
    const want = first.id === "a" ? "▶️ Partida começou — você começa" : `▶️ Partida começou — ${first.name} começa`;
    const fromLobby = diffMono(lobbyView, toView(started, "a"), ctx);
    expect(fromLobby.reset).toBe(true);
    expect(texts(fromLobby.items)).toEqual([want]);
    expect(texts(diffMono(null, toView(started, "a"), ctx).items)).toEqual([want]);
    expect(diffMono(null, toView(started, "a"), ctx).reset).toBe(true);
  });

  it("primeira tela no MEIO da partida não inventa histórico", () => {
    const mid = must(roll(game(), "a", mulberry32(1))).state;
    expect(diffMono(null, toView(mid, "a"), ctx)).toEqual({ reset: true, items: [] });
  });

  it("estado novo traz os eventos novos; o mesmo estado de novo não repete", () => {
    const s = game();
    const n = must(rollBy(s, "a", 6)).state;
    const d = diffMono(toView(s, "a"), toView(n, "a"), ctx);
    expect(d.reset).toBe(false);
    expect(texts(d.items)).toEqual(["🎲 Você rolou 2 e 4", "🚶 Você andou até Oriental Avenue"]);
    expect(diffMono(toView(n, "a"), toView(n, "a"), ctx).items).toEqual([]);
  });

  it("outra partida (gameNumber novo) recomeça a lista", () => {
    const s = game();
    const again = { ...must(rollBy(s, "a", 6)).state, gameNumber: s.gameNumber + 1 };
    const d = diffMono(toView(s, "a"), toView(again, "a"), ctx);
    expect(d.reset).toBe(true);
    expect(texts(d.items)[0]).toMatch(/^▶️ Partida começou/);
  });

  it("quem cai e quem volta (humano, não eu, não falido); bot e falido nunca", () => {
    const s = game();
    const dropped = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, connected: false } : p)) };
    expect(texts(diffMono(toView(s, "a"), toView(dropped, "a"), ctx).items)).toEqual(["📡 B desconectou — um bot assume"]);
    expect(texts(diffMono(toView(dropped, "a"), toView(s, "a"), ctx).items)).toEqual(["📡 B voltou pra partida"]);
    // eu mesmo não apareço
    expect(diffMono(toView(s, "b"), toView(dropped, "b"), { me: "b" }).items).toEqual([]);
    // falido não conta
    const dead = { ...dropped, players: dropped.players.map((p) => (p.id === "b" ? { ...p, bankrupt: true } : p)) };
    expect(diffMono(toView(s, "a"), toView(dead, "a"), ctx).items).toEqual([]);
    // bot não "desconecta"
    const bot = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, bot: "easy" as const, connected: true } : p)) };
    expect(diffMono(toView(bot, "a"), toView({ ...bot, players: bot.players.map((p) => (p.id === "b" ? { ...p, connected: false } : p)) }, "a"), ctx).items).toEqual([]);
  });

  it("fim de jogo anuncia o vencedor (uma vez), e a falência do penúltimo também aparece", () => {
    const two = game({ players: ["a", "b"] });
    const over = must(forfeit(two, "b")).state;
    const d = diffMono(toView(two, "a"), toView(over, "a"), ctx);
    expect(texts(d.items)).toEqual(["💀 B faliu — os bens vão para o banco", "🏁 Só sobrou um jogador — fim de jogo", "🏆 Você venceu!"]);
    expect(texts(diffMono(toView(two, "b"), toView(over, "b"), { me: "b" }).items).at(-1)).toBe("🏆 A venceu!");
    expect(diffMono(toView(over, "a"), toView(over, "a"), ctx).items).toEqual([]);
  });
});
