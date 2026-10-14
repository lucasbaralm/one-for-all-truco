import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ALL_CARDS, SYMBOLS } from "@/lib/dobble/cards";
import { DobbleCard, GLYPH_FULL_SIZE } from "./DobbleCard";

// A carta é a peça central do Dobble: tem que mostrar os símbolos certos e só
// ser clicável quando o jogador pode jogar. Renderizada no servidor (sem DOM).

const render = (props: Partial<React.ComponentProps<typeof DobbleCard>> = {}) =>
  renderToStaticMarkup(<DobbleCard card={5} size="10rem" role="mine" {...props} />);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const symbolsIn = (html: string) => [...html.matchAll(/data-symbol="(\d+)"/g)].map((m) => Number(m[1]));

describe("DobbleCard", () => {
  it("toda carta do baralho mostra exatamente os 8 símbolos dela, com o emoji de cada um", () => {
    for (let card = 0; card < ALL_CARDS.length; card++) {
      const html = render({ card });
      expect(symbolsIn(html).sort((a, b) => a - b), `carta ${card}`).toEqual([...ALL_CARDS[card]].sort((a, b) => a - b));
      for (const symbol of ALL_CARDS[card]) expect(html).toContain(SYMBOLS[symbol]);
    }
  });

  it("identifica o papel da carta (minha / centro / miniatura) e o id", () => {
    expect(render({ role: "mine" })).toContain('data-card="mine"');
    expect(render({ role: "center", card: 12 })).toContain('data-card="center"');
    expect(render({ role: "mini", card: 12 })).toContain('data-card-id="12"');
  });

  it("com onSymbol, os 8 símbolos são botões acessíveis; sem onSymbol ou desabilitada, nenhum é botão", () => {
    const interactive = render({ onSymbol: () => {} });
    expect(count(interactive, /<button/g)).toBe(8);
    expect(count(interactive, /aria-label="Símbolo /g)).toBe(8);

    expect(count(render(), /<button/g)).toBe(0);
    const disabled = render({ onSymbol: () => {}, disabled: true });
    expect(count(disabled, /<button/g)).toBe(0);
    expect(symbolsIn(disabled)).toHaveLength(8); // continuam visíveis, só não clicam
  });

  it("virada pra baixo (null) não revela nenhum símbolo", () => {
    const html = render({ card: null, onSymbol: () => {} });
    expect(symbolsIn(html)).toEqual([]);
    expect(count(html, /<button/g)).toBe(0);
    for (const emoji of SYMBOLS) expect(html).not.toContain(emoji);
    expect(html).toContain("?");
  });

  it("destaca o símbolo achado e marca o símbolo errado, cada um só quando pedido", () => {
    const [first, second] = ALL_CARDS[5];
    expect(render()).not.toContain("ring-yellow-400");
    expect(render({ highlight: first })).toContain("ring-yellow-400");
    expect(count(render({ highlight: first }), /ring-yellow-400/g)).toBe(1);
    expect(render()).not.toContain("ring-red-500");
    expect(render({ wrong: second })).toContain("ring-red-500");
    // símbolo que não está na carta não destaca nada
    expect(render({ highlight: 9999 })).not.toContain("ring-yellow-400");
  });

  // Desempenho: cada font-size diferente obriga o navegador a montar uma fonte nova e refazer o layout
  // do texto. Com 8 emojis de tamanhos sorteados por carta, isso virava travadinhas de 40–80ms por rodada.
  it("todos os símbolos de uma carta usam o MESMO font-size (o tamanho variado vem de scale)", () => {
    for (let card = 0; card < ALL_CARDS.length; card++) {
      const html = render({ card });
      const sizes = new Set([...html.matchAll(/font-size:([^;"]+)/g)].map((m) => m[1]));
      expect(sizes.size, `carta ${card}`).toBe(1);
    }
    // e é o mesmo entre cartas diferentes (o navegador reaproveita a fonte de uma carta pra outra)
    const a = [...render({ card: 3 }).matchAll(/font-size:([^;"]+)/g)][0][1];
    const b = [...render({ card: 40 }).matchAll(/font-size:([^;"]+)/g)][0][1];
    expect(a).toBe(b);
  });

  it("o tamanho de cada símbolo varia por scale() e nunca amplia (ampliar embaçaria o emoji)", () => {
    const scales: number[] = [];
    for (let card = 0; card < ALL_CARDS.length; card++) {
      for (const m of render({ card }).matchAll(/scale\(([\d.]+)\)/g)) scales.push(Number(m[1]));
    }
    expect(scales).toHaveLength(ALL_CARDS.length * 8);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1);
    expect(Math.max(...scales) / Math.min(...scales)).toBeGreaterThan(1.3); // continua variando de verdade
    expect(GLYPH_FULL_SIZE).toBeGreaterThan(0);
  });

  it("usa o tamanho pedido (as cartas do jogo usam variáveis CSS do layout)", () => {
    expect(render({ size: "var(--c)" })).toContain("width:var(--c)");
    expect(render({ size: "2.6rem" })).toContain("width:2.6rem");
  });
});
