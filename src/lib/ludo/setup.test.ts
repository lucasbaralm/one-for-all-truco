import { describe, expect, it } from "vitest";
import { LudoController } from "./controller";
import { COLORS } from "./board";
import { createLobby } from "./engine";
import { botColors, botsSetupMessages, parseBotsSetup } from "./setup";

describe("botColors", () => {
  it("a primeira cor é a oposta à do jogador, sem repetir a dele", () => {
    expect(botColors("red", 3)).toEqual(["blue", "green", "yellow"]);
    expect(botColors("green", 1)).toEqual(["yellow"]);
    for (const mine of COLORS) {
      const cs = botColors(mine, 3);
      expect(new Set([...cs, mine]).size).toBe(4);
    }
  });
});

describe("botsSetupMessages", () => {
  it("monta a partida 'eu contra N bots' numa sala nova, na cor escolhida", () => {
    for (const color of COLORS) {
      for (const bots of [1, 2, 3]) {
        const ctl = new LudoController(createLobby(), { setTimer: () => 0, clearTimer: () => {} });
        ctl.dispatch("eu", { type: "join", name: "Eu" });
        for (const m of botsSetupMessages({ bots, level: "hard", color })) {
          expect(ctl.dispatch("eu", m).ok).toBe(true);
        }
        expect(ctl.state.phase).toBe("rolling");
        expect(ctl.state.players).toHaveLength(bots + 1);
        expect(ctl.state.players.find((p) => p.id === "eu")?.color).toBe(color);
        expect(ctl.state.players.filter((p) => p.bot === "hard")).toHaveLength(bots);
      }
    }
  });
});

describe("parseBotsSetup", () => {
  it("sem ?bots não é sala contra bots", () => {
    expect(parseBotsSetup({})).toBeUndefined();
    expect(parseBotsSetup({ level: "hard", color: "blue" })).toBeUndefined();
  });

  it("valida e limita os valores", () => {
    expect(parseBotsSetup({ bots: "2", level: "hard", color: "green" })).toEqual({ bots: 2, level: "hard", color: "green" });
    expect(parseBotsSetup({ bots: "99", level: "???", color: "pink" })).toEqual({ bots: 3, level: "medium", color: "red" });
    expect(parseBotsSetup({ bots: "0" })).toEqual({ bots: 3, level: "medium", color: "red" });
    expect(parseBotsSetup({ bots: "abc" })?.bots).toBe(3);
  });
});
