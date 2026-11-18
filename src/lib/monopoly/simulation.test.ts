import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/random";
import { MonoController, nextAutoAction } from "./controller";
import { HOTELS_TOTAL, HOUSES_TOTAL, getEdition, groupSquares, isOwnable } from "./editions";
import type { EditionId } from "./editions";
import { BotLevel, MonoEvent, MonoState, addBot, createLobby, setSettings, startGame, supply } from "./engine";
import { must } from "./testKit";

// Partidas INTEIRAS só de bots, síncronas (sem esperar timer: o laço pergunta "o que acontece agora?"
// a `nextAutoAction` e despacha), nas duas edições e nos três níveis, com várias sementes. O que se
// confere: TODA ação do bot é aceita pelo motor, a partida termina dentro de um teto de ações e as
// invariantes do jogo valem a cada passo. `ensure` em vez de `expect` no laço quente: milhões de
// expects deixam o teste lento.

function ensure(cond: unknown, msg: () => string): asserts cond {
  if (!cond) throw new Error(msg());
}

const EDITIONS: EditionId[] = ["monopoly", "banco"];
const LEVELS: BotLevel[] = ["easy", "medium", "hard"];
const MAX_ACTIONS = 20_000;

function checkInvariants(s: MonoState, label: string) {
  const ed = getEdition(s.edition);
  const alive = new Set(s.players.filter((p) => !p.bankrupt).map((p) => p.id));
  for (const p of s.players) {
    if (p.bankrupt) continue;
    ensure(Number.isInteger(p.cash) && p.cash >= 0, () => `${label}: dinheiro inválido de ${p.id}: ${p.cash}`);
  }
  s.props.forEach((pr, i) => {
    const sq = ed.squares[i];
    if (!isOwnable(sq) || !pr) return;
    ensure(pr.owner === null || alive.has(pr.owner), () => `${label}: dono falido/inexistente na casa ${i}`);
    if (pr.houses === 0) return;
    ensure(sq.kind === "street" && pr.houses <= 5 && !pr.mortgaged, () => `${label}: construção inválida em ${i}`);
    const group = groupSquares(ed, (sq as { group: string }).group);
    ensure(group.every((j) => s.props[j]!.owner === pr.owner && !s.props[j]!.mortgaged), () => `${label}: casa sem o grupo inteiro (${i})`);
  });
  const sup = supply(s);
  ensure(sup.houses >= 0 && sup.houses <= HOUSES_TOTAL && sup.hotels >= 0 && sup.hotels <= HOTELS_TOTAL, () => `${label}: estoque do banco ${JSON.stringify(sup)}`);
  // Cartas conservadas: no baralho ou na mão de alguém (de prisão), nunca duplicadas nem sumidas.
  for (const deck of ["chance", "chest"] as const) {
    const held = s.players.flatMap((p) => p.jailCards.filter((c) => c.deck === deck).map((c) => c.idx));
    const all = [...s.decks[deck], ...held].sort((a, b) => a - b);
    ensure(JSON.stringify(all) === JSON.stringify(ed.decks[deck].map((_, i) => i)), () => `${label}: baralho ${deck} perdeu/duplicou cartas`);
  }
  if (s.phase === "playing") ensure(!s.players[s.turn].bankrupt, () => `${label}: vez de falido`);
}

interface Played {
  final: MonoState;
  actions: number;
  /** Quantas vezes cada tipo de evento apareceu na partida. */
  seen: Partial<Record<MonoEvent["t"], number>>;
}

/** `cap`: para quietamente nessa quantidade de ações (partida sem limite de rodadas pode não acabar: os bots não negociam). */
function playOut(edition: EditionId, levels: BotLevel[], seed: number, opts: { poor?: boolean; limit?: number; cap?: number } = {}): Played {
  const rng = mulberry32(seed);
  let lobby = createLobby(edition);
  for (const level of levels) lobby = must(addBot(lobby, level)).state;
  lobby = must(setSettings(lobby, { limit: opts.limit ?? 20 })).state;
  let start = must(startGame(lobby, rng)).state;
  // "poor": todo mundo começa quase sem dinheiro — aluguel, imposto e carta viram dívida e falência de verdade.
  if (opts.poor) start = { ...start, players: start.players.map((p) => ({ ...p, cash: 150 + Math.floor(rng() * 150) })) };
  const ctl = new MonoController(start, { rng, setTimer: () => 0, clearTimer: () => {} });
  ctl.setPaused(true); // sem timers: quem anda a partida é este laço

  const label = `${edition} ${levels.join("/")} seed ${seed}`;
  const seen: Played["seen"] = {};
  let actions = 0;
  while (ctl.state.phase === "playing" && actions < (opts.cap ?? Infinity)) {
    ensure(actions < MAX_ACTIONS, () => `${label}: a partida não terminou em ${MAX_ACTIONS} ações`);
    const auto = nextAutoAction(ctl.state, rng);
    ensure(auto, () => `${label} ação ${actions}: ninguém tem o que fazer (passo ${ctl.state.step}, vez de ${ctl.state.players[ctl.state.turn].id})`);
    const before = ctl.state.eventSeq;
    const r = ctl.dispatch(auto.actorId, auto.message);
    ensure(r.ok, () => `${label} ação ${actions}: recusada ${JSON.stringify(auto.message)} de ${auto.actorId} (${!r.ok && r.error}) no passo ${ctl.state.step}`);
    ensure(ctl.state.eventSeq === before + 1, () => `${label}: eventSeq não subiu`);
    for (const e of ctl.state.events) seen[e.t] = (seen[e.t] ?? 0) + 1;
    checkInvariants(ctl.state, `${label} ação ${actions}`);
    actions++;
  }
  return { final: ctl.state, actions, seen };
}

function ensureFinished({ final, actions }: Played, label: string, players: number) {
  ensure(final.phase === "game_over" && !!final.winnerId, () => `${label}: não acabou`);
  ensure(final.standings!.length === players && final.standings![0].playerId === final.winnerId, () => `${label}: classificação errada`);
  ensure(actions > 20, () => `${label}: partida relâmpago (${actions} ações)`);
}

describe("partidas inteiras só de bots (as duas edições, os três níveis)", () => {
  for (const edition of EDITIONS) {
    for (const level of LEVELS) {
      it(`${edition} / ${level}: 8 partidas de 4 bots terminam, toda ação é aceita e as invariantes valem a cada passo`, () => {
        for (let seed = 1; seed <= 8; seed++) {
          const played = playOut(edition, [level, level, level, level], seed * 101 + LEVELS.indexOf(level));
          ensureFinished(played, `${edition}/${level}/${seed}`, 4);
        }
      });
    }

    it(`${edition}: mesas mistas de 2 a 6 bots`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const n = 2 + (seed % 5);
        const levels = Array.from({ length: n }, (_, i) => LEVELS[(seed + i) % 3]);
        ensureFinished(playOut(edition, levels, seed * 7919), `${edition}/mista/${seed}`, n);
      }
    });

    it(`${edition}: começando sem dinheiro há dívidas e falências de verdade — e tudo continua consistente`, () => {
      let bankrupts = 0;
      let debts = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const n = 3 + (seed % 3);
        const levels = Array.from({ length: n }, (_, i) => LEVELS[(seed + i) % 3]);
        const played = playOut(edition, levels, seed * 15485863, { poor: true, limit: 40 });
        ensureFinished(played, `${edition}/pobre/${seed}`, n);
        bankrupts += played.seen.bankrupt ?? 0;
        debts += played.seen.debt ?? 0;
      }
      expect(debts).toBeGreaterThan(10);
      expect(bankrupts).toBeGreaterThan(5);
    });

    it(`${edition}: sem limite de rodadas, 6 partidas seguem consistentes até o teto de ações (e quem sobra sozinho vence)`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const n = 2 + (seed % 4);
        const levels = Array.from({ length: n }, (_, i) => LEVELS[(seed + i) % 3]);
        const played = playOut(edition, levels, seed * 104729, { poor: true, limit: 0, cap: 4000 });
        if (played.final.phase === "game_over") {
          ensure(played.seen.end === 1 && played.final.players.filter((p) => !p.bankrupt).length === 1, () => `${edition}/${seed}: fim sem um único sobrevivente`);
        }
      }
    });
  }

  it("o jogo todo acontece: compras, construções, hipotecas, prisão, cartas e (no Monopoly) leilões — nas partidas dos bots", () => {
    const total: Played["seen"] = {};
    for (const edition of EDITIONS) {
      for (let seed = 1; seed <= 6; seed++) {
        const { seen } = playOut(edition, ["medium", "hard", "hard", "easy"], seed * 31);
        for (const [t, n] of Object.entries(seen)) total[t as MonoEvent["t"]] = (total[t as MonoEvent["t"]] ?? 0) + (n ?? 0);
      }
    }
    for (const t of ["roll", "buy", "rent", "build", "jail", "card", "sold", "bid", "mortgage", "unmortgage", "sell"] as const) {
      expect(total[t] ?? 0, `nenhum evento ${t} em 12 partidas`).toBeGreaterThan(0);
    }
  });

  it("mesma semente, mesma partida; sementes diferentes, partidas diferentes", () => {
    const a = playOut("monopoly", ["medium", "hard", "easy"], 5);
    const b = playOut("monopoly", ["medium", "hard", "easy"], 5);
    expect(b.actions).toBe(a.actions);
    expect(b.final.winnerId).toBe(a.final.winnerId);
    expect(b.final.standings).toEqual(a.final.standings);
    expect(playOut("monopoly", ["medium", "hard", "easy"], 6).final.standings).not.toEqual(a.final.standings);
  });
});
