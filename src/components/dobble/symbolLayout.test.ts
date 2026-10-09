import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "@/lib/dobble/cards";
import { layoutCard } from "./symbolLayout";

// O desenho de cada carta (posição, tamanho e giro dos 8 símbolos) é sorteado a
// partir do id da carta. Estes testes garantem o que importa pra jogar:
// os símbolos certos, o mesmo visual sempre, tudo dentro do círculo e sem
// símbolo em cima de outro (senão fica impossível achar).

const GLYPH = 0.8; // o emoji ocupa ~80% da caixa do símbolo (ver DobbleCard)

describe("layoutCard", () => {
  it("cada carta mostra exatamente os 8 símbolos dela", () => {
    for (let card = 0; card < ALL_CARDS.length; card++) {
      const spots = layoutCard(card);
      expect(spots).toHaveLength(8);
      expect([...spots.map((s) => s.symbol)].sort((a, b) => a - b)).toEqual([...ALL_CARDS[card]].sort((a, b) => a - b));
    }
  });

  it("a mesma carta sempre tem o mesmo visual; cartas diferentes, visuais diferentes", () => {
    expect(layoutCard(10)).toEqual(layoutCard(10));
    expect(JSON.stringify(layoutCard(10))).not.toBe(JSON.stringify(layoutCard(11)));
    // o símbolo em comum de duas cartas não aparece sempre no mesmo lugar nem do mesmo tamanho
    const where = (card: number, symbol: number) => layoutCard(card).find((s) => s.symbol === symbol)!;
    const shared = ALL_CARDS[0].find((s) => ALL_CARDS[1].includes(s))!;
    expect(where(0, shared)).not.toEqual(where(1, shared));
  });

  it("todos os símbolos cabem dentro do círculo da carta", () => {
    for (let card = 0; card < ALL_CARDS.length; card++) {
      for (const s of layoutCard(card)) {
        const reach = Math.hypot(s.x - 50, s.y - 50) + (s.size * GLYPH) / 2;
        expect(reach, `carta ${card}`).toBeLessThanOrEqual(48);
      }
    }
  });

  it("nenhum símbolo fica em cima de outro", () => {
    for (let card = 0; card < ALL_CARDS.length; card++) {
      const spots = layoutCard(card);
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const dist = Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y);
          const needed = ((spots[i].size + spots[j].size) * GLYPH) / 2;
          expect(dist, `carta ${card}: símbolos ${i} e ${j}`).toBeGreaterThanOrEqual(needed);
        }
      }
    }
  });

  it("os tamanhos variam (é o que torna o jogo desafiador) mas ficam legíveis", () => {
    const sizes = ALL_CARDS.flatMap((_, card) => layoutCard(card).map((s) => s.size));
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(1.3);
    expect(Math.min(...sizes)).toBeGreaterThan(15);
  });
});
