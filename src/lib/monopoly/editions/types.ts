// Tipos das EDIÇÕES do jogo de compra e venda de propriedades: o motor (engine.ts) é um só e lê
// tudo que muda de uma edição pra outra (tabuleiro, cartas, dinheiro, regras) daqui. Hoje são
// duas: Monopoly (o tabuleiro clássico americano) e Banco Imobiliário (a versão brasileira).

export type EditionId = "monopoly" | "banco";

/** Grupos de cor das ruas. */
export type Group = "brown" | "sky" | "pink" | "orange" | "red" | "yellow" | "green" | "navy";

/** Cor de tela de cada grupo (faixa no tabuleiro, fichinhas). */
export const GROUP_COLOR: Record<Group, string> = {
  brown: "#8b5a3c",
  sky: "#8fd3f4",
  pink: "#e95fa8",
  orange: "#f59e32",
  red: "#e23b3b",
  yellow: "#f4d03f",
  green: "#2e9e5b",
  navy: "#2c4fa8",
};

/** O baralho de onde uma casa de carta tira: "chance" (Sorte) e "chest" (Caixa Comunitária). */
export type DeckId = "chance" | "chest";

export type RentSet = "railroad" | "utility" | "company";

export type Square =
  | { kind: "go"; name: string }
  | {
      kind: "street";
      name: string;
      group: Group;
      price: number;
      /** Aluguel: terreno vazio, 1, 2, 3, 4 casas e hotel. */
      rent: [number, number, number, number, number, number];
      houseCost: number;
    }
  | { kind: "railroad" | "utility" | "company"; name: string; price: number }
  | { kind: "card"; deck: DeckId }
  | { kind: "tax"; name: string; amount: number }
  /** Casa que PAGA o jogador que cai nela (os "Lucros ou Dividendos" do Banco Imobiliário). */
  | { kind: "bonus"; name: string; amount: number }
  | { kind: "jail"; name: string }
  | { kind: "parking"; name: string }
  | { kind: "gotojail"; name: string };

/** Casas que dão dono (rua, ferrovia, companhia). */
export type OwnableSquare = Extract<Square, { price: number }>;

export type CardEffect =
  /** Vai até a casa; se passar pela saída, recebe o salário. */
  | { t: "advance"; to: number }
  /** Vai até a casa mais próxima desse tipo (livre: pode comprar; com dono: aluguel especial). */
  | { t: "nearest"; kind: RentSet }
  | { t: "gain"; amount: number }
  | { t: "pay"; amount: number }
  /** Recebe `amount` de cada um dos outros jogadores. */
  | { t: "gain_each"; amount: number }
  /** Paga `amount` a cada um dos outros jogadores. */
  | { t: "pay_each"; amount: number }
  | { t: "back"; n: number }
  | { t: "jail" }
  | { t: "jail_free" }
  | { t: "repairs"; house: number; hotel: number };

export interface Card {
  text: string;
  fx: CardEffect;
}

export interface Edition {
  id: EditionId;
  /** Nome do jogo na tela. */
  name: string;
  /** Prefixo do valor na tela ("$" ou "R$ "). */
  currency: string;
  startCash: number;
  /** Salário de passar pela saída. */
  salary: number;
  /** Fiança da prisão. */
  bail: number;
  /** Casa que não leva a prisão: onde fica quem está preso, e a casa "Vá para a prisão". */
  jailIndex: number;
  goToJailIndex: number;
  squares: Square[];
  decks: Record<DeckId, Card[]>;
  deckNames: Record<DeckId, string>;
  /** Nome da carta de sair da prisão (aparece no histórico). */
  jailCardName: string;
  /** Aluguel pela quantidade que a pessoa tem do mesmo tipo (índice = quantidade − 1). */
  railroadRent: number[];
  /** Múltiplo do dado (índice = quantidade − 1). */
  utilityMultiplier: number[];
  companyRent: number[];
  /** Recusou a compra → leilão entre todos? Senão, a casa só fica livre. */
  auction: boolean;
  /** Fichas (um emoji por lugar na mesa). */
  tokens: string[];
  /** Vocabulário próprio da edição. */
  words: { bank: string; go: string; jail: string; property: string };
}

export const HOUSES_TOTAL = 32;
export const HOTELS_TOTAL = 12;
