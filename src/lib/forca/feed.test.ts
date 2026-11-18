import { describe, expect, it } from "vitest";
import { advanceRound, chooseWord, guessLetter, guessWord, setPlayerConnected, skipChooser, skipTurn, timeoutTurn, toView } from "./engine";
import { describeForcaEvents, diffForca } from "./feed";
import { mulberry32 } from "@/lib/random";
import { choosing, game, lobby, must } from "./testKit";

const texts = (items: { text: string }[]) => items.map((i) => i.text);
/** A visão de `who` (a palavra só aparece pro escolhedor). */
const v = (s: Parameters<typeof toView>[0], who: string) => toView(s, who);

describe("diffForca", () => {
  it("lobby limpa a lista", () => {
    expect(diffForca(null, v(lobby(["a", "b"]), "a"), { me: "a" })).toEqual({ reset: true, items: [] });
  });

  it("primeira tela de uma partida nova anuncia o começo e quem escolhe (Você, se for eu)", () => {
    const s = choosing({ rounds: 3 });
    const forB = diffForca(null, v(s, "b"), { me: "b" });
    expect(forB.reset).toBe(true);
    expect(texts(forB.items)).toEqual(["▶️ Partida começou — 3 palavras", "✏️ Palavra 1: A está escolhendo"]);
    expect(texts(diffForca(null, v(s, "a"), { me: "a" }).items)).toEqual(["▶️ Partida começou — 3 palavras", "✏️ Palavra 1: você escolhe"]);
    expect(texts(diffForca(null, v(choosing({ rounds: 1 }), "b"), { me: "b" }).items)[0]).toBe("▶️ Partida começou — 1 palavra");
  });

  it("entrar no meio de uma partida (recarregou) não inventa histórico", () => {
    const s = must(guessLetter(game({ word: "GATO" }), "b", "G", 0)).state;
    expect(diffForca(null, v(s, "b"), { me: "b" })).toEqual({ reset: true, items: [] });
  });

  it("do lobby pra partida anuncia; revanche (outro gameNumber) também", () => {
    const lob = v(lobby(["a", "b"]), "a");
    const next = v(choosing(), "a");
    expect(diffForca(lob, next, { me: "a" }).reset).toBe(true);
    expect(diffForca(next, { ...next, gameNumber: next.gameNumber + 1 }, { me: "a" }).reset).toBe(true);
  });

  it("a palavra escolhida vira linha com o tamanho (palavra ou frase) — sem dizer qual é", () => {
    const c = choosing();
    const single = must(chooseWord(c, "a", "gato", 0)).state;
    const items = diffForca(v(c, "b"), v(single, "b"), { me: "b" }).items;
    expect(texts(items)).toEqual(["🔤 A escolheu uma palavra de 4 letras"]);
    expect(texts(diffForca(v(c, "a"), v(single, "a"), { me: "a" }).items)).toEqual(["🔤 Você escolheu uma palavra de 4 letras"]);
    const phrase = must(chooseWord(c, "a", "casa de papel", 0)).state;
    expect(texts(diffForca(v(c, "c"), v(phrase, "c"), { me: "c" }).items)).toEqual(["🔤 A escolheu uma frase de 3 palavras (11 letras)"]);
    expect(JSON.stringify(items)).not.toContain("GATO");
  });

  it("letra certa e errada viram linhas com quem chutou (Você pra mim)", () => {
    const s0 = game({ word: "BANANA" });
    const s1 = must(guessLetter(s0, "b", "A", 0)).state;
    const mine = diffForca(v(s0, "b"), v(s1, "b"), { me: "b" });
    expect(mine.reset).toBe(false);
    expect(texts(mine.items)).toEqual(["✅ Você chutou A — aparece 3 vezes"]);
    expect(mine.items[0].tone).toBe("good");

    // a vez passou pra c, que erra
    const s2 = must(guessLetter(s1, "c", "Z", 0)).state;
    const theirs = diffForca(v(s1, "b"), v(s2, "b"), { me: "b" });
    expect(texts(theirs.items)).toEqual(["❌ C chutou Z — não tem"]);
    expect(theirs.items[0].tone).toBe("info");
    const mineBad = diffForca(v(s1, "c"), v(s2, "c"), { me: "c" });
    expect(texts(mineBad.items)).toEqual(["❌ Você chutou Z — não tem"]);
    expect(mineBad.items[0].tone).toBe("bad");
  });

  it("uma letra só aparece '1 vez' quando a ocorrência é única", () => {
    const s0 = game({ word: "GATO" });
    const s1 = must(guessLetter(s0, "b", "G", 0)).state;
    expect(texts(diffForca(v(s0, "b"), v(s1, "b"), { me: "b" }).items)).toEqual(["✅ Você chutou G — aparece 1 vez"]);
  });

  it("chute automático por tempo esgotado é marcado", () => {
    const s0 = game({ word: "GATO" });
    const s1 = must(timeoutTurn(s0, mulberry32(3), 0)).state;
    expect(texts(diffForca(v(s0, "c"), v(s1, "c"), { me: "c" }).items)[0]).toContain("(tempo esgotado)");
  });

  it("chute da palavra: erro (+2 partes) e acerto; quem completou ganha quanto e o escolhedor ganha pelo boneco", () => {
    const s0 = game({ word: "GATO" });
    const miss = must(guessWord(s0, "b", "CASA", 0)).state;
    expect(texts(diffForca(v(s0, "c"), v(miss, "c"), { me: "c" }).items)).toEqual(["💥 B errou a palavra (+2 partes no boneco)"]);
    const s6 = game({ word: "GATO", lives: 6 });
    const hit = must(guessWord(s6, "b", "gato", 0)).state;
    expect(texts(diffForca(v(s6, "c"), v(hit, "c"), { me: "c" }).items)).toEqual(["🎯 B acertou a palavra!", "🏅 B completou a palavra: +70 pontos", "✏️ A ganhou +40 pela palavra"]);
    // pra quem escolheu: "Você"
    expect(texts(diffForca(v(s6, "a"), v(hit, "a"), { me: "a" }).items)[2]).toBe("✏️ Você ganhou +40 pela palavra");
    // sem erro nenhum o escolhedor não ganhou nada: sem a linha dele
    const clean = must(guessWord(s0, "b", "gato", 0)).state;
    expect(diffForca(v(s0, "c"), v(clean, "c"), { me: "c" }).items).toHaveLength(2);
  });

  it("o boneco fechando mostra a palavra (só depois que a rodada acabou)", () => {
    const s0 = game({ word: "GATO", lives: 1 });
    const s1 = must(guessLetter(s0, "b", "Z", 0)).state;
    const d = diffForca(v(s0, "c"), v(s1, "c"), { me: "c" });
    expect(texts(d.items)).toContain("☠️ O boneco ficou completo — era GATO");
    // e nada da palavra na rodada aberta, nem no feed do escolhedor… que já a conhece
    const open = must(guessLetter(game({ word: "GATO" }), "b", "Z", 0)).state;
    expect(JSON.stringify(diffForca(v(game({ word: "GATO" }), "c"), v(open, "c"), { me: "c" }).items)).not.toContain("GATO");
  });

  it("nada novo = nada na lista", () => {
    const view = v(game({ word: "GATO" }), "b");
    expect(diffForca(view, view, { me: "b" })).toEqual({ reset: false, items: [] });
  });

  it("escolha pulada, vez pulada e a próxima palavra", () => {
    const c = choosing({ rounds: 3 });
    const skipped = must(skipChooser(c, 0)).state;
    expect(texts(diffForca(v(c, "b"), v(skipped, "b"), { me: "b" }).items)).toEqual(["⏭️ A não escolheu a tempo — rodada pulada", "✏️ Palavra 2: você escolhe"]);
    const g = game({ word: "GATO" });
    const away = must(skipTurn(g, 0)).state;
    expect(texts(diffForca(v(g, "c"), v(away, "c"), { me: "c" }).items)).toEqual(["📡 B está fora — a vez passou"]);
    const end = must(guessWord(game({ word: "GATO", rounds: 3 }), "b", "gato", 0)).state;
    const next = must(advanceRound(end, 0)).state;
    expect(texts(diffForca(v(end, "c"), v(next, "c"), { me: "c" }).items)).toEqual(["✏️ Palavra 2: B está escolhendo"]);
  });

  it("desconexão e volta de uma pessoa (menos eu)", () => {
    const base = game({ word: "GATO" });
    const gone = setPlayerConnected(base, "b", false);
    expect(texts(diffForca(v(base, "a"), v(gone, "a"), { me: "a" }).items)).toEqual(["📡 B desconectou — a vez dele é pulada"]);
    expect(texts(diffForca(v(gone, "a"), v(base, "a"), { me: "a" }).items)).toEqual(["📡 B voltou pra partida"]);
    expect(diffForca(v(base, "b"), v(gone, "b"), { me: "b" }).items).toEqual([]);
  });

  it("fim de jogo anuncia o vencedor", () => {
    const end = must(guessWord(game({ word: "GATO", rounds: 1 }), "b", "GATO", 0)).state;
    const over = must(advanceRound(end, 0)).state;
    expect(texts(diffForca(v(end, "b"), v(over, "b"), { me: "b" }).items)).toEqual(["🏆 Você venceu!"]);
    expect(texts(diffForca(v(end, "c"), v(over, "c"), { me: "c" }).items)).toEqual(["🏆 B venceu!"]);
  });
});

describe("describeForcaEvents", () => {
  it("usa os nomes da mesa e a cor de cada jogador", () => {
    const view = v(game({ word: "GATO" }), "c");
    const items = describeForcaEvents(view, null, [{ t: "letter", p: "b", letter: "G", hits: 1 }], { me: "c" });
    expect(items[0].text).toBe("✅ B chutou G — aparece 1 vez");
    expect(items[0].color).toBeTruthy();
  });
});
