import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedEntry } from "@/lib/feed";
import { FeedHistoryButton, FeedList } from "./EventFeed";

const entries = (n: number): FeedEntry[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, text: `evento ${i + 1}`, tone: i % 2 ? "good" : "info", color: i === 0 ? "#ef4444" : undefined }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("FeedList", () => {
  it("mostra só as últimas entradas, na ordem (a mais nova por último)", () => {
    const html = renderToStaticMarkup(<FeedList entries={entries(12)} visible={4} />);
    expect(count(html, /evento \d+/g)).toBe(4);
    expect(html).not.toContain("evento 8<");
    expect(html.indexOf("evento 9")).toBeLessThan(html.indexOf("evento 12"));
  });

  it("sem entradas não desenha nem o título", () => {
    const html = renderToStaticMarkup(<FeedList entries={[]} />);
    expect(html).not.toContain("Histórico");
    expect(html).not.toContain("evento");
  });

  it("não captura cliques (fica por cima de áreas livres da tela) e usa a cor do jogador na borda", () => {
    const html = renderToStaticMarkup(<FeedList entries={entries(2)} />);
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("border-left:3px solid #ef4444");
  });

  it("tom colore o texto", () => {
    const html = renderToStaticMarkup(<FeedList entries={[{ id: 1, text: "ruim", tone: "bad" }, { id: 2, text: "ótimo", tone: "good" }, { id: 3, text: "raro", tone: "special" }]} />);
    expect(html).toContain("text-red-300");
    expect(html).toContain("text-emerald-300");
    expect(html).toContain("text-yellow-300");
  });
});

describe("FeedHistoryButton", () => {
  it("fechado: só o botão, com o pontinho de novidade quando há entradas", () => {
    const html = renderToStaticMarkup(<FeedHistoryButton entries={entries(3)} />);
    expect(html).toContain('aria-label="Histórico da partida"');
    expect(html).toContain("bg-yellow-400"); // pontinho
    expect(html).not.toContain("evento");
  });

  it("sem entradas não tem pontinho", () => {
    expect(renderToStaticMarkup(<FeedHistoryButton entries={[]} />)).not.toContain("bg-yellow-400");
  });
});
