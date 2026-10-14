import { describe, expect, it } from "vitest";
import { cardsLabel } from "./dobble/labels";
import { describeResult, gameOf, roomCodeOf } from "./matchHistory";

describe("histórico de partidas: de que jogo é cada linha", () => {
  it("o prefixo do room_id diz o jogo; sem prefixo é Fodinha", () => {
    expect(gameOf("LUDO:ABCD")).toBe("ludo");
    expect(gameOf("DOBBLE:XY12")).toBe("dobble");
    expect(gameOf("UNO:K3K3")).toBe("uno");
    expect(gameOf("FORCA:ZZ99")).toBe("forca");
    expect(gameOf("ABCD")).toBe("fodinha");
    // "LUDO" sem os dois pontos não é Ludo (um código de sala de Fodinha pode ser LUDO)
    expect(gameOf("LUDO")).toBe("fodinha");
  });

  it("mostra só o código da sala, sem o prefixo", () => {
    expect(roomCodeOf("LUDO:ABCD")).toBe("ABCD");
    expect(roomCodeOf("DOBBLE:ZZZZZZ")).toBe("ZZZZZZ");
    expect(roomCodeOf("UNO:ABCD")).toBe("ABCD");
    expect(roomCodeOf("FORCA:ABCD")).toBe("ABCD");
    expect(roomCodeOf("ABCD")).toBe("ABCD");
  });
});

describe("describeResult — cada jogo conta pontos do seu jeito", () => {
  it("Fodinha: placar (menos é melhor)", () => {
    expect(describeResult("fodinha", { name: "Ana", score: 7 })).toBe("Ana (7)");
  });

  it("Ludo: peças em casa de 4", () => {
    expect(describeResult("ludo", { name: "Bia", score: 3 })).toBe("Bia (3/4 em casa)");
  });

  it("Dobble Torre: cartas na pilha, com singular", () => {
    expect(describeResult("dobble", { name: "Cris", score: 30, mode: "tower" })).toBe("Cris (30 cartas)");
    expect(describeResult("dobble", { name: "Cris", score: 1, mode: "tower" })).toBe("Cris (1 carta)");
    expect(describeResult("dobble", { name: "Cris", score: 5 })).toBe("Cris (5 cartas)"); // sem modo = Torre
  });

  it("Dobble Poço: 'acabou' pra quem esvaziou o monte, 'faltavam N' pros outros", () => {
    expect(describeResult("dobble", { name: "Dani", score: 0, mode: "well" })).toBe("Dani (acabou)");
    expect(describeResult("dobble", { name: "Edu", score: 12, mode: "well" })).toBe("Edu (faltavam 12)");
  });
});

describe("describeResult — Uno e Forca", () => {
  it("Uno: 'zerou a mão' pra quem ganhou, cartas que sobraram pros outros", () => {
    expect(describeResult("uno", { name: "Ana", score: 0 })).toBe("Ana (zerou a mão)");
    expect(describeResult("uno", { name: "Bia", score: 1 })).toBe("Bia (1 carta)");
    expect(describeResult("uno", { name: "Cris", score: 9 })).toBe("Cris (9 cartas)");
  });

  it("Forca: pontos", () => {
    expect(describeResult("forca", { name: "Dani", score: 120 })).toBe("Dani (120 pts)");
  });
});

describe("cardsLabel (Dobble)", () => {
  it("Torre: '1 carta', 'N cartas'", () => {
    expect(cardsLabel(1, "tower")).toBe("1 carta");
    expect(cardsLabel(0, "tower")).toBe("0 cartas");
    expect(cardsLabel(12, "tower")).toBe("12 cartas");
  });

  it("Poço: 'falta 1', 'faltam N'", () => {
    expect(cardsLabel(1, "well")).toBe("falta 1");
    expect(cardsLabel(0, "well")).toBe("faltam 0");
    expect(cardsLabel(27, "well")).toBe("faltam 27");
  });
});
