import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { diffForca, describeForcaEvents } from "./feed";
import { advanceRound, guessLetter, guessWord, setPlayerConnected, toView } from "./engine";
import { game, lobby, must } from "./testKit";

const ME = { me: "a" };
const texts = (items: { text: string }[]) => items.map((i) => i.text);

describe("diffForca", () => {
  it("lobby limpa a lista", () => {
    expect(diffForca(null, toView(lobby(["a", "b"])), ME)).toEqual({ reset: true, items: [] });
  });

  it("primeira tela de uma partida nova (contra bots, sem lobby) anuncia o começo e a palavra", () => {
    const d = diffForca(null, toView(game({ word: "GATO", category: "Animal", rounds: 3 })), ME);
    expect(d.reset).toBe(true);
    expect(texts(d.items)[0]).toBe("▶️ Partida começou — 3 palavras");
    expect(texts(d.items)[1]).toBe("🔤 Palavra 1: Animal, 4 letras");
  });

  it("entrar no meio de uma partida (recarregou) não inventa histórico", () => {
    const s = must(guessLetter(game({ word: "GATO" }), "a", "G", 0)).state;
    expect(diffForca(null, toView(s), ME)).toEqual({ reset: true, items: [] });
  });

  it("do lobby pra partida anuncia; revanche (outro gameNumber) também", () => {
    const lob = toView(lobby(["a", "b"]));
    const next = toView(game({ word: "GATO", category: "Animal" }));
    expect(diffForca(lob, next, ME).reset).toBe(true);
    expect(diffForca(next, { ...next, gameNumber: next.gameNumber + 1 }, ME).reset).toBe(true);
  });

  it("letra certa e errada viram linhas com quem chutou (Você pra mim)", () => {
    const s0 = game({ word: "BANANA" });
    const s1 = must(guessLetter(s0, "a", "A", 0)).state;
    const mine = diffForca(toView(s0), toView(s1), ME);
    expect(mine.reset).toBe(false);
    expect(texts(mine.items)).toEqual(["✅ Você chutou A — aparece 3 vezes"]);
    expect(mine.items[0].tone).toBe("good");

    // a vez passou pro b, que erra
    const s2 = must(guessLetter(s1, "b", "Z", 0)).state;
    const theirs = diffForca(toView(s1), toView(s2), ME);
    expect(texts(theirs.items)).toEqual(["❌ B chutou Z — não tem"]);
    expect(theirs.items[0].tone).toBe("info");
    const mineBad = diffForca(toView(s1), toView(s2), { me: "b" });
    expect(texts(mineBad.items)).toEqual(["❌ Você chutou Z — não tem"]);
    expect(mineBad.items[0].tone).toBe("bad");
  });

  it("uma letra só aparece 1 vez quando a ocorrência é única", () => {
    const s0 = game({ word: "GATO" });
    const s1 = must(guessLetter(s0, "a", "G", 0)).state;
    expect(texts(diffForca(toView(s0), toView(s1), ME).items)).toEqual(["✅ Você chutou G — aparece 1 vez"]);
  });

  it("chute automático por tempo esgotado é marcado", () => {
    const s0 = game({ word: "GATO" });
    const s1 = must(guessLetter(s0, "a", "Z", 0, true)).state;
    expect(texts(diffForca(toView(s0), toView(s1), { me: "b" }).items)[0]).toContain("(tempo esgotado)");
  });

  it("chute da palavra: acerto, erro (−2 vidas) e quem completou ganhou quanto", () => {
    const s0 = game({ word: "GATO" });
    const miss = must(guessWord(s0, "a", "CASA", 0)).state;
    expect(texts(diffForca(toView(s0), toView(miss), { me: "b" }).items)).toEqual(["💥 A errou a palavra (−2 vidas)"]);
    const hit = must(guessWord(s0, "a", "gato", 0)).state;
    expect(texts(diffForca(toView(s0), toView(hit), { me: "b" }).items)).toEqual(["🎯 A acertou a palavra!", "🏅 A completou a palavra: +70 pontos"]);
  });

  it("a forca fechando mostra a palavra (só depois que a rodada acabou)", () => {
    const s0 = game({ word: "GATO", lives: 1 });
    const s1 = must(guessLetter(s0, "a", "Z", 0)).state;
    const d = diffForca(toView(s0), toView(s1), ME);
    expect(texts(d.items)).toContain("☠️ A forca fechou — era GATO");
  });

  it("nada novo = nada na lista", () => {
    const v = toView(game({ word: "GATO" }));
    expect(diffForca(v, v, ME)).toEqual({ reset: false, items: [] });
  });

  it("desconexão e volta de um humano (menos eu e os bots)", () => {
    const v0 = toView(game({ word: "GATO", players: ["a", "b"] }));
    const v1 = toView(setPlayerConnected(game({ word: "GATO", players: ["a", "b"] }), "b", false));
    expect(texts(diffForca(v0, v1, ME).items)).toEqual(["📡 B desconectou — um bot assume"]);
    expect(texts(diffForca(v1, v0, ME).items)).toEqual(["📡 B voltou pra partida"]);
    expect(diffForca(v0, toView(setPlayerConnected(game({ word: "GATO", players: ["a", "b"] }), "a", false)), ME).items).toEqual([]);
  });

  it("fim de jogo anuncia o vencedor", () => {
    const end = must(guessWord(game({ word: "GATO", rounds: 1 }), "a", "GATO", 0)).state;
    const over = must(advanceRound(end, mulberry32(1), 0)).state;
    const d = diffForca(toView(end), toView(over), ME);
    expect(texts(d.items)).toEqual(["🏆 Você venceu!"]);
    expect(texts(diffForca(toView(end), toView(over), { me: "b" }).items)).toEqual(["🏆 A venceu!"]);
  });

  it("palavra nova entra no histórico com categoria e tamanho", () => {
    const end = must(guessWord(game({ word: "GATO", rounds: 3 }), "a", "GATO", 0)).state;
    const next = must(advanceRound(end, mulberry32(1), 0)).state;
    const items = diffForca(toView(end), toView(next), ME).items;
    expect(texts(items)[0]).toMatch(/^🔤 Palavra 2: .+, \d+ letras$/);
  });
});

describe("describeForcaEvents", () => {
  it("usa os nomes da mesa e a cor de cada jogador", () => {
    const v = toView(game({ word: "GATO" }));
    const items = describeForcaEvents(v, null, [{ t: "letter", p: "b", letter: "G", hits: 1 }], { me: "a" });
    expect(items[0].text).toBe("✅ B chutou G — aparece 1 vez");
    expect(items[0].color).toBeTruthy();
  });
});
