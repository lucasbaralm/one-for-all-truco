import { afterEach, describe, expect, it, vi } from "vitest";
import FodinhaRoom from "./server";
import { FakeConn, makeHarness, stubSupabase } from "./test-utils";
import type { GameState } from "../src/lib/game/state-machine";
import { createTestState } from "../src/lib/game/testHelpers";
import { mulberry32 } from "../src/lib/random";

// Testes de integração do room server da Fodinha (party/server.ts): mensagens
// de verdade entrando por conexões de mentira, com o Supabase de mentira
// (party/test-utils.ts). Os estados "montados à mão" entram pelo mesmo caminho
// de produção — a linha da sala no banco, lida em onStart — pra a gente
// controlar quais cartas cada um tem sem depender de sorteio.

type Sent = { type?: string; state?: GameState; winnerId?: string; cards?: unknown[]; emoji?: string };
const allState = (c: FakeConn) => (c.sent as Sent[]).filter((m) => m.type === "state").map((m) => m.state!);
const lastState = (c: FakeConn) => allState(c).at(-1);
const tricks = (c: FakeConn) => (c.sent as Sent[]).filter((m) => m.type === "trick_result");

const VIRA = { suit: "diamonds", value: "J" } as const; // manilha = Q (nenhuma nas mãos dos testes)

async function setup(roomState?: GameState) {
  vi.useFakeTimers();
  const history: { room_id: string; winner_name: string; players_summary: { name: string; score: number }[] }[] = [];
  const writes: { id: string; state: GameState }[] = [];
  stubSupabase(history, { roomRows: roomState ? { ABCD: roomState } : {}, roomWrites: writes });
  const h = makeHarness(FodinhaRoom);
  await h.server.onStart!();
  return { ...h, history, writes };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("autenticação", () => {
  it("recusa conexão sem token, com token inválido e com nome que não é o dono do token", async () => {
    const { connect } = await setup();
    expect((await connect("Alice", "")).closed).toEqual([[4001, "missing auth"]]);
    expect((await connect("Alice", "token-que-nao-existe")).closed).toEqual([[4001, "unauthorized"]]);
    expect((await connect("Mallory", "user:Alice")).closed).toEqual([[4001, "identity mismatch"]]);
  });

  it("recusa (sem derrubar o servidor) quando o Supabase está fora do ar", async () => {
    const { connect } = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await connect("Alice")).closed).toEqual([[4001, "auth check failed"]]);
  });

  it("aceita o dono do token", async () => {
    const { connect } = await setup();
    expect((await connect("Alice")).closed).toEqual([]);
  });
});

describe("estado salvo da sala", () => {
  it("quem conecta recebe a partida que já estava rolando (sobrevive a reinício do servidor)", async () => {
    const saved = createTestState({
      vira: VIRA,
      hands: [{ id: "Alice", cards: [{ suit: "hearts", value: "5" }] }, { id: "Bob", cards: [{ suit: "clubs", value: "5" }] }],
    });
    const { connect } = await setup(saved);
    const alice = await connect("Alice");
    expect(lastState(alice)).toMatchObject({ phase: "playing", currentRoundCards: 1 });
    expect(lastState(alice)!.players.map((p) => p.id)).toEqual(["Alice", "Bob"]);
  });

  it("sala nova (sem linha no banco): nada é enviado até alguém iniciar", async () => {
    const { connect } = await setup();
    expect((await connect("Alice")).sent).toEqual([]);
  });
});

describe("início de partida", () => {
  const two = [
    { id: "Alice", name: "Alice" },
    { id: "Bob", name: "Bob" },
  ];

  it("start_game cria a partida pra todos, persiste a sala e é idempotente", async () => {
    const { connect, say, writes } = await setup();
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(alice, { type: "start_game", players: two });
    expect(lastState(bob)).toMatchObject({ phase: "shuffling", currentRoundCards: 1 });
    expect(lastState(bob)!.players.map((p) => p.id)).toEqual(["Alice", "Bob"]);
    expect(writes.at(-1)).toMatchObject({ id: "ABCD", state: { phase: "shuffling" } });

    // Cada cliente manda start_game ao conectar: o segundo não pode pisar numa partida rolando.
    const before = allState(bob).length;
    await say(bob, { type: "start_game", players: [{ id: "Bob", name: "Bob" }] });
    expect(allState(bob)).toHaveLength(before);
  });

  it("depois do fim da partida, start_game recomeça do zero", async () => {
    const over = { ...createTestState({ vira: VIRA, hands: [{ id: "Alice", cards: [], score: 7 }, { id: "Bob", cards: [], score: 2 }] }), phase: "game_over" as const };
    const { connect, say } = await setup(over);
    const alice = await connect("Alice");
    await say(alice, { type: "start_game", players: two });
    expect(lastState(alice)).toMatchObject({ phase: "shuffling" });
    expect(lastState(alice)!.players.every((p) => p.score === 0)).toBe(true);
  });

  it("ignora ação em nome de outro jogador (o playerId precisa ser o da identidade verificada)", async () => {
    const saved = createTestState({
      phase: "betting",
      vira: VIRA,
      currentPlayerIndex: 0,
      hands: [{ id: "Alice", cards: [{ suit: "hearts", value: "5" }] }, { id: "Bob", cards: [{ suit: "clubs", value: "5" }] }],
    });
    const { connect, say } = await setup(saved);
    const bob = await connect("Bob");
    const before = allState(bob).length;
    await say(bob, { type: "bet", playerId: "Alice", bet: 1 }); // Bob tentando apostar como Alice
    expect(allState(bob)).toHaveLength(before);
  });

  it("mensagem quebrada ou de conexão sem identidade não derruba nada", async () => {
    const { connect, say, server } = await setup();
    const alice = await connect("Alice");
    await server.onMessage!("isso não é json", alice as never);
    await server.onMessage!(new ArrayBuffer(4), alice as never);
    const mallory = await connect("Mallory", "user:Alice");
    await say(mallory, { type: "start_game", players: two });
    expect(alice.sent).toEqual([]);
  });
});

describe("apostas", () => {
  const betting = () =>
    createTestState({
      phase: "betting",
      vira: VIRA,
      currentPlayerIndex: 1, // Bob aposta primeiro (dealer é a Alice)
      hands: [
        { id: "Alice", cards: [{ suit: "hearts", value: "5" }, { suit: "spades", value: "4" }] },
        { id: "Bob", cards: [{ suit: "clubs", value: "5" }, { suit: "diamonds", value: "4" }] },
      ],
    });

  it("segue a ordem, recusa aposta fora da vez e a aposta que 'fecha' a conta; depois libera as jogadas", async () => {
    const { connect, say } = await setup(betting());
    const alice = await connect("Alice");
    const bob = await connect("Bob");

    await say(alice, { type: "bet", playerId: "Alice", bet: 0 }); // fora da vez
    expect(lastState(alice)!.players[0].bet).toBeNull();

    await say(bob, { type: "bet", playerId: "Bob", bet: 1 });
    expect(lastState(alice)!.players[1].bet).toBe(1);

    await say(alice, { type: "bet", playerId: "Alice", bet: 1 }); // 1 + 1 = 2 cartas: fecharia a conta
    expect(lastState(alice)!.players[0].bet).toBeNull();

    await say(alice, { type: "bet", playerId: "Alice", bet: 0 });
    expect(lastState(bob)).toMatchObject({ phase: "playing", currentPlayerIndex: 1 });
  });
});

describe("vazas e fim de rodada (com 'segurar a vaza' antes de avançar)", () => {
  // 3 cartas cada: assim existem 2 vazas "no meio" da rodada (a última vaza nunca é segurada).
  const playing = () =>
    createTestState({
      vira: VIRA,
      currentPlayerIndex: 1, // Bob abre
      hands: [
        { id: "Alice", cards: [{ suit: "hearts", value: "5" }, { suit: "spades", value: "4" }, { suit: "hearts", value: "4" }] },
        { id: "Bob", cards: [{ suit: "clubs", value: "5" }, { suit: "diamonds", value: "4" }, { suit: "clubs", value: "4" }] },
      ],
    });

  it("a vaza fechada fica visível 1,2s (2s se quem jogou por último ganhou) antes de o estado avançar", async () => {
    const { connect, say } = await setup(playing());
    const alice = await connect("Alice");
    const bob = await connect("Bob");

    // Bob (paus 5) abre e Alice (copas 5) joga por último: Bob ganha, não foi o último → 1200ms
    await say(bob, { type: "play_card", playerId: "Bob", cardIndex: 0 });
    await say(alice, { type: "play_card", playerId: "Alice", cardIndex: 0 });
    expect(tricks(alice)).toHaveLength(1);
    expect(tricks(alice)[0]).toMatchObject({ winnerId: "Bob" });
    const afterPlay = allState(alice).length;
    await vi.advanceTimersByTimeAsync(1199);
    expect(allState(alice)).toHaveLength(afterPlay); // nada de estado novo durante a revelação
    await vi.advanceTimersByTimeAsync(2);
    const s = lastState(alice)!;
    expect(s.tableCards).toEqual([]);
    expect(s.players[1].tricks).toBe(1);
    expect(s.currentPlayerIndex).toBe(1); // o vencedor abre a próxima vaza

    // Bob abre de novo (ouros 4) e Alice responde com espadas 4: espadas > ouros, Alice ganha
    // jogando POR ÚLTIMO → a revelação é mais longa (2000ms).
    await say(bob, { type: "play_card", playerId: "Bob", cardIndex: 0 });
    await say(alice, { type: "play_card", playerId: "Alice", cardIndex: 0 });
    expect(tricks(alice)).toHaveLength(2);
    expect(tricks(alice)[1]).toMatchObject({ winnerId: "Alice" });
    const held = allState(alice).length;
    await vi.advanceTimersByTimeAsync(1999);
    expect(allState(alice)).toHaveLength(held);
    await vi.advanceTimersByTimeAsync(2);
    expect(lastState(alice)).toMatchObject({ currentPlayerIndex: 0 }); // Alice abre a 3ª vaza
    expect(lastState(alice)!.players[0].tricks).toBe(1);
  });

  it("jogada inválida (fora da vez ou carta que não existe) não muda a partida — e o servidor reenvia o estado certo", async () => {
    const { connect, say } = await setup(playing());
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    const real = lastState(alice)!;

    // Reenviar o estado autoritativo é o que faz o cliente que PREVIU a jogada
    // (previsão otimista) voltar pro estado verdadeiro.
    await say(alice, { type: "play_card", playerId: "Alice", cardIndex: 0 }); // é a vez do Bob
    expect(lastState(alice)).toEqual(real);
    await say(bob, { type: "play_card", playerId: "Bob", cardIndex: 9 }); // carta que não existe
    expect(lastState(alice)).toEqual(real);
    expect(tricks(alice)).toHaveLength(0);
    expect(lastState(alice)!.tableCards).toEqual([]);
  });

  it("última vaza: placar aparece na hora, e a próxima rodada começa sozinha depois de ~6s", async () => {
    const last = createTestState({
      vira: VIRA,
      currentPlayerIndex: 1,
      hands: [{ id: "Alice", cards: [{ suit: "hearts", value: "5" }] }, { id: "Bob", cards: [{ suit: "clubs", value: "5" }] }],
    });
    const { connect, say, writes } = await setup(last);
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(bob, { type: "play_card", playerId: "Bob", cardIndex: 0 });
    await say(alice, { type: "play_card", playerId: "Alice", cardIndex: 0 });

    // Bob ganhou a vaza mas tinha apostado 0 → leva 1 de dano; Alice acertou.
    expect(lastState(alice)).toMatchObject({ phase: "round_end" });
    expect(lastState(alice)!.players.map((p) => p.score)).toEqual([0, 1]);

    await vi.advanceTimersByTimeAsync(5900);
    expect(lastState(alice)!.phase).toBe("round_end");
    await vi.advanceTimersByTimeAsync(200);
    const next = lastState(alice)!;
    expect(next).toMatchObject({ phase: "shuffling", currentRoundCards: 2, dealerIndex: 1 });
    expect(writes.at(-1)!.state.phase).toBe("shuffling"); // e foi salvo no banco
  });
});

describe("votação pra encerrar", () => {
  it("encerra quando metade dos CONECTADOS votou (aqui 2 de 4) e grava o histórico com o menor placar como vencedor", async () => {
    const four = createTestState({
      vira: VIRA,
      hands: ["Alice", "Bob", "Carol", "Dave"].map((id, i) => ({ id, cards: [{ suit: "hearts", value: "5" }], score: [5, 1, 3, 9][i] })),
    });
    const { connect, say, history } = await setup(four);
    const [alice, bob] = [await connect("Alice"), await connect("Bob"), await connect("Carol"), await connect("Dave")];

    await say(alice, { type: "vote_end", playerId: "Alice" });
    expect(lastState(alice)!.phase).toBe("playing");
    expect(lastState(alice)!.endVote).toEqual({ votes: ["Alice"] });
    await say(bob, { type: "vote_end", playerId: "Bob" });
    expect(lastState(alice)!.phase).toBe("game_over");

    await vi.waitFor(() => expect(history).toHaveLength(1));
    expect(history[0].room_id).toBe("ABCD");
    expect(history[0].winner_name).toBe("Bob");
    expect(history[0].players_summary.map((p) => p.score)).toEqual([1, 3, 5, 9]);
  });
});

describe("mensagens efêmeras", () => {
  it("emoji e aviso de embaralhar vão pros outros, sem mexer na partida nem exigir a vez", async () => {
    const { connect, say } = await setup();
    const alice = await connect("Alice");
    const bob = await connect("Bob");
    await say(alice, { type: "emoji", emoji: "🎉", fromPlayerId: "Alice" });
    await say(alice, { type: "shuffle_announce", dealerName: "Alice", label: "✂️ Cortar" });
    expect((bob.sent as Sent[]).map((m) => m.type)).toEqual(["emoji", "shuffle_announce"]);
    expect(alice.sent).toEqual([]); // quem mandou não recebe de volta
  });
});

describe("bots (Modo Teste)", () => {
  it("esperam a vez deles e a partida segue quando o humano age", async () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(3));
    const { connect, say } = await setup();
    const alice = await connect("Alice");
    await say(alice, { type: "start_game", players: [{ id: "Alice", name: "Alice" }, { id: "bot:1", name: "Robô 1" }] });
    // A Alice (host) é quem embaralha na primeira rodada: nada acontece sem ela.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lastState(alice)!.phase).toBe("shuffling");

    await say(alice, { type: "shuffle", playerId: "Alice", style: "random" });
    expect(lastState(alice)!.phase).toBe("betting");
    // O bot é o primeiro a apostar: ele aposta sozinho, depois do atraso humanizado.
    await vi.advanceTimersByTimeAsync(1300);
    const s = lastState(alice)!;
    expect(s.players[1].bet).not.toBeNull();
    expect(s.players[s.currentPlayerIndex].id).toBe("Alice"); // agora espera a Alice
    await vi.advanceTimersByTimeAsync(10_000);
    expect(lastState(alice)!.players[0].bet).toBeNull();
  });

  it("uma partida inteira só de bots termina sozinha, com estados sempre válidos e o histórico gravado", async () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(11));
    const { connect, say, history, writes } = await setup();
    const watcher = await connect("Alice");
    const bots = [1, 2, 3, 4].map((n) => ({ id: `bot:${n}`, name: `Robô ${n}` }));
    await say(watcher, { type: "start_game", players: bots });

    let steps = 0;
    while (lastState(watcher)!.phase !== "game_over" && steps++ < 4000) await vi.advanceTimersByTimeAsync(500);
    const end = lastState(watcher)!;
    expect(end.phase).toBe("game_over");

    // 4 jogadores: o baralho de 40 sustenta até 9 cartas por jogador
    expect(Math.max(...allState(watcher).map((s) => s.currentRoundCards))).toBe(9);

    // toda foto do jogo é válida: cartas únicas entre mãos, mesa e vira
    for (const s of allState(watcher)) {
      const cards = [...s.players.flatMap((p) => p.cards), ...s.tableCards.map((t) => t.card), ...(s.vira ? [s.vira] : [])];
      const keys = cards.map((c) => `${c.suit}-${c.value}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    // o placar só sobe
    let prev = [0, 0, 0, 0];
    for (const s of allState(watcher)) {
      const scores = s.players.map((p) => p.score);
      scores.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(prev[i]));
      prev = scores;
    }

    await vi.waitFor(() => expect(history).toHaveLength(1));
    const ranking = history[0].players_summary.map((p) => p.score);
    expect([...ranking].sort((a, b) => a - b)).toEqual(ranking); // do menor (vencedor) pro maior
    expect(history[0].winner_name).toBe(history[0].players_summary[0].name);
    expect(writes.at(-1)!.state.phase).toBe("game_over");
  });
});
