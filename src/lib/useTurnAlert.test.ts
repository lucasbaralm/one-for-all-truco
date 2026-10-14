import { describe, expect, it } from "vitest";
import { alertTitle } from "./useTurnAlert";

describe("alertTitle", () => {
  it("alterna entre o aviso e o título normal", () => {
    expect(alertTitle("Fodinha", "Sua vez!", true)).toBe("🔔 Sua vez! — Fodinha");
    expect(alertTitle("Fodinha", "Sua vez!", false)).toBe("Fodinha");
  });
});
