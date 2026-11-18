// Edição "Banco Imobiliário": o tabuleiro brasileiro (bairros e avenidas de São Paulo e do Rio, seis
// companhias), R$ 2.500 de partida, UM baralho só de "Sorte ou Revés" e SEM leilão: quem não compra,
// deixa a propriedade livre pra quem cair nela depois. Os bairros e as companhias vêm do tabuleiro
// clássico; os valores seguem a mesma economia do Monopoly (ver economy.ts) pro jogo ficar equilibrado.

import { street } from "./economy";
import type { Card, Edition, Square } from "./types";

const luck: Square = { kind: "card", deck: "chance" };

const squares: Square[] = [
  { kind: "go", name: "Ponto de Partida" },
  street(1, "Leblon"),
  luck,
  street(3, "Av. Presidente Vargas"),
  { kind: "tax", name: "Imposto de Renda", amount: 200 },
  { kind: "company", name: "Companhia Ferroviária", price: 200 },
  street(6, "Av. N. S. de Copacabana"),
  luck,
  street(8, "Av. Brigadeiro Faria Lima"),
  street(9, "Av. Rebouças"),
  { kind: "jail", name: "Prisão" },
  street(11, "Av. 9 de Julho"),
  { kind: "company", name: "Companhia de Viação", price: 150 },
  street(13, "Av. Europa"),
  street(14, "Rua Augusta"),
  { kind: "company", name: "Companhia de Táxi", price: 200 },
  street(16, "Av. Pacaembu"),
  luck,
  street(18, "Interlagos"),
  street(19, "Morumbi"),
  { kind: "parking", name: "Parada Livre" },
  street(21, "Flamengo"),
  luck,
  street(23, "Botafogo"),
  street(24, "Av. Brasil"),
  { kind: "company", name: "Companhia de Navegação", price: 200 },
  street(26, "Av. Paulista"),
  street(27, "Jardim Europa"),
  { kind: "company", name: "Companhia de Aviação", price: 150 },
  street(29, "Copacabana"),
  { kind: "gotojail", name: "Vá para a Prisão" },
  street(31, "Av. Vieira Souto"),
  street(32, "Av. Atlântica"),
  luck,
  street(34, "Ipanema"),
  { kind: "company", name: "Companhia de Petróleo", price: 200 },
  luck,
  street(37, "Jardim Paulista"),
  { kind: "bonus", name: "Lucros ou Dividendos", amount: 100 },
  street(39, "Brooklin"),
];

// 24 cartas: metade "Sorte", metade "Revés".
const cards: Card[] = [
  // Sorte
  { text: "Seu time foi campeão! A torcida faz uma vaquinha pra você: receba R$ 100.", fx: { t: "gain", amount: 100 } },
  { text: "Você acertou a quina da loteria: receba R$ 150.", fx: { t: "gain", amount: 150 } },
  { text: "Restituição do Imposto de Renda: receba R$ 50.", fx: { t: "gain", amount: 50 } },
  { text: "Você vendeu seu carro usado: receba R$ 100.", fx: { t: "gain", amount: 100 } },
  { text: "Herança de uma tia distante: receba R$ 200.", fx: { t: "gain", amount: 200 } },
  { text: "Você foi sorteado no consórcio: receba R$ 150.", fx: { t: "gain", amount: 150 } },
  { text: "Avance até o Ponto de Partida e receba o salário.", fx: { t: "advance", to: 0 } },
  { text: "Avance até a Av. Paulista. Se passar pelo Ponto de Partida, receba o salário.", fx: { t: "advance", to: 26 } },
  { text: "Avance até Ipanema. Se passar pelo Ponto de Partida, receba o salário.", fx: { t: "advance", to: 34 } },
  { text: "Avance até Copacabana. Se passar pelo Ponto de Partida, receba o salário.", fx: { t: "advance", to: 29 } },
  { text: "Avance até a companhia mais próxima. Se tiver dono, pague o dobro do aluguel.", fx: { t: "nearest", kind: "company" } },
  { text: "Habeas Corpus! Guarde esta carta para sair da prisão sem pagar.", fx: { t: "jail_free" } },
  { text: "Aniversário! Cada jogador te dá R$ 20 de presente.", fx: { t: "gain_each", amount: 20 } },
  // Revés
  { text: "Multa de trânsito: pague R$ 50.", fx: { t: "pay", amount: 50 } },
  { text: "Conserto do carro na oficina: pague R$ 100.", fx: { t: "pay", amount: 100 } },
  { text: "Você foi pego numa blitz sem documentos: vá direto para a prisão, sem receber o salário.", fx: { t: "jail" } },
  { text: "Engarrafamento na Marginal: volte 3 casas.", fx: { t: "back", n: 3 } },
  { text: "Reforma geral nas suas propriedades: pague R$ 25 por casa e R$ 100 por hotel.", fx: { t: "repairs", house: 25, hotel: 100 } },
  { text: "Taxa de condomínio extra: pague R$ 40 por casa e R$ 115 por hotel.", fx: { t: "repairs", house: 40, hotel: 115 } },
  { text: "Churrasco com a galera: pague R$ 30 a cada jogador.", fx: { t: "pay_each", amount: 30 } },
  { text: "Plano de saúde: pague R$ 150.", fx: { t: "pay", amount: 150 } },
  { text: "IPTU atrasado: pague R$ 100.", fx: { t: "pay", amount: 100 } },
  { text: "Dia de feira: gaste R$ 20.", fx: { t: "pay", amount: 20 } },
  { text: "Você emprestou dinheiro e não recebeu de volta: pague R$ 60.", fx: { t: "pay", amount: 60 } },
];

export const BANCO: Edition = {
  id: "banco",
  name: "Banco Imobiliário",
  currency: "R$ ",
  startCash: 2500,
  salary: 200,
  bail: 50,
  jailIndex: 10,
  goToJailIndex: 30,
  squares,
  // Só existe o baralho "Sorte ou Revés"; o "chest" fica vazio (nenhuma casa tira dele).
  decks: { chance: cards, chest: [] },
  deckNames: { chance: "Sorte ou Revés", chest: "Sorte ou Revés" },
  jailCardName: "Habeas Corpus",
  railroadRent: [],
  utilityMultiplier: [],
  companyRent: [25, 50, 100, 150, 250, 400],
  auction: false,
  tokens: ["🛵", "⚽", "🦜", "🧉", "🎸", "🚌"],
  words: { bank: "o banco", go: "Ponto de Partida", jail: "Prisão", property: "propriedade" },
};
