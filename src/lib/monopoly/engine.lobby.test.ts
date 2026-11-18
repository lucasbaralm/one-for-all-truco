import { describe, expect, it } from "vitest";
import {
  BOT_PREFIX,
  LIMIT_OPTIONS,
  MAX_PLAYERS,
  addBot,
  canStart,
  createLobby,
  joinLobby,
  removePlayer,
  returnToLobby,
  setBotLevel,
  setPlayerConnected,
  setSettings,
  startGame,
  toView,
} from "./engine";
import { getEdition, isOwnable } from "./editions";
import { game, ids, lobby, lobbyWithBots, must } from "./testKit";

describe.each(["monopoly", "banco"] as const)("lobby (%s)", (edition) => {
  it("cria vazio, na edição pedida", () => {
    const s = createLobby(edition);
    expect(s.edition).toBe(edition);
    expect(s.phase).toBe("lobby");
    expect(s.players).toEqual([]);
    expect(s.hostId).toBeNull();
    expect(canStart(s)).toBe(false);
  });

  it("quem entra primeiro é o host; entrar de novo só reconecta (sem assento duplicado)", () => {
    let s = lobby(edition, ["a", "b"]);
    expect(s.hostId).toBe("a");
    s = setPlayerConnected(s, "b", false);
    expect(s.players[1].connected).toBe(false);
    s = must(joinLobby(s, { id: "b", name: "Bia", avatarUrl: "x.png" })).state;
    expect(s.players).toHaveLength(2);
    expect(s.players[1]).toMatchObject({ connected: true, name: "Bia", avatarUrl: "x.png" });
  });

  it("a sala tem no máximo 6 jogadores", () => {
    let s = lobby(edition, ids(6));
    expect(s.players).toHaveLength(MAX_PLAYERS);
    const r = joinLobby(s, { id: "g", name: "G" });
    expect(r).toEqual({ ok: false, error: "room_full" });
    expect(addBot(s, "easy")).toEqual({ ok: false, error: "room_full" });
    s = removePlayer(s, "f");
    expect(must(addBot(s, "easy")).state.players).toHaveLength(6);
  });

  it("bots: ids únicos, nível trocável, e nunca viram host", () => {
    let s = lobbyWithBots(edition, ["a"], 3);
    expect(s.players.map((p) => p.id)).toEqual(["a", `${BOT_PREFIX}1`, `${BOT_PREFIX}2`, `${BOT_PREFIX}3`]);
    s = removePlayer(s, `${BOT_PREFIX}2`);
    s = must(addBot(s, "hard")).state;
    expect(new Set(s.players.map((p) => p.id)).size).toBe(4);
    s = must(setBotLevel(s, `${BOT_PREFIX}1`, "hard")).state;
    expect(s.players[1].bot).toBe("hard");
    expect(setBotLevel(s, "a", "hard")).toEqual({ ok: false, error: "not_a_bot" });
    // se o host sai, o próximo HUMANO assume — nunca um bot
    let t = lobbyWithBots(edition, ["a", "b"], 1);
    t = removePlayer(t, "a");
    expect(t.hostId).toBe("b");
    t = removePlayer(t, "b");
    expect(t.hostId).toBeNull();
  });

  it("só começa com 2 ou mais", () => {
    expect(startGame(lobby(edition, ["a"]))).toEqual({ ok: false, error: "not_enough_players" });
    expect(canStart(lobby(edition, ["a", "b"]))).toBe(true);
  });

  it("limite de rodadas: só as opções válidas, só no lobby", () => {
    let s = lobby(edition, ["a", "b"]);
    for (const limit of LIMIT_OPTIONS) expect(setSettings(s, { limit }).ok).toBe(true);
    expect(setSettings(s, { limit: 7 })).toEqual({ ok: false, error: "bad_limit" });
    s = must(startGame(s, () => 0)).state;
    expect(setSettings(s, { limit: 20 })).toEqual({ ok: false, error: "not_in_lobby" });
  });

  it("começar: dinheiro da edição, tabuleiro de 40 casas sem dono, baralhos cheios, tudo zerado", () => {
    const ed = getEdition(edition);
    const s = must(startGame(lobby(edition, ["a", "b", "c"]), () => 0.5)).state;
    expect(s.phase).toBe("playing");
    expect(s.step).toBe("roll");
    expect(s.round).toBe(1);
    expect(s.gameNumber).toBe(1);
    expect(s.dice).toBeNull();
    expect(s.players.every((p) => p.cash === ed.startCash && p.pos === 0 && p.jail === null && p.jailCards.length === 0 && !p.bankrupt)).toBe(true);
    expect(s.props).toHaveLength(40);
    s.props.forEach((p, i) => {
      if (isOwnable(ed.squares[i])) expect(p).toEqual({ owner: null, houses: 0, mortgaged: false });
      else expect(p).toBeNull();
    });
    expect([...s.decks.chance].sort((x, y) => x - y)).toEqual(ed.decks.chance.map((_, i) => i));
    expect([...s.decks.chest].sort((x, y) => x - y)).toEqual(ed.decks.chest.map((_, i) => i));
    expect(Object.keys(s.stats).sort()).toEqual(["a", "b", "c"]);
    expect(s.events).toEqual([{ t: "turn", p: s.players[s.turn].id }]);
  });

  it("depois de começar ninguém novo entra (quem já estava só reconecta)", () => {
    const s = game({ edition });
    expect(joinLobby(s, { id: "z", name: "Z" })).toEqual({ ok: false, error: "game_in_progress" });
    expect(joinLobby(s, { id: "a", name: "A" }).ok).toBe(true);
    expect(addBot(s, "easy")).toEqual({ ok: false, error: "not_in_lobby" });
  });

  it("sair no meio da partida só marca como desconectado (um bot joga por ele)", () => {
    const s = removePlayer(game({ edition }), "b");
    expect(s.players).toHaveLength(3);
    expect(s.players.find((p) => p.id === "b")!.connected).toBe(false);
  });

  it("revanche: volta pro lobby só com bots e quem segue conectado, tudo zerado", () => {
    let s = lobbyWithBots(edition, ["a", "b", "c"], 1);
    s = must(startGame(s, () => 0)).state;
    s = setPlayerConnected(s, "c", false);
    const l = returnToLobby({ ...s, phase: "game_over" });
    expect(l.phase).toBe("lobby");
    expect(l.players.map((p) => p.id)).toEqual(["a", "b", `${BOT_PREFIX}1`]);
    expect(l.players.every((p) => p.cash === 0 && p.pos === 0 && !p.bankrupt)).toBe(true);
    expect(l.props).toEqual([]);
    expect(l.gameNumber).toBe(1);
    expect(must(startGame(l, () => 0)).state.gameNumber).toBe(2);
  });

  it("a visão que vai pros clientes não leva a ordem das cartas", () => {
    const s = game({ edition });
    const v = toView(s, "a") as unknown as Record<string, unknown>;
    expect(v.decks).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain('"decks"');
    expect(v.edition).toBe(edition);
  });
});
