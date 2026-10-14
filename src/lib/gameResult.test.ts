import { describe, expect, it } from "vitest";
import { rankOf, resultHeadline } from "./gameResult";

const order = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Carol" },
];

describe("rankOf", () => {
  it("1 = primeiro da classificação; null pra quem não jogou", () => {
    expect(rankOf(order, "a")).toBe(1);
    expect(rankOf(order, "c")).toBe(3);
    expect(rankOf(order, "zed")).toBeNull();
    expect(rankOf(order, null)).toBeNull();
  });
});

describe("resultHeadline", () => {
  it("quem ganhou vê 'Você venceu!'", () => {
    expect(resultHeadline(order, "a", "a")).toEqual({ tone: "win", kicker: "Parabéns!", title: "Você venceu!" });
  });

  it("quem perdeu vê o próprio lugar e quem ganhou", () => {
    expect(resultHeadline(order, "a", "c")).toEqual({
      tone: "lose",
      kicker: "Fim de jogo",
      title: "Você ficou em 3º lugar",
      subtitle: "Alice venceu",
    });
  });

  it("quem só assistia vê o nome do vencedor", () => {
    expect(resultHeadline(order, "b", "zed")).toEqual({ tone: "spectator", kicker: "Fim de jogo", title: "Bob venceu" });
    expect(resultHeadline(order, "b", null).tone).toBe("spectator");
  });

  it("sem vencedor conhecido não inventa nome", () => {
    expect(resultHeadline(order, null, "zed").title).toBe("Fim de jogo");
    expect(resultHeadline(order, null, "b").subtitle).toBeUndefined();
  });
});
