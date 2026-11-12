import { describe, expect, it } from "vitest";
import { MimicaView, submitGuess, timeoutMime, toView } from "./engine";
import { describeMimicaEvents, diffMimica } from "./feed";
import { lobby, miming, must, picking } from "./testKit";

const texts = (items: { text: string }[]) => items.map((i) => i.text);
const view = (s: Parameters<typeof toView>[0], who: string | null = "b") => toView(s, who);

describe("describeMimicaEvents", () => {
  const scene = view(picking());

  it("quem vai fazer a mímica (você ou o nome)", () => {
    expect(texts(describeMimicaEvents(scene, [{ t: "turn", n: 1, mimer: "a" }], { me: "a" }))).toEqual(["🎭 Mímica 1: sua vez de fazer"]);
    expect(texts(describeMimicaEvents(scene, [{ t: "turn", n: 2, mimer: "b" }], { me: "a" }))).toEqual(["🎭 Mímica 2: B vai fazer"]);
  });

  it("a escolha diz de onde é a música e o tamanho, sem entregar o título", () => {
    const [br] = describeMimicaEvents(scene, [{ t: "picked", p: "a", kind: "br", words: 2, letters: 10 }], { me: "b" });
    expect(br.text).toBe("🇧🇷 A escolheu uma música nacional: 2 palavras, 10 letras");
    const [world] = describeMimicaEvents(scene, [{ t: "picked", p: "a", kind: "world", words: 1, letters: 1, auto: true }], { me: "a" });
    expect(world.text).toBe("🌎 Você escolheu uma música internacional: 1 palavra, 1 letra (o tempo acabou, o jogo escolheu)");
  });

  it("chute errado, dica, acerto e tempo esgotado", () => {
    const wrong = describeMimicaEvents(scene, [{ t: "wrong", p: "b", text: "um chute com mais de vinte e oito letras mesmo" }], { me: "c" });
    expect(wrong[0].text).toBe("❌ B chutou “um chute com mais de vinte …”");
    expect(wrong[0].tone).toBe("info");
    expect(describeMimicaEvents(scene, [{ t: "wrong", p: "b", text: "x" }], { me: "b" })[0].tone).toBe("bad");
    expect(texts(describeMimicaEvents(scene, [{ t: "hint" }], { me: "b" }))).toEqual(["💡 Dica: a primeira letra de cada palavra apareceu"]);

    const solved = describeMimicaEvents(
      scene,
      [{ t: "solved", p: "b", mimer: "a", points: 15, bonus: 5, mimerPoints: 10, title: "Lapada Dela", artist: "x" }],
      { me: "b" }
    );
    expect(texts(solved)).toEqual(["🎉 Você acertou “Lapada Dela”: +15 pontos", "🎭 A ganhou +10 pela mímica"]);
    expect(solved[0].tone).toBe("good");

    expect(texts(describeMimicaEvents(scene, [{ t: "timeout", title: "Lapada Dela", artist: "Grupo Menos É Mais" }], { me: "b" }))).toEqual(["⏰ Acabou o tempo — era “Lapada Dela” (Grupo Menos É Mais)"]);
    expect(texts(describeMimicaEvents(scene, [{ t: "timeout", title: "Lapada Dela", artist: "x", gaveUp: true }], { me: "b" }))[0]).toMatch(/^⏰ Desistiram/);
  });

  it("não inventa o título quando o evento chega sem ele", () => {
    expect(texts(describeMimicaEvents(scene, [{ t: "timeout", title: "", artist: "" }], { me: "b" }))).toEqual(["⏰ Acabou o tempo"]);
    expect(texts(describeMimicaEvents(scene, [{ t: "skipped", p: "a", title: null, artist: null }], { me: "b" }))).toEqual(["📡 A está fora — a mímica foi pulada"]);
  });
});

describe("diffMimica", () => {
  it("lobby zera a lista", () => {
    expect(diffMimica(null, view(lobby(["a", "b"])), { me: "b" })).toEqual({ reset: true, items: [] });
  });

  it("primeira tela de uma partida nova anuncia; reconexão no meio não inventa histórico", () => {
    const fresh = diffMimica(null, view(picking()), { me: "b" });
    expect(fresh.reset).toBe(true);
    expect(texts(fresh.items)).toEqual(["▶️ Partida começou — 6 mímicas", "🎭 Mímica 1: A vai fazer"]);
    expect(diffMimica(null, view(miming()), { me: "b" })).toEqual({ reset: true, items: [] });
  });

  it("registra só o que é novo", () => {
    const prev = view(miming({ title: "Lapada Dela" }));
    const next = view(must(submitGuess(miming({ title: "Lapada Dela" }), "b", "nada a ver", 1000)).state);
    const d = diffMimica(prev, next, { me: "c" });
    expect(d.reset).toBe(false);
    expect(texts(d.items)).toEqual(["❌ B chutou “nada a ver”"]);
    expect(diffMimica(next, next, { me: "c" }).items).toEqual([]);
  });

  it("quem cai e quem volta, e o vencedor", () => {
    const base = view(miming());
    const away: MimicaView = { ...base, players: base.players.map((p) => (p.id === "c" ? { ...p, connected: false } : p)) };
    expect(texts(diffMimica(base, away, { me: "b" }).items)).toEqual(["📡 C desconectou"]);
    expect(texts(diffMimica(away, base, { me: "b" }).items)).toEqual(["📡 C voltou pra partida"]);
    const over: MimicaView = { ...base, phase: "game_over", winnerId: "b", eventSeq: base.eventSeq + 1, events: [] };
    expect(texts(diffMimica(base, over, { me: "b" }).items)).toEqual(["🏆 Você venceu!"]);
    expect(texts(diffMimica(base, over, { me: "c" }).items)).toEqual(["🏆 B venceu!"]);
  });

  it("o tempo esgotado entra com o título já revelado", () => {
    const prev = view(miming({ title: "Lapada Dela" }));
    const next = view(must(timeoutMime(miming({ title: "Lapada Dela" }))).state);
    expect(texts(diffMimica(prev, next, { me: "b" }).items)).toEqual(["⏰ Acabou o tempo — era “Lapada Dela” (Grupo Menos É Mais)"]);
  });
});
