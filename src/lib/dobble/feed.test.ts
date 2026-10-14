import { describe, expect, it } from "vitest";
import { ALL_CARDS, SYMBOLS } from "./cards";
import { playerColor } from "./colors";
import { DobbleState, LOCK_MS, advanceRound, beginPlay, claim, createLobby, joinLobby, matchFor, setPlayerConnected, startGame, toView } from "./engine";
import { diffDobble } from "./feed";

const unwrap = (r: { ok: true; state: DobbleState } | { ok: false; error: string }): DobbleState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const ctx = { me: "ana" };

function playing(): DobbleState {
  let s = createLobby();
  for (const id of ["ana", "beto"]) s = unwrap(joinLobby(s, { id, name: id === "ana" ? "Ana" : "Beto" }));
  return unwrap(beginPlay(unwrap(startGame(s)), 1000));
}

describe("diffDobble", () => {
  it("lobby e primeira tela não geram histórico", () => {
    const p = playing();
    expect(diffDobble(null, toView(p), ctx)).toEqual({ reset: true, items: [] });
    expect(diffDobble(toView(p), toView({ ...p, phase: "lobby" }), ctx)).toEqual({ reset: true, items: [] });
  });

  it("primeira tela já na contagem ('contra bots', sem lobby) anuncia o começo; no meio da rodada não", () => {
    let s = createLobby();
    for (const id of ["ana", "beto"]) s = unwrap(joinLobby(s, { id, name: id }));
    const counting = unwrap(startGame(s));
    expect(counting.phase).toBe("countdown");
    expect(diffDobble(null, toView(counting), ctx)).toMatchObject({ reset: true, items: [{ text: "▶️ Partida começou — modo Torre" }] });
    expect(diffDobble(null, toView(playing()), ctx)).toEqual({ reset: true, items: [] });
  });

  it("partida nova anuncia o modo e zera a lista", () => {
    const p = playing();
    const lobby = toView({ ...p, phase: "lobby" });
    const d = diffDobble(lobby, toView(p), ctx);
    expect(d.reset).toBe(true);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].text).toBe("▶️ Partida começou — modo Torre");
  });

  it("quem achou o símbolo aparece com o tempo da rodada — 'Você' pra mim", () => {
    const p = playing();
    const sym = matchFor(p, "ana")!;
    const won = unwrap(claim(p, "ana", sym, p.round, 1850));
    const mine = diffDobble(toView(p), toView(won), ctx);
    expect(mine.reset).toBe(false);
    expect(mine.items).toEqual([{ text: `✅ Você achou ${SYMBOLS[sym]} em 0,9 s`, tone: "good", color: playerColor(toView(won).players, "ana") }]);

    const other = unwrap(claim(p, "beto", matchFor(p, "beto")!, p.round, 1400));
    const seen = diffDobble(toView(p), toView(other), ctx).items[0];
    expect(seen.text).toMatch(/^✅ Beto achou .* em 0,4 s$/);
    expect(seen.tone).toBe("info");
  });

  it("erro entra com o castigo; erro meu é 'bad', dos outros só informa", () => {
    const p = playing();
    const hand = p.players.find((x) => x.id === "beto")!.hand!;
    const wrong = ALL_CARDS[hand].find((x) => x !== matchFor(p, "beto"))!;
    const after = unwrap(claim(p, "beto", wrong, p.round, 1200));
    const item = diffDobble(toView(p), toView(after), ctx).items[0];
    expect(item.text).toBe(`❌ Beto errou ${SYMBOLS[wrong]} — ${LOCK_MS / 1000} s de castigo`);
    expect(item.tone).toBe("info");

    const myHand = p.players.find((x) => x.id === "ana")!.hand!;
    const myWrong = ALL_CARDS[myHand].find((x) => x !== matchFor(p, "ana"))!;
    const mineAfter = unwrap(claim(p, "ana", myWrong, p.round, 1200));
    expect(diffDobble(toView(p), toView(mineAfter), ctx).items[0].tone).toBe("bad");
  });

  it("o mesmo estado de novo não repete nada; a rodada seguinte não repete o acerto antigo", () => {
    const p = playing();
    const won = unwrap(claim(p, "ana", matchFor(p, "ana")!, p.round, 1500));
    expect(diffDobble(toView(won), toView(won), ctx).items).toEqual([]);
    const next = unwrap(advanceRound(won, 3000));
    expect(diffDobble(toView(won), toView(next), ctx).items).toEqual([]);
  });

  it("humano que cai e volta; eu mesmo e bots não", () => {
    const p = playing();
    const dropped = setPlayerConnected(p, "beto", false);
    expect(diffDobble(toView(p), toView(dropped), ctx).items.map((i) => i.text)).toEqual(["📡 Beto desconectou"]);
    expect(diffDobble(toView(dropped), toView(p), ctx).items.map((i) => i.text)).toEqual(["📡 Beto voltou pra partida"]);
    expect(diffDobble(toView(p), toView(setPlayerConnected(p, "ana", false)), ctx).items).toEqual([]);
  });

  it("fim de jogo anuncia o vencedor uma vez", () => {
    const p = { ...playing(), draw: [] };
    const won = unwrap(claim(p, "beto", matchFor(p, "beto")!, p.round, 1500));
    const over = unwrap(advanceRound(won, 3000));
    const texts = diffDobble(toView(won), toView(over), ctx).items.map((i) => i.text);
    expect(texts).toEqual(["🏆 Beto venceu!"]);
    expect(diffDobble(toView(over), toView(over), ctx).items).toEqual([]);
  });
});
