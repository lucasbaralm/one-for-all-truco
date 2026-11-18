// A economia das ruas (preço, aluguel por casa, custo da casa), por posição no tabuleiro. As duas
// edições têm as ruas nos MESMOS lugares dos 40 do tabuleiro e jogam com a mesma economia — o que
// muda entre elas são os nomes, as cartas, as companhias e as regras. Assim, o equilíbrio do jogo
// (que o Monopoly clássico já testou por décadas) é o mesmo nas duas.

import type { Group, Square } from "./types";

type Rent = [number, number, number, number, number, number];

interface StreetEconomy {
  group: Group;
  price: number;
  rent: Rent;
  houseCost: number;
}

const SKY: Rent = [6, 30, 90, 270, 400, 550];
const PINK: Rent = [10, 50, 150, 450, 625, 750];
const ORANGE: Rent = [14, 70, 200, 550, 750, 950];
const RED: Rent = [18, 90, 250, 700, 875, 1050];
const YELLOW: Rent = [22, 110, 330, 800, 975, 1150];
const GREEN: Rent = [26, 130, 390, 900, 1100, 1275];

export const STREET_ECONOMY: Record<number, StreetEconomy> = {
  1: { group: "brown", price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
  3: { group: "brown", price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
  6: { group: "sky", price: 100, rent: SKY, houseCost: 50 },
  8: { group: "sky", price: 100, rent: SKY, houseCost: 50 },
  9: { group: "sky", price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
  11: { group: "pink", price: 140, rent: PINK, houseCost: 100 },
  13: { group: "pink", price: 140, rent: PINK, houseCost: 100 },
  14: { group: "pink", price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
  16: { group: "orange", price: 180, rent: ORANGE, houseCost: 100 },
  18: { group: "orange", price: 180, rent: ORANGE, houseCost: 100 },
  19: { group: "orange", price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
  21: { group: "red", price: 220, rent: RED, houseCost: 150 },
  23: { group: "red", price: 220, rent: RED, houseCost: 150 },
  24: { group: "red", price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
  26: { group: "yellow", price: 260, rent: YELLOW, houseCost: 150 },
  27: { group: "yellow", price: 260, rent: YELLOW, houseCost: 150 },
  29: { group: "yellow", price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
  31: { group: "green", price: 300, rent: GREEN, houseCost: 200 },
  32: { group: "green", price: 300, rent: GREEN, houseCost: 200 },
  34: { group: "green", price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
  37: { group: "navy", price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
  39: { group: "navy", price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 },
};

/** A rua na posição `index` do tabuleiro com esse nome. */
export function street(index: number, name: string): Square {
  const e = STREET_ECONOMY[index];
  if (!e) throw new Error(`não há rua na casa ${index}`);
  return { kind: "street", name, group: e.group, price: e.price, rent: e.rent, houseCost: e.houseCost };
}

/** Posições das casas de ferrovia / companhia e das de carta, iguais nas duas edições. */
export const TRANSPORT_SPOTS = [5, 15, 25, 35] as const;
export const UTILITY_SPOTS = [12, 28] as const;
export const CARD_SPOTS = { chest: [2, 17, 33], chance: [7, 22, 36] } as const;
