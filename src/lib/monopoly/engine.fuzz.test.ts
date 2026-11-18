import { describe, expect, it } from "vitest";
import {
  MonoState,
  Result,
  acceptTrade,
  actionsFor,
  alivePlayers,
  build,
  buyProperty,
  cancelTrade,
  declareBankruptcy,
  declineProperty,
  declineTrade,
  endTurn,
  forfeit,
  mortgage,
  passBid,
  payBail,
  payDebt,
  placeBid,
  proposeTrade,
  roll,
  sellBuilding,
  spendJailCard,
  supply,
  unmortgage,
} from "./engine";
import { HOTELS_TOTAL, HOUSES_TOTAL, getEdition, groupSquares, isOwnable } from "./editions";
import { mulberry32 } from "../random";
import { game } from "./testKit";

// Fuzzer do motor: joga partidas inteiras escolhendo, a cada passo, uma ação ALEATÓRIA entre as que
// `actionsFor` diz que são legais (e de vez em quando uma proposta de troca, uma desistência ou uma
// ação ilegal de propósito). O que importa não é jogar bem, é que NENHUMA sequência de ações quebre
// uma invariante do jogo. (Os bots têm a própria simulação em simulation.test.ts.)

function ensure(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function checkInvariants(s: MonoState, label: string) {
  const ed = getEdition(s.edition);
  const ids = new Set(s.players.map((p) => p.id));
  for (const p of s.players) {
    ensure(Number.isInteger(p.cash) && p.cash >= 0, `${label}: dinheiro inválido de ${p.id}: ${p.cash}`);
    ensure(p.pos >= 0 && p.pos < 40, `${label}: posição inválida`);
    if (p.bankrupt) ensure(p.cash === 0 && p.jailCards.length === 0, `${label}: falido com bens`);
    if (p.jail !== null && !p.bankrupt) ensure(p.pos === ed.jailIndex, `${label}: preso fora da prisão`);
  }
  s.props.forEach((pr, i) => {
    const sq = ed.squares[i];
    if (!isOwnable(sq)) return ensure(pr === null, `${label}: casa sem dono tem estado`);
    ensure(pr !== null, `${label}: propriedade sem estado`);
    if (pr.owner !== null) ensure(ids.has(pr.owner) && !s.players.find((p) => p.id === pr.owner)!.bankrupt, `${label}: dono falido/inexistente na casa ${i}`);
    if (pr.owner === null) ensure(pr.houses === 0 && !pr.mortgaged, `${label}: casa livre com construção/hipoteca (${i})`);
    if (pr.houses > 0) {
      ensure(sq.kind === "street" && pr.houses <= 5, `${label}: construção inválida em ${i}`);
      ensure(!pr.mortgaged, `${label}: hipotecada com casas (${i})`);
      const group = groupSquares(ed, (sq as { group: string }).group);
      ensure(group.every((j) => s.props[j]!.owner === pr.owner && !s.props[j]!.mortgaged), `${label}: construção sem o grupo inteiro (${i})`);
      const hs = group.map((j) => s.props[j]!.houses);
      ensure(Math.max(...hs) - Math.min(...hs) <= 1, `${label}: construção desparelha no grupo de ${i}: ${hs}`);
    }
  });
  const sup = supply(s);
  ensure(sup.houses >= 0 && sup.houses <= HOUSES_TOTAL && sup.hotels >= 0 && sup.hotels <= HOTELS_TOTAL, `${label}: estoque do banco ${JSON.stringify(sup)}`);

  // Cartas conservadas: no baralho ou na mão de alguém (de prisão), nunca duplicadas nem sumidas.
  for (const deck of ["chance", "chest"] as const) {
    const held = s.players.flatMap((p) => p.jailCards.filter((c) => c.deck === deck).map((c) => c.idx));
    const all = [...s.decks[deck], ...held].sort((a, b) => a - b);
    ensure(JSON.stringify(all) === JSON.stringify(ed.decks[deck].map((_, i) => i)), `${label}: baralho ${deck} perdeu/duplicou cartas`);
  }

  if (s.phase === "playing") {
    ensure(!s.players[s.turn].bankrupt, `${label}: vez de falido`);
    ensure(alivePlayers(s).length >= 2, `${label}: partida rolando com menos de 2 vivos`);
    ensure((s.step === "debt") === (s.debt !== null), `${label}: step debt × debt`);
    ensure((s.step === "auction") === (s.auction !== null), `${label}: step auction × auction`);
    if (s.auction) {
      ensure(s.auction.order.every((id) => !s.players.find((p) => p.id === id)!.bankrupt), `${label}: falido no leilão`);
      ensure(s.auction.order.includes(s.auction.bidder), `${label}: quem dá lance não está na ordem`);
    }
    if (s.trade) {
      ensure(!s.players.find((p) => p.id === s.trade!.from)!.bankrupt && !s.players.find((p) => p.id === s.trade!.to)!.bankrupt, `${label}: troca com falido`);
    }
  } else if (s.phase === "game_over") {
    ensure(s.winnerId !== null && s.standings !== null && s.standings.length === s.players.length, `${label}: fim sem classificação`);
    ensure(s.standings![0].playerId === s.winnerId, `${label}: vencedor não é o 1º`);
  }
}

type Move = () => Result;
/** legal = o motor TEM que aceitar; illegal = TEM que recusar sem mexer em nada; maybe = tanto faz (entrada aleatória). */
type Kind = "legal" | "illegal" | "maybe";

/** Todas as jogadas legais agora (e quem as faz), mais algumas de propósito ilegais ou duvidosas. */
function movesFor(s: MonoState, rng: () => number): { who: string; move: Move; kind: Kind }[] {
  const out: { who: string; move: Move; kind: Kind }[] = [];
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  for (const p of alivePlayers(s)) {
    const a = actionsFor(s, p.id);
    const add = (move: Move, kind: Kind = "legal") => out.push({ who: p.id, move, kind });
    if (a.roll) add(() => roll(s, p.id, rng));
    if (a.payBail) add(() => payBail(s, p.id));
    if (a.useJailCard) add(() => spendJailCard(s, p.id));
    if (a.buy) for (let i = 0; i < 3; i++) add(() => buyProperty(s, p.id));
    if (a.decline) add(() => declineProperty(s, p.id));
    if (a.endTurn) for (let i = 0; i < 3; i++) add(() => endTurn(s, p.id));
    if (a.payDebt) for (let i = 0; i < 3; i++) add(() => payDebt(s, p.id, rng));
    if (a.bankrupt) add(() => declareBankruptcy(s, p.id));
    if (a.bid) add(() => placeBid(s, p.id, a.minBid + Math.floor(rng() * Math.max(1, Math.min(a.maxBid - a.minBid, 120)))));
    if (a.passBid) add(() => passBid(s, p.id));
    if (a.respondTrade) {
      add(() => acceptTrade(s, p.id));
      add(() => declineTrade(s, p.id));
    }
    if (a.cancelTrade) add(() => cancelTrade(s, p.id));
    for (const i of a.build) add(() => build(s, p.id, i));
    for (const i of a.sell) add(() => sellBuilding(s, p.id, i));
    // hipotecar/tirar hipoteca em loop dominaria o sorteio sem explorar nada: entram só às vezes
    for (const i of a.mortgage) if (rng() < 0.25) add(() => mortgage(s, p.id, i));
    for (const i of a.unmortgage) if (rng() < 0.25) add(() => unmortgage(s, p.id, i));
    if (a.propose && rng() < 0.4) {
      const others = alivePlayers(s).filter((q) => q.id !== p.id);
      const to = pick(others);
      const mine = s.props.flatMap((pr, i) => (pr?.owner === p.id ? [i] : []));
      const theirs = s.props.flatMap((pr, i) => (pr?.owner === to.id ? [i] : []));
      add(
        () =>
          proposeTrade(s, p.id, {
            to: to.id,
            give: { cash: Math.floor(rng() * 300), props: mine.length && rng() < 0.6 ? [pick(mine)] : [] },
            take: { cash: Math.floor(rng() * 200), props: theirs.length && rng() < 0.6 ? [pick(theirs)] : [] },
          }),
        "maybe",
      );
    }
    if (a.resign && rng() < 0.002) add(() => forfeit(s, p.id));
    // ilegais de propósito: o motor tem que RECUSAR sem mexer no estado
    if (!a.buy) add(() => buyProperty(s, p.id), "illegal");
    if (!a.endTurn) add(() => endTurn(s, p.id), "illegal");
    if (!a.roll) add(() => roll(s, p.id, rng), "illegal");
    if (!a.payDebt) add(() => payDebt(s, p.id, rng), "illegal");
    // casa qualquer (inclusive fora do tabuleiro): pode ou não valer, mas nunca derruba o motor
    const any = Math.floor(rng() * 50) - 5;
    add(() => build(s, p.id, any), "maybe");
    add(() => mortgage(s, p.id, any), "maybe");
  }
  return out;
}

function playRandomGame(seed: number, edition: "monopoly" | "banco", limit: number, players: number, poor = false): { steps: number; over: boolean; bankrupts: number } {
  const rng = mulberry32(seed);
  let s = game({ edition, players: ["a", "b", "c", "d", "e", "f"].slice(0, players), limit });
  // "poor": todo mundo começa quase sem dinheiro — aluguel, imposto e carta viram dívida e falência de verdade
  if (poor) s = { ...s, players: s.players.map((p) => ({ ...p, cash: 150 + Math.floor(rng() * 150) })) };
  let steps = 0;
  const cap = limit ? 12_000 : 2_500;
  while (s.phase === "playing" && steps < cap) {
    const moves = movesFor(s, rng);
    // prefere quem JÁ está sendo esperado (senão a partida quase nunca anda): a vez, o leilão, a troca
    const actor = s.trade ? s.trade.to : s.step === "auction" ? s.auction!.bidder : s.players[s.turn].id;
    const mine = moves.filter((m) => m.who === actor);
    const pool = rng() < 0.92 && mine.length ? mine : moves;
    const m = pool[Math.floor(rng() * pool.length)];
    const before = s;
    const snapshot = m.kind === "legal" ? "" : JSON.stringify(before);
    const r = m.move();
    if (r.ok) {
      ensure(m.kind !== "illegal", `seed ${seed} passo ${steps}: o motor aceitou uma ação que a tela nem oferece (${m.who})`);
      ensure(r.state.eventSeq === before.eventSeq + 1, `seed ${seed}: eventSeq não subiu`);
      s = r.state;
    } else {
      ensure(m.kind !== "legal", `seed ${seed} passo ${steps}: ação legal recusada (${r.error}) por ${m.who}`);
      // recusa não muda nada: o estado antigo continua exatamente igual
      ensure(JSON.stringify(before) === snapshot, `seed ${seed}: uma ação recusada alterou o estado`);
    }
    checkInvariants(s, `seed ${seed} passo ${steps}`);
    steps++;
  }
  return { steps, over: s.phase === "game_over", bankrupts: s.players.filter((p) => p.bankrupt).length };
}

describe("fuzzer do motor (ações aleatórias legais)", () => {
  for (const edition of ["monopoly", "banco"] as const) {
    it(`${edition}: 25 partidas de 2–6 pessoas com limite de rodadas nunca quebram uma invariante e sempre terminam`, () => {
      let finished = 0;
      for (let seed = 1; seed <= 25; seed++) {
        const r = playRandomGame(seed * 7919, edition, 12, 2 + (seed % 5));
        if (r.over) finished++;
      }
      expect(finished).toBe(25);
    });

    it(`${edition}: sem limite, 12 partidas seguem consistentes até o teto de passos`, () => {
      for (let seed = 1; seed <= 12; seed++) playRandomGame(seed * 104729, edition, 0, 2 + (seed % 5));
    });

    it(`${edition}: começando sem dinheiro há dívidas e falências de verdade — e tudo continua consistente`, () => {
      let bankrupts = 0;
      for (let seed = 1; seed <= 30; seed++) bankrupts += playRandomGame(seed * 15485863, edition, 0, 2 + (seed % 5), true).bankrupts;
      expect(bankrupts).toBeGreaterThan(20);
    });
  }
});
