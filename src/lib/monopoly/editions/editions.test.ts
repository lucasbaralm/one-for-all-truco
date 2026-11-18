import { describe, expect, it } from "vitest";
import { BANCO, EDITIONS, EDITION_IDS, GROUP_COLOR, MONOPOLY, SQUARE_COUNT, getEdition, groupSquares, isEditionId, isOwnable, mortgageValue, unmortgageCost } from "./index";
import type { Edition, Group } from "./types";

const GROUP_SIZE: Record<Group, number> = { brown: 2, sky: 3, pink: 3, orange: 3, red: 3, yellow: 3, green: 3, navy: 2 };

describe.each(EDITION_IDS.map((id) => [id, EDITIONS[id]] as const))("edição %s", (_id, ed: Edition) => {
  it("tem 40 casas com os cantos no lugar", () => {
    expect(ed.squares).toHaveLength(SQUARE_COUNT);
    expect(ed.squares[0].kind).toBe("go");
    expect(ed.squares[ed.jailIndex].kind).toBe("jail");
    expect(ed.squares[20].kind).toBe("parking");
    expect(ed.squares[ed.goToJailIndex].kind).toBe("gotojail");
    expect(ed.jailIndex).toBe(10);
    expect(ed.goToJailIndex).toBe(30);
  });

  it("22 ruas em 8 grupos do tamanho certo, cada grupo de uma cor", () => {
    const streets = ed.squares.filter((s) => s.kind === "street");
    expect(streets).toHaveLength(22);
    for (const [group, size] of Object.entries(GROUP_SIZE)) {
      expect(groupSquares(ed, group)).toHaveLength(size);
      expect(GROUP_COLOR[group as Group]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("28 propriedades (22 ruas + 6 de transporte/serviço) e preços redondos", () => {
    const ownable = ed.squares.filter(isOwnable);
    expect(ownable).toHaveLength(28);
    for (const sq of ownable) {
      expect(sq.price % 10).toBe(0);
      expect(mortgageValue(sq)).toBe(sq.price / 2);
      expect(unmortgageCost(sq)).toBeGreaterThan(mortgageValue(sq));
    }
  });

  it("aluguel só cresce com as casas e a casa custa igual dentro do grupo", () => {
    for (const sq of ed.squares) {
      if (sq.kind !== "street") continue;
      for (let i = 1; i < 6; i++) expect(sq.rent[i]).toBeGreaterThan(sq.rent[i - 1]);
      const sameGroup = groupSquares(ed, sq.group).map((i) => ed.squares[i]);
      for (const other of sameGroup) if (other.kind === "street") expect(other.houseCost).toBe(sq.houseCost);
    }
  });

  it("custo da casa por lado do tabuleiro: 50, 100, 150, 200", () => {
    const cost = (i: number) => (ed.squares[i] as { houseCost: number }).houseCost;
    for (const i of [1, 3, 6, 8, 9]) expect(cost(i)).toBe(50);
    for (const i of [11, 13, 14, 16, 18, 19]) expect(cost(i)).toBe(100);
    for (const i of [21, 23, 24, 26, 27, 29]) expect(cost(i)).toBe(150);
    for (const i of [31, 32, 34, 37, 39]) expect(cost(i)).toBe(200);
  });

  it("nomes únicos e preenchidos", () => {
    const names = ed.squares.flatMap((s) => ("name" in s ? [s.name] : []));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n.trim().length).toBeGreaterThan(1);
  });

  it("toda casa de carta aponta pra um baralho que existe e tem cartas", () => {
    for (const sq of ed.squares) {
      if (sq.kind === "card") expect(ed.decks[sq.deck].length).toBeGreaterThan(8);
    }
  });

  it("as cartas são válidas: casas existem, valores positivos, texto escrito", () => {
    for (const deck of [ed.decks.chance, ed.decks.chest]) {
      for (const card of deck) {
        expect(card.text.length).toBeGreaterThan(10);
        const fx = card.fx;
        if (fx.t === "advance") {
          expect(fx.to).toBeGreaterThanOrEqual(0);
          expect(fx.to).toBeLessThan(SQUARE_COUNT);
        }
        if (fx.t === "nearest") expect(ed.squares.some((s) => s.kind === fx.kind)).toBe(true);
        if (fx.t === "gain" || fx.t === "pay" || fx.t === "gain_each" || fx.t === "pay_each") expect(fx.amount).toBeGreaterThan(0);
        if (fx.t === "back") expect(fx.n).toBeGreaterThan(0);
      }
    }
  });

  it("cada baralho em uso tem exatamente uma carta de sair da prisão e uma de ir pra prisão", () => {
    const used = new Set(ed.squares.flatMap((s) => (s.kind === "card" ? [s.deck] : [])));
    for (const d of used) {
      expect(ed.decks[d].filter((c) => c.fx.t === "jail_free")).toHaveLength(1);
      expect(ed.decks[d].filter((c) => c.fx.t === "jail")).toHaveLength(1);
    }
  });

  it("dinheiro, salário e fiança fazem sentido", () => {
    expect(ed.startCash).toBeGreaterThanOrEqual(1500);
    expect(ed.salary).toBe(200);
    expect(ed.bail).toBe(50);
    expect(ed.tokens.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ed.tokens).size).toBe(ed.tokens.length);
  });

  it("as tabelas de aluguel de ferrovia/companhia cobrem todas as casas do tipo", () => {
    const count = (k: string) => ed.squares.filter((s) => s.kind === k).length;
    expect(ed.railroadRent).toHaveLength(count("railroad"));
    expect(ed.utilityMultiplier).toHaveLength(count("utility"));
    expect(ed.companyRent).toHaveLength(count("company"));
    for (const t of [ed.railroadRent, ed.companyRent]) for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });
});

describe("as duas edições", () => {
  it("têm as ruas nos mesmos lugares e a mesma economia (equilíbrio igual)", () => {
    MONOPOLY.squares.forEach((m, i) => {
      const b = BANCO.squares[i];
      if (m.kind === "street") {
        expect(b.kind).toBe("street");
        if (b.kind === "street") {
          expect(b.price).toBe(m.price);
          expect(b.rent).toEqual(m.rent);
          expect(b.group).toBe(m.group);
        }
      }
    });
  });

  it("mas com nomes, regras e cartas próprios", () => {
    expect(MONOPOLY.auction).toBe(true);
    expect(BANCO.auction).toBe(false);
    expect(MONOPOLY.currency).toBe("$");
    expect(BANCO.currency).toBe("R$ ");
    expect(MONOPOLY.decks.chance.length).toBe(16);
    expect(MONOPOLY.decks.chest.length).toBe(16);
    expect(BANCO.decks.chest).toHaveLength(0);
    expect(BANCO.decks.chance.length).toBeGreaterThanOrEqual(20);
    expect(BANCO.squares.filter((s) => s.kind === "company")).toHaveLength(6);
    expect(BANCO.squares.filter((s) => s.kind === "card")).toHaveLength(6);
    expect(BANCO.squares.every((s) => s.kind !== "card" || s.deck === "chance")).toBe(true);
    expect(MONOPOLY.squares.filter((s) => s.kind === "railroad")).toHaveLength(4);
    expect(MONOPOLY.squares.filter((s) => s.kind === "utility")).toHaveLength(2);
  });

  it("registro e validação de id", () => {
    expect(getEdition("banco")).toBe(BANCO);
    expect(isEditionId("monopoly")).toBe(true);
    expect(isEditionId("uno")).toBe(false);
    expect(isEditionId(undefined)).toBe(false);
  });

  it("o Banco Imobiliário tem os bairros do tabuleiro brasileiro", () => {
    const names = BANCO.squares.flatMap((s) => ("name" in s ? [s.name] : []));
    for (const n of ["Leblon", "Av. Paulista", "Ipanema", "Morumbi", "Interlagos", "Companhia Ferroviária", "Prisão", "Parada Livre", "Imposto de Renda", "Lucros ou Dividendos"]) {
      expect(names).toContain(n);
    }
  });
});
