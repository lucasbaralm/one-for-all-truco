import { describe, expect, it } from "vitest";
import { FINISHED, IN_BASE } from "./board";
import { addBot, createLobby, joinLobby, LudoState, startGame } from "./engine";
import { FeedCtx, describeMove, describePresence, describeRoll, diffLudo } from "./feed";

const ctx: FeedCtx = { me: "ana", hex: (c) => `#${c}` };

function room(): LudoState {
  const j1 = joinLobby(createLobby(), { id: "ana", name: "Ana" });
  if (!j1.ok) throw new Error(j1.error);
  const b = addBot(j1.state, "easy");
  if (!b.ok) throw new Error(b.error);
  const st = startGame(b.state, () => 0);
  if (!st.ok) throw new Error(st.error);
  return st.state;
}

/** Estado "depois de" uma rolada/jogada, sem passar pelo engine (só interessa o que o histórico lê). */
const withRoll = (s: LudoState, playerId: string, value: number, forfeited = false): LudoState => ({
  ...s,
  phase: "moving",
  dice: value,
  rollSeq: s.rollSeq + 1,
  lastRoll: { seq: s.rollSeq + 1, playerId, value, forfeited },
});

describe("describeRoll", () => {
  it("diz quem rolou o quê — 'Você' pra quem está olhando, 6 em destaque", () => {
    const s = room();
    const mine = describeRoll(withRoll(s, "ana", 3), ctx)!;
    expect(mine.text).toMatch(/Você rolou 3/);
    expect(mine.tone).toBe("info");
    const bot = describeRoll(withRoll(s, "bot:1", 6), ctx)!;
    expect(bot.text).toMatch(/Robô Zeca rolou 6/);
    expect(bot.tone).toBe("special");
  });

  it("rolada sem jogada possível avisa; três 6 seguidos perdem a vez", () => {
    const s = room(); // todas as peças na base: só o 6 tem jogada
    expect(describeRoll(withRoll(s, "ana", 3), ctx)!.text).toMatch(/sem jogada/);
    expect(describeRoll(withRoll(s, "ana", 6), ctx)!.text).not.toMatch(/sem jogada/);
    const forfeit = describeRoll(withRoll(s, "bot:1", 6, true), ctx)!;
    expect(forfeit.text).toMatch(/três 6 seguidos e perdeu a vez/);
    expect(forfeit.tone).toBe("bad");
  });

  it("sem rolada não escreve nada", () => {
    expect(describeRoll(room(), ctx)).toBeNull();
  });
});

describe("describeMove", () => {
  const move = (s: LudoState, over: Partial<NonNullable<LudoState["lastMove"]>>): LudoState => ({
    ...s,
    moveSeq: s.moveSeq + 1,
    lastMove: { seq: s.moveSeq + 1, playerId: "ana", piece: 0, from: 3, to: 7, dice: 4, captures: [], finished: false, ...over },
  });

  it("andar normal não entra no histórico", () => {
    expect(describeMove(move(room(), {}), ctx)).toEqual([]);
    expect(describeMove(room(), ctx)).toEqual([]);
  });

  it("tirar peça da base", () => {
    const out = describeMove(move(room(), { from: IN_BASE, to: 0, dice: 6 }), ctx);
    expect(out.map((e) => e.text)).toEqual(["Você tirou uma peça da base"]);
  });

  it("captura: boa pra quem captura, ruim pra quem perde a peça, neutra pra quem assiste", () => {
    const s = room();
    const byMe = describeMove(move(s, { captures: [{ playerId: "bot:1", piece: 0, from: 5 }] }), ctx)[0];
    expect(byMe).toMatchObject({ tone: "good" });
    expect(byMe.text).toBe("💥 Você capturou uma peça de Robô Zeca!");

    const onMe = describeMove(move(s, { playerId: "bot:1", captures: [{ playerId: "ana", piece: 1, from: 9 }] }), ctx)[0];
    expect(onMe).toMatchObject({ tone: "bad" });
    expect(onMe.text).toBe("💥 Robô Zeca capturou uma peça sua!");

    const watcher: FeedCtx = { me: "outro", hex: ctx.hex };
    const seen = describeMove(move(s, { playerId: "bot:1", captures: [{ playerId: "ana", piece: 1, from: 9 }] }), watcher)[0];
    expect(seen).toMatchObject({ tone: "special" });
    expect(seen.text).toBe("💥 Robô Zeca capturou uma peça de Ana!");
  });

  it("chegar em casa mostra quantas já chegaram", () => {
    const s = room();
    const pieces = [FINISHED, FINISHED, 20, IN_BASE];
    const st = { ...s, players: s.players.map((p) => (p.id === "ana" ? { ...p, pieces } : p)) };
    const out = describeMove(move(st, { from: 50, to: FINISHED, finished: true }), ctx);
    expect(out[0].text).toBe("🏠 Você colocou uma peça em casa (2/4)");
  });

  it("captura E chegada na mesma jogada geram duas linhas, na ordem", () => {
    const out = describeMove(move(room(), { captures: [{ playerId: "bot:1", piece: 0, from: 5 }], finished: true }), ctx);
    expect(out.map((e) => e.text.slice(0, 2))).toEqual(["💥", "🏠"]);
  });
});

describe("describePresence", () => {
  it("avisa quando um humano cai ou volta — nunca de si mesmo nem de bot", () => {
    const s = room();
    const other: LudoState = { ...s, players: [...s.players, { id: "bia", name: "Bia", color: "green", connected: true, pieces: [-1, -1, -1, -1] }] };
    const dropped: LudoState = { ...other, players: other.players.map((p) => (p.id === "bia" ? { ...p, connected: false } : p)) };
    expect(describePresence(other, dropped, ctx).map((e) => e.text)).toEqual(["📡 Bia desconectou — um bot assume"]);
    expect(describePresence(dropped, other, ctx).map((e) => e.text)).toEqual(["📡 Bia voltou pra partida"]);
    const meGone: LudoState = { ...s, players: s.players.map((p) => (p.id === "ana" ? { ...p, connected: false } : p)) };
    expect(describePresence(s, meGone, ctx)).toEqual([]);
  });
});

describe("diffLudo", () => {
  it("partida nova (vinda do lobby) zera a lista e anuncia quem começa", () => {
    const started = room();
    const lobby = { ...started, phase: "lobby" as const };
    const d = diffLudo(lobby, started, ctx);
    expect(d.reset).toBe(true);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].text).toMatch(/Partida começou/);
  });

  it("voltar pro lobby só zera", () => {
    const lobby = { ...room(), phase: "lobby" as const };
    expect(diffLudo(room(), lobby, ctx)).toEqual({ reset: true, items: [] });
  });

  it("primeira tela de uma partida que já estava no meio (recarregou) não inventa histórico", () => {
    const mid = withRoll(room(), "ana", 4);
    expect(diffLudo(null, mid, ctx)).toEqual({ reset: true, items: [] });
  });

  it("primeira tela de uma partida que ainda nem teve rolada ('contra bots', sem lobby) anuncia o começo", () => {
    const d = diffLudo(null, room(), ctx);
    expect(d.reset).toBe(true);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].text).toMatch(/Partida começou — (você começa|Robô Zeca começa)/);
  });

  it("rolada nova entra; o mesmo estado de novo não repete", () => {
    const s = room();
    const rolled = withRoll(s, "bot:1", 5);
    const d = diffLudo(s, rolled, ctx);
    expect(d.reset).toBe(false);
    expect(d.items).toHaveLength(1);
    expect(diffLudo(rolled, rolled, ctx).items).toEqual([]);
  });

  it("fim de jogo anuncia o vencedor (uma vez)", () => {
    const s = room();
    const over: LudoState = { ...s, phase: "game_over", winnerId: "ana" };
    expect(diffLudo(s, over, ctx).items.map((e) => e.text)).toEqual(["🏆 Você venceu!"]);
    expect(diffLudo(over, over, ctx).items).toEqual([]);
    expect(diffLudo(s, { ...over, winnerId: "bot:1" }, ctx).items[0].text).toBe("🏆 Robô Zeca venceu!");
  });
});
