import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { UnoState, callUno, catchUno, drawCard, playCard, startGame, toView } from "./engine";
import { describeUnoEvents, diffUno } from "./feed";
import { find, game, lobby, must } from "./testKit";

const R5 = find("red", "number", 5);
const R5h = find("red", "number", 5, 1);
const R9 = find("red", "number", 9);
const B7 = find("blue", "number", 7);
const G3 = find("green", "number", 3);
const Y2 = find("yellow", "number", 2);
const D2_R = find("red", "draw2");
const SKIP_R = find("red", "skip");
const REV_R = find("red", "reverse");
const WILD = find(null, "wild");

const ctx = { me: "a" };
const viewOf = (s: UnoState, who = "a") => toView(s, who);
const texts = (items: { text: string }[]) => items.map((i) => i.text);

describe("describeUnoEvents", () => {
  const base = game({ hands: { a: [R9, B7, WILD], b: [R5h, Y2, G3], c: [find("red", "number", 1), D2_R, SKIP_R] }, top: R5 });

  it("jogada: 'Você jogou' pra mim, o nome pros outros; coringa diz a cor escolhida", () => {
    const afterA = must(playCard(base, "a", R9, undefined, false)).state;
    expect(texts(describeUnoEvents(viewOf(afterA), afterA.events, ctx))).toEqual(["🃏 Você jogou vermelho 9"]);
    expect(texts(describeUnoEvents(viewOf(afterA), afterA.events, { me: "c" }))).toEqual(["🃏 A jogou vermelho 9"]);
    const w = must(playCard({ ...base }, "a", WILD, "blue", false)).state;
    expect(texts(describeUnoEvents(viewOf(w), w.events, ctx))).toEqual(["🃏 Você jogou Coringa (azul)"]);
  });

  it("+2: jogada, compra de castigo e pulo, nesta ordem", () => {
    const s = game({ hands: { a: [D2_R, B7], b: [R5h, Y2], c: [G3] }, top: R5 });
    const n = must(playCard(s, "a", D2_R, undefined, false)).state;
    const t = describeUnoEvents(viewOf(n, "b"), n.events, { me: "b" });
    expect(texts(t)).toEqual(["🃏 A jogou +2 vermelho", "📥 Você comprou 2 cartas (castigo)", "⛔ Você foi pulado"]);
    expect(t[1].tone).toBe("bad");
    expect(t[2].tone).toBe("bad");
    // pra quem olha de fora é neutro
    const out = describeUnoEvents(viewOf(n, "c"), n.events, { me: "c" });
    expect(out[1].tone).toBe("info");
  });

  it("Pular, Inverter, compra simples, passar, UNO e reembaralhar", () => {
    const skip = must(playCard(game({ hands: { a: [SKIP_R, B7], b: [R5h], c: [G3] }, top: R5 }), "a", SKIP_R, undefined, false)).state;
    expect(texts(describeUnoEvents(viewOf(skip), skip.events, ctx))).toEqual(["🃏 Você jogou Pular vermelho", "⛔ B foi pulado"]);
    const rev = must(playCard(game({ hands: { a: [REV_R, B7], b: [R5h], c: [G3] }, top: R5 }), "a", REV_R, undefined, false)).state;
    expect(texts(describeUnoEvents(viewOf(rev), rev.events, ctx))[1]).toBe("🔄 Sentido invertido");

    const drew = must(drawCard(game({ hands: { a: [B7, G3], b: [R5h] }, top: R5, draw: [R9, Y2] }), "a", mulberry32(1))).state;
    expect(texts(describeUnoEvents(viewOf(drew), drew.events, ctx))).toEqual(["📥 Você comprou uma carta", "⏭️ Você passou a vez"]);

    const uno = must(callUno(game({ hands: { a: [R9, B7], b: [R5h, Y2] }, top: R5 }), "a")).state;
    expect(texts(describeUnoEvents(viewOf(uno), uno.events, ctx))).toEqual(["📢 Você gritou UNO!"]);

    expect(texts(describeUnoEvents(viewOf(uno), [{ t: "reshuffle" }], ctx))).toEqual(["♻️ O baralho acabou e foi reembaralhado"]);
  });

  it("pegar: ruim pra quem foi pego, bom pra quem pegou, neutro pro resto", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h, Y2], c: [G3] }, top: R5 });
    const exposed = must(playCard(s, "a", R9, undefined, false)).state;
    const caught = must(catchUno(exposed, "c", mulberry32(1))).state;
    const asA = describeUnoEvents(viewOf(caught, "a"), caught.events, { me: "a" });
    expect(asA[0]).toMatchObject({ text: "🚨 C pegou você sem UNO", tone: "bad" });
    const asC = describeUnoEvents(viewOf(caught, "c"), caught.events, { me: "c" });
    expect(asC[0]).toMatchObject({ text: "🚨 Você pegou A sem UNO", tone: "good" });
    const asB = describeUnoEvents(viewOf(caught, "b"), caught.events, { me: "b" });
    expect(asB[0].tone).toBe("special");
  });

  it("cada linha traz a cor de quem fez", () => {
    const n = must(playCard(base, "a", R9, undefined, false)).state;
    const [line] = describeUnoEvents(viewOf(n), n.events, ctx);
    expect(line.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("diffUno", () => {
  const started = must(startGame(lobby(["a", "b", "c"]), mulberry32(3))).state;
  const lobbyView = toView(lobby(["a", "b", "c"]), "a");

  it("lobby zera a lista", () => {
    expect(diffUno(null, lobbyView, ctx)).toEqual({ reset: true, items: [] });
    expect(diffUno(toView(started, "a"), lobbyView, ctx)).toEqual({ reset: true, items: [] });
  });

  it("partida nova (do lobby, ou primeira tela de uma partida ainda sem jogada) anuncia quem começa", () => {
    const first = started.players[started.turn];
    const want = first.id === "a" ? "▶️ Partida começou — você começa" : `▶️ Partida começou — ${first.name} começa`;
    const fromLobby = diffUno(lobbyView, toView(started, "a"), ctx);
    expect(fromLobby.reset).toBe(true);
    expect(texts(fromLobby.items)[0]).toBe(want);
    const firstScreen = diffUno(null, toView(started, "a"), ctx);
    expect(texts(firstScreen.items)[0]).toBe(want);
  });

  it("primeira tela no MEIO da partida não inventa histórico", () => {
    const s = game({ hands: { a: [R9, B7], b: [R5h, Y2], c: [G3] }, top: R5 });
    const mid = must(playCard(s, "a", R9, undefined, false)).state;
    const view = { ...toView(mid, "a"), discardCount: 5 };
    expect(diffUno(null, view, ctx)).toEqual({ reset: true, items: [] });
  });

  it("estado novo traz os eventos novos; o mesmo estado de novo não repete", () => {
    const s = game({ hands: { a: [R9, B7, G3], b: [R5h, Y2, find("blue", "number", 1)], c: [find("green", "number", 5)] }, top: R5 });
    const n = must(playCard(s, "a", R9, undefined, false)).state;
    const d = diffUno(toView(s, "a"), toView(n, "a"), ctx);
    expect(d.reset).toBe(false);
    expect(texts(d.items)).toEqual(["🃏 Você jogou vermelho 9"]);
    expect(diffUno(toView(n, "a"), toView(n, "a"), ctx).items).toEqual([]);
  });

  it("quem cai e quem volta (humano, não eu); fim de jogo anuncia o vencedor", () => {
    const s = game({ hands: { a: [R9], b: [R5h, Y2], c: [G3] }, top: R5 });
    const dropped = { ...s, players: s.players.map((p) => (p.id === "b" ? { ...p, connected: false } : p)) };
    expect(texts(diffUno(toView(s, "a"), toView(dropped, "a"), ctx).items)).toEqual(["📡 B desconectou — um bot assume"]);
    expect(texts(diffUno(toView(dropped, "a"), toView(s, "a"), ctx).items)).toEqual(["📡 B voltou pra partida"]);
    const over = must(playCard(s, "a", R9, undefined, false)).state;
    const d = diffUno(toView(s, "a"), toView(over, "a"), ctx);
    expect(texts(d.items)).toContain("🏆 Você venceu!");
    expect(texts(diffUno(toView(s, "b"), toView(over, "b"), { me: "b" }).items)).toContain("🏆 A venceu!");
  });
});
