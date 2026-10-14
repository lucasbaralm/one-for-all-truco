import { describe, expect, it } from "vitest";
import { DEFAULT_ROUNDS, MAX_PLAYERS } from "./engine";
import { MAX_BOTS, botsSetupMessages, parseBotsSetup } from "./setup";

describe("parseBotsSetup", () => {
  it("sem ?bots= não é uma sala contra bots", () => {
    expect(parseBotsSetup({})).toBeUndefined();
    expect(parseBotsSetup({ level: "hard" })).toBeUndefined();
  });

  it("lê bots, nível e palavras; valores estranhos viram o padrão", () => {
    expect(parseBotsSetup({ bots: "2", level: "hard", rounds: "8" })).toEqual({ bots: 2, level: "hard", rounds: 8 });
    expect(parseBotsSetup({ bots: "3" })).toEqual({ bots: 3, level: "medium", rounds: DEFAULT_ROUNDS });
    expect(parseBotsSetup({ bots: "abc", level: "ultra", rounds: "4" })).toEqual({ bots: 3, level: "medium", rounds: DEFAULT_ROUNDS });
  });

  it("limita os bots a uma mesa cheia (e pelo menos 1)", () => {
    expect(MAX_BOTS).toBe(MAX_PLAYERS - 1);
    expect(parseBotsSetup({ bots: "99" })!.bots).toBe(MAX_BOTS);
    expect(parseBotsSetup({ bots: "0" })!.bots).toBe(3);
    expect(parseBotsSetup({ bots: "-4" })!.bots).toBe(1);
  });
});

describe("botsSetupMessages", () => {
  it("palavras, N bots e começar — nessa ordem", () => {
    expect(botsSetupMessages({ bots: 2, level: "easy", rounds: 3 })).toEqual([
      { type: "set_rounds", rounds: 3 },
      { type: "add_bot", level: "easy" },
      { type: "add_bot", level: "easy" },
      { type: "start" },
    ]);
  });
});
