import { describe, expect, it } from "vitest";
import { manualClock, mulberry32 } from "@/lib/testing/clock";
import { MonoController, nextAutoAction, settleMs } from "./controller";
import type { EditionId } from "./editions";
import {
  BotLevel,
  MonoEvent,
  MonoState,
  Result,
  acceptTrade,
  build,
  buyProperty,
  cancelTrade,
  createLobby,
  declareBankruptcy,
  declineProperty,
  declineTrade,
  endTurn,
  forfeit,
  mortgage,
  passBid,
  payBail,
  payDebt,
  placeBid,
  proposeTrade,
  roll,
  sellBuilding,
  spendJailCard,
  unmortgage,
} from "./engine";
import type { MonoClientMessage } from "./protocol";
import { TIMING } from "./timing";
import { at, game, must, own, ownAll, rollBy, withCash, withPlayer } from "./testKit";

function setup(seed = 1, edition: EditionId = "monopoly", speed?: number) {
  const clock = manualClock();
  const changes: MonoState[] = [];
  const kicked: string[] = [];
  const ctl = new MonoController(createLobby(edition), {
    rng: mulberry32(seed),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onChange: (s) => changes.push(s),
    onKick: (id) => kicked.push(id),
    speed,
  });
  return { ctl, clock, changes, kicked };
}

/** Sala com Ana (host) + `bots` bots, partida iniciada. */
function started(bots: number, level: BotLevel = "hard", seed = 1, limit = 0, edition: EditionId = "monopoly") {
  const kit = setup(seed, edition);
  kit.ctl.dispatch("ana", { type: "join", name: "Ana" });
  for (let i = 0; i < bots; i++) kit.ctl.dispatch("ana", { type: "add_bot", level });
  if (limit) kit.ctl.dispatch("ana", { type: "set_limit", limit });
  kit.ctl.dispatch("ana", { type: "start" });
  return kit;
}

/** Põe um estado montado no controlador e liga o relógio, como numa sala que acordou. */
function put(ctl: MonoController, state: MonoState): MonoController {
  ctl.state = state;
  ctl.resume();
  return ctl;
}

const asBot = (s: MonoState, id: string, level: BotLevel = "hard") => withPlayer(s, id, { bot: level });
const away = (s: MonoState, id: string) => withPlayer(s, id, { connected: false });
const withHost = (s: MonoState): MonoState => ({ ...s, hostId: "a" });

describe("permissões do lobby", () => {
  it("só o host mexe nos bots, no limite, expulsa e começa; começar precisa de 2", () => {
    const { ctl, kicked } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bob", { type: "join", name: "Bob" });
    expect(ctl.dispatch("bob", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "start" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "set_limit", limit: 20 })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "set_bot_level", botId: "bot:1", level: "easy" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "remove_bot", botId: "bot:1" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("bob", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_host" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ana" })).toEqual({ ok: false, error: "not_in_room" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "ninguem" })).toEqual({ ok: false, error: "not_in_room" });
    ctl.dispatch("ana", { type: "kick", playerId: "bob" });
    expect(kicked).toEqual(["bob"]);
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana"]);
    expect(ctl.dispatch("ana", { type: "start" })).toEqual({ ok: false, error: "not_enough_players" });
  });

  it("host adiciona/remove bot, muda o nível e a duração; nível e duração inválidos são recusados", () => {
    const { ctl } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    expect(ctl.state.players[1].bot).toBe("easy");
    ctl.dispatch("ana", { type: "set_bot_level", botId: "bot:1", level: "hard" });
    expect(ctl.state.players[1].bot).toBe("hard");
    expect(ctl.dispatch("ana", { type: "add_bot", level: "godlike" as never })).toEqual({ ok: false, error: "bad_level" });
    expect(ctl.dispatch("ana", { type: "set_bot_level", botId: "bot:1", level: "godlike" as never })).toEqual({ ok: false, error: "bad_level" });
    expect(ctl.dispatch("ana", { type: "set_bot_level", botId: "ana", level: "easy" })).toEqual({ ok: false, error: "not_a_bot" });
    expect(ctl.state.players[1].bot).toBe("hard");
    ctl.dispatch("ana", { type: "set_limit", limit: 40 });
    expect(ctl.state.settings.limit).toBe(40);
    expect(ctl.dispatch("ana", { type: "set_limit", limit: 7 })).toEqual({ ok: false, error: "bad_limit" });
    ctl.dispatch("ana", { type: "remove_bot", botId: "bot:1" });
    expect(ctl.state.players).toHaveLength(1);
    expect(ctl.dispatch("ana", { type: "remove_bot", botId: "ana" })).toEqual({ ok: false, error: "not_a_bot" });
  });

  it("depois que a partida começa, o lobby não muda: bot, limite e novo jogador são recusados", () => {
    const { ctl } = started(2, "easy");
    expect(ctl.state.phase).toBe("playing");
    expect(ctl.dispatch("ana", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "not_in_lobby" });
    expect(ctl.dispatch("ana", { type: "remove_bot", botId: "bot:1" })).toEqual({ ok: false, error: "not_in_lobby" });
    expect(ctl.dispatch("ana", { type: "set_limit", limit: 20 })).toEqual({ ok: false, error: "not_in_lobby" });
    expect(ctl.dispatch("ana", { type: "start" })).toEqual({ ok: false, error: "not_in_lobby" });
    expect(ctl.dispatch("zed", { type: "join", name: "Zed" })).toEqual({ ok: false, error: "game_in_progress" });
  });

  it("a sala enche em 6 jogadores", () => {
    const { ctl } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    for (let i = 0; i < 5; i++) ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    expect(ctl.dispatch("ana", { type: "add_bot", level: "easy" })).toEqual({ ok: false, error: "room_full" });
    expect(ctl.dispatch("zed", { type: "join", name: "Zed" })).toEqual({ ok: false, error: "room_full" });
  });
});

describe("toda mensagem do protocolo tem destino no motor", () => {
  /** Uma mensagem de cada tipo: o Record obriga a listar TODAS (o compilador reclama se o protocolo ganhar uma e o controlador não). */
  const ALL: Record<MonoClientMessage["type"], MonoClientMessage> = {
    join: { type: "join", name: "A" },
    add_bot: { type: "add_bot", level: "easy" },
    remove_bot: { type: "remove_bot", botId: "bot:1" },
    set_bot_level: { type: "set_bot_level", botId: "bot:1", level: "easy" },
    kick: { type: "kick", playerId: "b" },
    leave: { type: "leave" },
    set_limit: { type: "set_limit", limit: 20 },
    start: { type: "start" },
    roll: { type: "roll" },
    pay_bail: { type: "pay_bail" },
    use_card: { type: "use_card" },
    buy: { type: "buy" },
    decline: { type: "decline" },
    end_turn: { type: "end_turn" },
    bid: { type: "bid", amount: 10 },
    pass_bid: { type: "pass_bid" },
    build: { type: "build", sq: 1 },
    sell: { type: "sell", sq: 1 },
    mortgage: { type: "mortgage", sq: 1 },
    unmortgage: { type: "unmortgage", sq: 1 },
    propose_trade: { type: "propose_trade", to: "b" },
    accept_trade: { type: "accept_trade" },
    decline_trade: { type: "decline_trade" },
    cancel_trade: { type: "cancel_trade" },
    pay_debt: { type: "pay_debt" },
    bankrupt: { type: "bankrupt" },
    resign: { type: "resign" },
    rematch: { type: "rematch" },
    emoji: { type: "emoji", emoji: "😂" },
  };

  it("nenhuma das mensagens conhecidas cai em unknown_message; uma desconhecida cai", () => {
    for (const msg of Object.values(ALL)) {
      const ctl = new MonoController(game(), { setTimer: () => 0, clearTimer: () => {} });
      const r = ctl.dispatch("a", msg);
      expect(r, msg.type).not.toEqual({ ok: false, error: "unknown_message" });
    }
    const ctl = new MonoController(game(), { setTimer: () => 0, clearTimer: () => {} });
    expect(ctl.dispatch("a", { type: "bogus" } as never)).toEqual({ ok: false, error: "unknown_message" });
  });

  // Cada mensagem de jogo tem que dar EXATAMENTE o que a função do motor dá (mesmo estado, mesmo erro).
  interface Case {
    name: string;
    state: MonoState;
    actor: string;
    msg: MonoClientMessage;
    direct: (s: MonoState, rng: () => number) => Result;
  }
  const jailed = withPlayer(at(game(), "a", 10), "a", { jail: 0, jailCards: [{ deck: "chance", idx: 7 }] });
  const buying = must(rollBy(game(), "a", 6)).state;
  const auction = must(declineProperty(buying, "a")).state;
  const brown = ownAll(game(), "a", [1, 3]);
  const pending = must(proposeTrade(own(game(), 6, "a"), "a", { to: "b", give: { props: [6] }, take: { cash: 10 } })).state;
  const owing: MonoState = { ...withCash(own(game(), 6, "b"), "a", 3), step: "debt", debt: { amount: 50, to: "b", reason: "rent", sq: 6, next: "finish" } };
  const cases: Case[] = [
    { name: "roll", state: game(), actor: "a", msg: { type: "roll" }, direct: (s, r) => roll(s, "a", r) },
    { name: "pay_bail", state: jailed, actor: "a", msg: { type: "pay_bail" }, direct: (s) => payBail(s, "a") },
    { name: "use_card", state: jailed, actor: "a", msg: { type: "use_card" }, direct: (s) => spendJailCard(s, "a") },
    { name: "buy", state: buying, actor: "a", msg: { type: "buy" }, direct: (s) => buyProperty(s, "a") },
    { name: "decline", state: buying, actor: "a", msg: { type: "decline" }, direct: (s) => declineProperty(s, "a") },
    { name: "end_turn", state: { ...game(), step: "manage" }, actor: "a", msg: { type: "end_turn" }, direct: (s) => endTurn(s, "a") },
    { name: "bid", state: auction, actor: "b", msg: { type: "bid", amount: 40 }, direct: (s) => placeBid(s, "b", 40) },
    { name: "pass_bid", state: auction, actor: "b", msg: { type: "pass_bid" }, direct: (s) => passBid(s, "b") },
    { name: "build", state: brown, actor: "a", msg: { type: "build", sq: 1 }, direct: (s) => build(s, "a", 1) },
    { name: "sell", state: own(brown, 1, "a", { houses: 1 }), actor: "a", msg: { type: "sell", sq: 1 }, direct: (s) => sellBuilding(s, "a", 1) },
    { name: "mortgage", state: own(game(), 6, "a"), actor: "a", msg: { type: "mortgage", sq: 6 }, direct: (s) => mortgage(s, "a", 6) },
    { name: "unmortgage", state: own(game(), 6, "a", { mortgaged: true }), actor: "a", msg: { type: "unmortgage", sq: 6 }, direct: (s) => unmortgage(s, "a", 6) },
    {
      name: "propose_trade",
      state: own(game(), 6, "a"),
      actor: "a",
      msg: { type: "propose_trade", to: "b", give: { props: [6] }, take: { cash: 10 } },
      direct: (s) => proposeTrade(s, "a", { to: "b", give: { props: [6] }, take: { cash: 10 } }),
    },
    { name: "accept_trade", state: pending, actor: "b", msg: { type: "accept_trade" }, direct: (s) => acceptTrade(s, "b") },
    { name: "decline_trade", state: pending, actor: "b", msg: { type: "decline_trade" }, direct: (s) => declineTrade(s, "b") },
    { name: "cancel_trade", state: pending, actor: "a", msg: { type: "cancel_trade" }, direct: (s) => cancelTrade(s, "a") },
    { name: "pay_debt", state: { ...owing, players: owing.players.map((p) => (p.id === "a" ? { ...p, cash: 80 } : p)) }, actor: "a", msg: { type: "pay_debt" }, direct: (s, r) => payDebt(s, "a", r) },
    { name: "bankrupt", state: owing, actor: "a", msg: { type: "bankrupt" }, direct: (s) => declareBankruptcy(s, "a") },
    { name: "resign (fora da vez, no meio da partida)", state: game(), actor: "c", msg: { type: "resign" }, direct: (s) => forfeit(s, "c") },
    // recusas: o controlador devolve o erro do motor sem mexer em nada
    { name: "roll fora da vez", state: game(), actor: "b", msg: { type: "roll" }, direct: (s, r) => roll(s, "b", r) },
    { name: "buy sem estar na compra", state: game(), actor: "a", msg: { type: "buy" }, direct: (s) => buyProperty(s, "a") },
    { name: "build em casa inválida", state: brown, actor: "a", msg: { type: "build", sq: 99 }, direct: (s) => build(s, "a", 99) },
    { name: "bid sem ser a vez", state: auction, actor: "c", msg: { type: "bid", amount: 40 }, direct: (s) => placeBid(s, "c", 40) },
    { name: "accept_trade sem troca", state: game(), actor: "b", msg: { type: "accept_trade" }, direct: (s) => acceptTrade(s, "b") },
  ];

  for (const c of cases) {
    it(`${c.name}: igual ao motor`, () => {
      const ctl = new MonoController(c.state, { rng: mulberry32(7), setTimer: () => 0, clearTimer: () => {} });
      const r = ctl.dispatch(c.actor, c.msg);
      expect(r).toEqual(c.direct(c.state, mulberry32(7)));
      expect(ctl.state).toEqual(r.ok ? r.state : c.state);
    });
  }

  it("passa o rng à rolagem: mesma semente, mesmos dados", () => {
    const a = new MonoController(game(), { rng: mulberry32(11), setTimer: () => 0, clearTimer: () => {} });
    const b = new MonoController(game(), { rng: mulberry32(11), setTimer: () => 0, clearTimer: () => {} });
    expect(must(a.dispatch("a", { type: "roll" })).state.dice).toEqual(must(b.dispatch("a", { type: "roll" })).state.dice);
  });

  it("emoji é efêmero: nada muda, ninguém é avisado", () => {
    const { ctl, changes } = started(1);
    const before = changes.length;
    const state = ctl.state;
    expect(ctl.dispatch("ana", { type: "emoji", emoji: "😂" })).toEqual({ ok: true, state });
    expect(changes.length).toBe(before);
  });

  it("recusa não avisa ninguém (onChange só dispara em mudança)", () => {
    const { ctl, changes } = started(1);
    const before = changes.length;
    ctl.dispatch("zed", { type: "roll" });
    ctl.dispatch("ana", { type: "bogus" } as never);
    expect(changes.length).toBe(before);
  });
});

describe("entrar, sair, expulsar e revanche", () => {
  it("expulsar no lobby tira da sala; no meio da partida a pessoa desiste (perde tudo pro banco) e o servidor é avisado", () => {
    const { ctl, kicked } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bob", { type: "join", name: "Bob" });
    ctl.dispatch("cris", { type: "join", name: "Cris" });
    ctl.dispatch("ana", { type: "kick", playerId: "cris" });
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana", "bob"]);
    ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    ctl.dispatch("ana", { type: "start" });
    // bob compra uma casa antes de ser expulso: tudo volta ao banco
    ctl.state = own(ctl.state, 6, "bob");
    ctl.dispatch("ana", { type: "kick", playerId: "bob" });
    expect(kicked).toEqual(["cris", "bob"]);
    const bob = ctl.state.players.find((p) => p.id === "bob")!;
    expect(bob).toMatchObject({ bankrupt: true, cash: 0 });
    expect(ctl.state.props[6]!.owner).toBeNull();
    expect(ctl.state.events).toContainEqual({ t: "bankrupt", p: "bob", to: "bank" });
    expect(ctl.state.players[ctl.state.turn].bankrupt).toBe(false);
    // bot não se expulsa, e quem já faliu só tem a conexão fechada
    expect(ctl.dispatch("ana", { type: "kick", playerId: "bot:1" })).toEqual({ ok: false, error: "not_in_room" });
    expect(ctl.dispatch("ana", { type: "kick", playerId: "bob" }).ok).toBe(true);
    expect(kicked).toEqual(["cris", "bob", "bob"]);
  });

  it("expulsar o penúltimo jogador vivo encerra a partida (o outro vence)", () => {
    const { ctl } = setup();
    ctl.dispatch("ana", { type: "join", name: "Ana" });
    ctl.dispatch("bob", { type: "join", name: "Bob" });
    ctl.dispatch("ana", { type: "start" });
    ctl.dispatch("ana", { type: "kick", playerId: "bob" });
    expect(ctl.state.phase).toBe("game_over");
    expect(ctl.state.winnerId).toBe("ana");
  });

  it("sair no lobby tira da sala; na partida só marca desconectado", () => {
    const { ctl } = started(1);
    ctl.dispatch("bob", { type: "join", name: "Bob" }); // partida rolando: recusado, é espectador
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana", "bot:1"]);
    ctl.dispatch("ana", { type: "leave" });
    expect(ctl.state.players.find((p) => p.id === "ana")).toMatchObject({ connected: false, bankrupt: false });
    const lobby = setup().ctl;
    lobby.dispatch("ana", { type: "join", name: "Ana" });
    lobby.dispatch("ana", { type: "leave" });
    expect(lobby.state.players).toEqual([]);
  });

  it("quem caiu e volta (join) reassume o próprio lugar na partida", () => {
    const { ctl } = started(1);
    ctl.setConnected("ana", false);
    expect(ctl.state.players[0].connected).toBe(false);
    expect(ctl.dispatch("ana", { type: "join", name: "Ana" }).ok).toBe(true);
    expect(ctl.state.players[0].connected).toBe(true);
    // bot não "desconecta"
    ctl.setConnected("bot:1", false);
    expect(ctl.state.players[1].connected).toBe(true);
  });

  it("revanche só depois do fim, e só por quem estava na mesa", () => {
    const { ctl } = started(1);
    expect(ctl.dispatch("ana", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    ctl.state = { ...ctl.state, phase: "game_over" };
    expect(ctl.dispatch("zed", { type: "rematch" })).toEqual({ ok: false, error: "not_game_over" });
    expect(must(ctl.dispatch("ana", { type: "rematch" })).state.phase).toBe("lobby");
    expect(ctl.state.players.map((p) => p.id)).toEqual(["ana", "bot:1"]);
  });

  it("sala encerrada e vazia: quem chega depois recomeça no lobby; com humano ainda lá, não", () => {
    const { ctl } = started(1);
    ctl.state = { ...ctl.state, phase: "game_over" };
    expect(ctl.dispatch("zed", { type: "join", name: "Zed" }).ok).toBe(false); // Ana segue conectada
    ctl.setConnected("ana", false);
    expect(ctl.dispatch("zed", { type: "join", name: "Zed" }).ok).toBe(true);
    expect(ctl.state.phase).toBe("lobby");
    expect(ctl.state.players.map((p) => p.id)).toEqual(["bot:1", "zed"]);
  });
});

describe("começar a partida", () => {
  it("o primeiro bot só age depois da abertura (INTRO_MS) e do tempo de olhar os dados (BOT_ROLL_MS)", () => {
    // procura uma semente em que o bot saia na frente
    for (let seed = 1; seed <= 40; seed++) {
      const { ctl, clock } = started(1, "hard", seed);
      if (ctl.state.players[ctl.state.turn].id !== "bot:1") continue;
      const seq = ctl.state.eventSeq;
      clock.advance(TIMING.INTRO_MS + TIMING.BOT_ROLL_MS - 1);
      expect(ctl.state.eventSeq).toBe(seq);
      clock.advance(2);
      expect(ctl.state.eventSeq).toBeGreaterThan(seq);
      expect(ctl.state.events[0].t).toBe("roll");
      return;
    }
    throw new Error("nenhuma semente deixou o bot começar");
  });

  it("começa com o dinheiro da edição e o host é o único a começar", () => {
    const { ctl } = started(2, "easy", 1, 0, "banco");
    expect(ctl.state.edition).toBe("banco");
    expect(ctl.state.players.every((p) => p.cash === 2500)).toBe(true);
    expect(ctl.state.gameNumber).toBe(1);
  });
});

describe("bots", () => {
  it("o bot joga sozinho depois do tempo de 'pensar' (rolar leva BOT_ROLL_MS)", () => {
    const { ctl, clock } = setup(5);
    put(ctl, asBot(withHost(game({ players: ["a", "b"] })), "b"));
    ctl.state = { ...ctl.state, turn: 1 };
    ctl.resume();
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.BOT_ROLL_MS - 1);
    expect(ctl.state.eventSeq).toBe(seq); // ainda olhando o tabuleiro
    clock.advance(2);
    expect(ctl.state.eventSeq).toBe(seq + 1);
    expect(ctl.state.events[0]).toMatchObject({ t: "roll", p: "b" });
  });

  it("o humano da vez espera: nada acontece sem ele, por mais que passe tempo", () => {
    const { ctl, clock } = setup(5);
    put(ctl, withHost(game()));
    const seq = ctl.state.eventSeq;
    clock.advance(10 * 60_000);
    expect(ctl.state.eventSeq).toBe(seq);
    expect(clock.pending()).toBe(0);
  });

  it("o próximo bot só age depois da animação da jogada anterior (dados + peça + carta)", () => {
    const { ctl, clock } = setup(3);
    // a (humano) rola 6 casas e chama c... aqui b é bot e rola logo depois do encerramento de a
    put(ctl, asBot(withHost({ ...game({ players: ["a", "b"] }), step: "manage" }), "b"));
    ctl.dispatch("a", { type: "end_turn" });
    expect(ctl.state.turn).toBe(1);
    clock.advance(TIMING.BOT_ROLL_MS + 1);
    const rolled = ctl.state;
    expect(rolled.events.some((e) => e.t === "roll")).toBe(true);
    const settle = settleMs(rolled.events);
    expect(settle).toBeGreaterThanOrEqual(TIMING.DICE_MS);
    const seq = rolled.eventSeq;
    clock.advance(settle + TIMING.BOT_THINK_MIN_MS - 2);
    expect(ctl.state.eventSeq).toBe(seq); // ainda vendo a peça andar e o que caiu
    clock.advance(TIMING.BOT_THINK_MAX_MS + 10);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
  });

  it("partidas só de bots (e um humano ausente) vão até o fim com o relógio manual — toda ação é aceita, nas duas edições", () => {
    for (const edition of ["monopoly", "banco"] as const) {
      for (const seed of [1, 2, 3]) {
        const { ctl, clock } = started(3, seed % 2 ? "medium" : "hard", seed, 20, edition);
        ctl.setConnected("ana", false); // ninguém humano: o servidor joga por todos
        expect(clock.runAll(100_000), `${edition} ${seed}`).toBe(true);
        expect(ctl.state.phase).toBe("game_over");
        expect(ctl.state.standings![0].playerId).toBe(ctl.state.winnerId);
        expect(clock.pending()).toBe(0); // acabou: nada mais agendado
      }
    }
  });

  it("pausa: nada acontece; despausar retoma do zero", () => {
    const { ctl, clock } = started(2, "hard", 3);
    ctl.setConnected("ana", false);
    ctl.setPaused(true);
    const seq = ctl.state.eventSeq;
    clock.advance(10 * 60_000);
    expect(ctl.state.eventSeq).toBe(seq);
    expect(clock.pending()).toBe(0);
    ctl.setPaused(false);
    clock.advance(30_000);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
    // pausar de novo corta o que estava agendado
    ctl.setPaused(true);
    expect(clock.pending()).toBe(0);
  });

  it("dispose cancela tudo que estava agendado", () => {
    const { ctl, clock } = started(2, "hard", 3);
    ctl.setConnected("ana", false);
    expect(clock.pending()).toBe(1);
    ctl.dispose();
    expect(clock.pending()).toBe(0);
  });

  it("speed divide as esperas (só pra teste ponta a ponta)", () => {
    const fast = setup(5, "monopoly", 10);
    put(fast.ctl, asBot(withHost({ ...game({ players: ["a", "b"] }), turn: 1 }), "b"));
    const seq = fast.ctl.state.eventSeq;
    fast.clock.advance(TIMING.BOT_ROLL_MS / 10 + 1);
    expect(fast.ctl.state.eventSeq).toBeGreaterThan(seq);
    // sem speed, a mesma espera não basta
    const slow = setup(5);
    put(slow.ctl, asBot(withHost({ ...game({ players: ["a", "b"] }), turn: 1 }), "b"));
    slow.clock.advance(TIMING.BOT_ROLL_MS / 10 + 1);
    expect(slow.ctl.state.eventSeq).toBe(seq);
    // speed inválido vira 1
    expect(setup(1, "monopoly", 0).ctl).toBeDefined();
  });
});

describe("humano desconectado", () => {
  it("só depois de DISCONNECTED_MS um bot médio joga por ele", () => {
    const { ctl, clock } = setup(4);
    put(ctl, withHost(game({ players: ["a", "b"] })));
    ctl.setConnected("a", false);
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.DISCONNECTED_MS - 100);
    expect(ctl.state.eventSeq).toBe(seq);
    clock.advance(200);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
    expect(ctl.state.events[0]).toMatchObject({ t: "roll", p: "a" });
  });

  it("voltar antes do prazo cancela a jogada automática", () => {
    const { ctl, clock } = setup(4);
    put(ctl, withHost(game({ players: ["a", "b"] })));
    ctl.setConnected("a", false);
    clock.advance(TIMING.DISCONNECTED_MS - 500);
    ctl.setConnected("a", true);
    const seq = ctl.state.eventSeq;
    clock.advance(60_000);
    expect(ctl.state.eventSeq).toBe(seq);
  });
});

describe("leilão automático", () => {
  /** a (humano) recusa a Oriental; o leilão começa em b. */
  const auctionState = (prep: (s: MonoState) => MonoState) => prep(must(declineProperty(must(rollBy(withHost(game()), "a", 6)).state, "a")).state);

  it("o bot dá lance (ou passa) depois de pensar; o humano conectado espera", () => {
    const { ctl, clock } = setup(2);
    put(ctl, auctionState((s) => asBot(s, "b")));
    expect(ctl.state.auction!.bidder).toBe("b");
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.BOT_THINK_MIN_MS - 1);
    expect(ctl.state.eventSeq).toBe(seq);
    clock.advance(TIMING.BOT_THINK_MAX_MS);
    expect(ctl.state.eventSeq).toBeGreaterThan(seq);
    expect(ctl.state.events[0]).toMatchObject({ t: "bid", p: "b" });
    // a vez de dar lance agora é do c (humano, conectado): nada acontece sozinho
    expect(ctl.state.auction!.bidder).toBe("c");
    const after = ctl.state.eventSeq;
    clock.advance(10 * 60_000);
    expect(ctl.state.eventSeq).toBe(after);
  });

  it("humano desconectado passa o lance depois de DISCONNECTED_MS", () => {
    const { ctl, clock } = setup(2);
    put(ctl, auctionState((s) => away(s, "b")));
    const seq = ctl.state.eventSeq;
    clock.advance(TIMING.DISCONNECTED_MS - 1);
    expect(ctl.state.eventSeq).toBe(seq);
    clock.advance(2);
    expect(ctl.state.events).toEqual([{ t: "auction_pass", p: "b" }]);
  });

  it("um leilão só de bots acaba sozinho", () => {
    const { ctl, clock } = setup(6);
    put(ctl, auctionState((s) => asBot(asBot(asBot(s, "a"), "b"), "c")));
    clock.advance(120_000);
    expect(ctl.state.auction).toBeNull();
    expect(ctl.state.step).not.toBe("auction");
  });
});

describe("troca automática", () => {
  const offerTo = (to: string, give: { props?: number[]; cash?: number }, take: { props?: number[]; cash?: number } = {}) =>
    must(proposeTrade(own(withHost(game()), 6, "a"), "a", { to, give, take })).state;

  it("o bot destinatário aceita um presente e recusa um mau negócio, depois de pensar", () => {
    const gift = setup(1);
    put(gift.ctl, asBot(offerTo("b", { props: [6] }), "b"));
    gift.clock.advance(TIMING.BOT_THINK_MIN_MS - 1);
    expect(gift.ctl.state.trade).not.toBeNull();
    gift.clock.advance(TIMING.BOT_THINK_MAX_MS);
    expect(gift.ctl.state.trade).toBeNull();
    expect(gift.ctl.state.props[6]!.owner).toBe("b");
    expect(gift.ctl.state.events).toEqual([{ t: "trade_done", from: "a", to: "b" }]);

    const bad = setup(1);
    put(bad.ctl, asBot(offerTo("b", { props: [6] }, { cash: 1000 }), "b"));
    bad.clock.advance(TIMING.BOT_THINK_MAX_MS + 1);
    expect(bad.ctl.state.trade).toBeNull();
    expect(bad.ctl.state.props[6]!.owner).toBe("a");
    expect(bad.ctl.state.events).toEqual([{ t: "trade_no", from: "a", to: "b", cancelled: false }]);
  });

  it("humano destinatário conectado: espera a resposta, por mais que demore", () => {
    const { ctl, clock } = setup(1);
    put(ctl, offerTo("b", { props: [6] }));
    clock.advance(10 * 60_000);
    expect(ctl.state.trade).not.toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it("destinatário humano desconectado recusa depois de DISCONNECTED_MS", () => {
    const { ctl, clock } = setup(1);
    put(ctl, away(offerTo("b", { props: [6] }), "b"));
    clock.advance(TIMING.DISCONNECTED_MS - 1);
    expect(ctl.state.trade).not.toBeNull();
    clock.advance(2);
    expect(ctl.state.trade).toBeNull();
    expect(ctl.state.events).toEqual([{ t: "trade_no", from: "a", to: "b", cancelled: false }]);
  });

  it("proponente humano desconectado: a proposta é cancelada depois de DISCONNECTED_MS (a vez dele não fica travada)", () => {
    const { ctl, clock } = setup(1);
    put(ctl, away(offerTo("b", { props: [6] }), "a"));
    clock.advance(TIMING.DISCONNECTED_MS + 1);
    expect(ctl.state.trade).toBeNull();
    expect(ctl.state.events).toEqual([{ t: "trade_no", from: "a", to: "b", cancelled: true }]);
    // e aí o bot médio joga a vez de a
    clock.advance(TIMING.DISCONNECTED_MS + 1);
    expect(ctl.state.events[0]).toMatchObject({ t: "roll", p: "a" });
  });
});

describe("nextAutoAction", () => {
  it("sem partida, ou com humanos conectados na vez, não há ação automática", () => {
    expect(nextAutoAction(createLobby("monopoly"), mulberry32(1))).toBeNull();
    expect(nextAutoAction(game(), mulberry32(1))).toBeNull();
    expect(nextAutoAction({ ...game(), phase: "game_over" }, mulberry32(1))).toBeNull();
  });

  it("bot na vez: a jogada dele, com o tempo certo (rolar = BOT_ROLL_MS; o resto, o tempo de pensar)", () => {
    const s = asBot(game(), "a");
    const roll = nextAutoAction(s, mulberry32(1))!;
    expect(roll).toEqual({ delayMs: TIMING.BOT_ROLL_MS, actorId: "a", message: { type: "roll" } });
    const buying = asBot(must(rollBy(game(), "a", 6)).state, "a");
    const act = nextAutoAction(buying, mulberry32(1))!;
    expect(act.actorId).toBe("a");
    expect(["buy", "decline"]).toContain(act.message.type);
    expect(act.delayMs).toBeGreaterThanOrEqual(TIMING.BOT_THINK_MIN_MS);
    expect(act.delayMs).toBeLessThanOrEqual(TIMING.BOT_THINK_MAX_MS);
  });

  it("humano desconectado na vez: jogada de bot médio com atraso fixo", () => {
    const a = nextAutoAction(away(game(), "a"), mulberry32(1))!;
    expect(a).toEqual({ delayMs: TIMING.DISCONNECTED_MS, actorId: "a", message: { type: "roll" } });
    const buying = away(must(rollBy(withCash(game(), "a", 100), "a", 6)).state, "a");
    // médio: $100 não deixa reserva de $150 → recusa
    expect(nextAutoAction(buying, mulberry32(1))).toEqual({ delayMs: TIMING.DISCONNECTED_MS, actorId: "a", message: { type: "decline" } });
  });

  it("no leilão quem age é quem dá lance, não quem está na vez; troca pendente tem prioridade sobre a vez", () => {
    const au = must(declineProperty(must(rollBy(game(), "a", 6)).state, "a")).state;
    expect(nextAutoAction(au, mulberry32(1))).toBeNull(); // b é humano conectado
    expect(nextAutoAction(asBot(au, "b"), mulberry32(1))!.actorId).toBe("b");
    expect(nextAutoAction(asBot(au, "a"), mulberry32(1))).toBeNull(); // o bot da vez (a) não pode agir no leilão dos outros
    const tr = must(proposeTrade(own(game(), 6, "a"), "a", { to: "b", give: { props: [6] } })).state;
    expect(nextAutoAction(asBot(tr, "a"), mulberry32(1))).toBeNull(); // a (bot, da vez) espera a resposta de b
    expect(nextAutoAction(asBot(tr, "b"), mulberry32(1))).toMatchObject({ actorId: "b", message: { type: "accept_trade" } });
  });
});

describe("settleMs", () => {
  const mv = (from: number, to: number): MonoEvent => ({ t: "move", p: "a", from, to });

  it("dados, peça andando pra frente (até 12 casas), saltos e cartas", () => {
    expect(settleMs([])).toBe(0);
    expect(settleMs([{ t: "roll", p: "a", d: [3, 4] }])).toBe(TIMING.DICE_MS);
    expect(settleMs([mv(0, 7)])).toBe(TIMING.STEP_MS * 7);
    expect(settleMs([mv(0, 12)])).toBe(TIMING.STEP_MS * 12);
    expect(settleMs([mv(38, 5)])).toBe(TIMING.STEP_MS * 7); // dá a volta no tabuleiro
    // mais de 12 casas, ou pra trás (carta, prisão): conta como 3 passos
    expect(settleMs([mv(0, 13)])).toBe(TIMING.STEP_MS * 3);
    expect(settleMs([mv(30, 10)])).toBe(TIMING.STEP_MS * 3);
    expect(settleMs([mv(10, 7)])).toBe(TIMING.STEP_MS * 3);
    expect(settleMs([{ t: "card", p: "a", deck: "chance", card: 0 }])).toBe(TIMING.CARD_MS);
  });

  it("o resto das ações não espera nada, e as esperas se somam", () => {
    const quiet: MonoEvent[] = [
      { t: "buy", p: "a", sq: 6, price: 100 },
      { t: "rent", p: "a", to: "b", sq: 6, amount: 6 },
      { t: "go", p: "a", amount: 200 },
      { t: "turn", p: "b" },
      { t: "bid", p: "a", amount: 10 },
    ];
    expect(settleMs(quiet)).toBe(0);
    expect(settleMs([{ t: "roll", p: "a", d: [1, 2] }, mv(0, 3), { t: "card", p: "a", deck: "chest", card: 0 }, mv(3, 0)])).toBe(TIMING.DICE_MS + TIMING.STEP_MS * 3 + TIMING.CARD_MS + TIMING.STEP_MS * 3);
  });
});

describe("sala contra bots: acaba quando o humano sai do jogo", () => {
  it("quando a única pessoa desiste, os bots que sobraram não jogam pra sempre: fim por patrimônio", () => {
    const { ctl, changes } = started(2, "medium", 7);
    expect(ctl.state.phase).toBe("playing");
    const r = ctl.dispatch("ana", { type: "resign" });
    expect(r.ok).toBe(true);
    expect(ctl.state.phase).toBe("game_over");
    expect(ctl.state.standings).toHaveLength(3);
    expect(ctl.state.events.at(-1)).toEqual({ t: "end", mode: "humans" });
    // o último estado notificado é o encerrado (uma mensagem só, sem estado intermediário "vivo" sem humanos)
    expect(changes.at(-1)?.phase).toBe("game_over");
    // e nada fica agendado: os bots param
    const seq = ctl.state.eventSeq;
    expect(nextAutoAction(ctl.state)).toBeNull();
    expect(ctl.state.eventSeq).toBe(seq);
  });

  it("com outro humano vivo a partida continua", () => {
    const kit = setup(3);
    kit.ctl.dispatch("ana", { type: "join", name: "Ana" });
    kit.ctl.dispatch("bia", { type: "join", name: "Bia" });
    kit.ctl.dispatch("ana", { type: "add_bot", level: "easy" });
    kit.ctl.dispatch("ana", { type: "start" });
    kit.ctl.dispatch("ana", { type: "resign" });
    expect(kit.ctl.state.phase).toBe("playing");
    kit.ctl.dispatch("bia", { type: "resign" });
    expect(kit.ctl.state.phase).toBe("game_over"); // sobrou só o bot
  });
});
