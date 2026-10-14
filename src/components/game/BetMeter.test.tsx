import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BetMeter, betBalance } from "./BetMeter";

describe("betBalance", () => {
  it("sobra, falta ou fecha — com singular/plural", () => {
    expect(betBalance(2, 5)).toEqual({ label: "3 vazas sem dono ainda", tone: "free" });
    expect(betBalance(4, 5)).toEqual({ label: "1 vaza sem dono ainda", tone: "free" });
    expect(betBalance(6, 5)).toEqual({ label: "pediram 1 vaza a mais", tone: "over" });
    expect(betBalance(8, 5)).toEqual({ label: "pediram 3 vazas a mais", tone: "over" });
    expect(betBalance(5, 5)).toEqual({ label: "soma exata", tone: "exact" });
  });
});

describe("BetMeter", () => {
  it("mostra a soma, quantas vazas existem e quem ainda falta apostar", () => {
    const html = renderToStaticMarkup(<BetMeter sum={3} cards={5} pending={2} />);
    expect(html).toContain("Apostas: 3 de 5");
    expect(html).toContain("faltam 2 apostar");
    expect(html).toContain("2 vazas sem dono ainda");
    expect(html).toContain("width:60%");
  });

  it("ninguém falta apostar: não fala em 'faltam'; a barra nunca passa de 100%", () => {
    const html = renderToStaticMarkup(<BetMeter sum={9} cards={5} pending={0} />);
    expect(html).not.toContain("faltam");
    expect(html).toContain("width:100%");
    expect(html).toContain("pediram 4 vazas a mais");
  });
});
