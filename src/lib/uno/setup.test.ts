import { describe, expect, it } from "vitest";
import { MAX_BOTS, botsSetupMessages, parseBotsSetup } from "./setup";
import { MAX_PLAYERS } from "./engine";

describe("parseBotsSetup", () => {
  it("sem ?bots não é uma sala contra bots", () => {
    expect(parseBotsSetup({})).toBeUndefined();
    expect(parseBotsSetup({ level: "hard" })).toBeUndefined();
  });

  it("lê quantidade e nível, com padrões e limites seguros", () => {
    expect(parseBotsSetup({ bots: "3", level: "hard" })).toEqual({ bots: 3, level: "hard" });
    expect(parseBotsSetup({ bots: "2", level: "easy" })).toEqual({ bots: 2, level: "easy" });
    expect(parseBotsSetup({ bots: "2" })).toEqual({ bots: 2, level: "medium" });
    expect(parseBotsSetup({ bots: "2", level: "banana" })?.level).toBe("medium");
    expect(parseBotsSetup({ bots: "abc" })?.bots).toBe(3);
    expect(parseBotsSetup({ bots: "0" })?.bots).toBe(3); // 0 não é número útil → padrão
    expect(parseBotsSetup({ bots: "99" })?.bots).toBe(MAX_BOTS);
    expect(parseBotsSetup({ bots: "-4" })?.bots).toBe(1);
    expect(MAX_BOTS).toBe(MAX_PLAYERS - 1);
  });
});

describe("botsSetupMessages", () => {
  it("N bots do nível pedido e depois começar", () => {
    expect(botsSetupMessages({ bots: 2, level: "hard" })).toEqual([
      { type: "add_bot", level: "hard" },
      { type: "add_bot", level: "hard" },
      { type: "start" },
    ]);
  });
});
