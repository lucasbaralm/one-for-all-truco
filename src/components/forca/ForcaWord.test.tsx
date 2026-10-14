import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ForcaKeyboard } from "./ForcaKeyboard";
import { ForcaWord } from "./ForcaWord";

const word = (pattern: (string | null)[], tried: string[], status: "playing" | "won" | "lost" | null = "playing") =>
  renderToStaticMarkup(<ForcaWord pattern={pattern} tried={new Set(tried)} status={status} />);
const slots = (html: string) => [...html.matchAll(/data-slot="([^"]*)" data-revealed="(true|false)" data-end="(true|false)"/g)].map((m) => ({ ch: m[1], revealed: m[2] === "true", end: m[3] === "true" }));

describe("ForcaWord", () => {
  it("uma casinha por letra: as reveladas mostram a letra (com acento), as escondidas ficam vazias", () => {
    const html = word(["A", null, null, "Ã", null], ["A"]);
    expect(slots(html).map((s) => s.ch)).toEqual(["A", "", "", "Ã", ""]);
    expect(slots(html).map((s) => s.revealed)).toEqual([true, false, false, true, false]);
    expect(html).toContain("--n:5");
    expect(html).toContain("Palavra com 5 letras");
  });

  it("durante a rodada nada é marcado como 'revelada no fim'", () => {
    expect(slots(word(["G", null], ["G"])).every((s) => !s.end)).toBe(true);
  });

  it("rodada acabou: a letra que ninguém chutou aparece marcada — vermelha se a forca fechou, verde se foi chute da palavra", () => {
    const lost = word([..."GATO"], ["G", "A"], "lost");
    expect(slots(lost).map((s) => s.end)).toEqual([false, false, true, true]);
    expect(lost).toContain("text-red-400");
    const won = word([..."GATO"], ["G", "A"], "won");
    expect(slots(won).map((s) => s.end)).toEqual([false, false, true, true]);
    expect(won).toContain("text-emerald-300");
    expect(won).not.toContain("text-red-400");
  });

  it("comparação sem acento: Ã conta como chutada quando A foi chutado", () => {
    const html = word([..."AVIÃO"], ["A", "V", "I", "O"], "lost");
    expect(slots(html).every((s) => !s.end)).toBe(true);
  });
});

describe("ForcaKeyboard", () => {
  const kb = (guesses: { letter: string; by: string; hits: number }[], enabled: boolean) =>
    renderToStaticMarkup(<ForcaKeyboard guesses={guesses} colorOf={(id) => (id === "a" ? "#f00" : "#00f")} enabled={enabled} onPick={() => {}} />);
  const keys = (html: string) => [...html.matchAll(/data-forca-key="([A-Z])" data-state="(free|hit|miss)"/g)].map((m) => [m[1], m[2]] as const);

  it("tem as 26 letras em 3 fileiras QWERTY", () => {
    const html = kb([], true);
    expect(keys(html)).toHaveLength(26);
    expect(new Set(keys(html).map(([l]) => l)).size).toBe(26);
    expect(keys(html).slice(0, 10).map(([l]) => l).join("")).toBe("QWERTYUIOP");
    expect(html.match(/forca-keyrow/g)).toHaveLength(3);
  });

  it("letra chutada fica verde (acertou) ou vermelha (errou), na cor de quem chutou, e não dá mais pra clicar", () => {
    const html = kb([{ letter: "E", by: "a", hits: 2 }, { letter: "Z", by: "b", hits: 0 }], true);
    const state = Object.fromEntries(keys(html));
    expect(state.E).toBe("hit");
    expect(state.Z).toBe("miss");
    expect(state.A).toBe("free");
    expect(html).toMatch(/data-forca-key="E"[^>]*border-bottom-color:#f00/);
    expect(html).toMatch(/data-forca-key="Z"[^>]*border-bottom-color:#00f/);
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*data-forca-key="E"/);
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*data-forca-key="A"/);
  });

  it("fora da minha vez todas as teclas ficam desabilitadas", () => {
    const html = kb([], false);
    expect(html.match(/\sdisabled=""/g)).toHaveLength(26);
  });
});
