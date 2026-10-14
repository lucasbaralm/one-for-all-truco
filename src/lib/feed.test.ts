import { describe, expect, it } from "vitest";
import { FEED_MAX, appendEntries } from "./feed";

describe("appendEntries", () => {
  it("acrescenta no fim, na ordem, cada uma com um id novo", () => {
    const a = appendEntries([], [{ text: "um", tone: "info" }, { text: "dois", tone: "good" }]);
    expect(a.map((e) => e.text)).toEqual(["um", "dois"]);
    const b = appendEntries(a, [{ text: "três", tone: "bad", color: "#f00" }]);
    expect(b.map((e) => e.text)).toEqual(["um", "dois", "três"]);
    expect(new Set(b.map((e) => e.id)).size).toBe(3);
    expect(b[2]).toMatchObject({ tone: "bad", color: "#f00" });
  });

  it("sem nada pra acrescentar devolve a MESMA lista (não redesenha à toa)", () => {
    const a = appendEntries([], [{ text: "um", tone: "info" }]);
    expect(appendEntries(a, [])).toBe(a);
  });

  it("guarda só as mais recentes", () => {
    let list = appendEntries([], []);
    for (let i = 0; i < FEED_MAX + 15; i++) list = appendEntries(list, [{ text: `e${i}`, tone: "info" }]);
    expect(list).toHaveLength(FEED_MAX);
    expect(list[0].text).toBe("e15");
    expect(list[list.length - 1].text).toBe(`e${FEED_MAX + 14}`);
    expect(appendEntries([], [{ text: "a", tone: "info" }, { text: "b", tone: "info" }, { text: "c", tone: "info" }], 2).map((e) => e.text)).toEqual(["b", "c"]);
  });
});
