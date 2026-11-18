// IA dos bots do Monopoly / Banco Imobiliário. Três níveis:
//  • easy   — compra ao acaso (~60% das vezes que pode) e gasta tudo, constrói pouco, dá lances
//             baixos e aleatórios. Só aceita troca que não lhe custe nada.
//  • medium — compra quando sobra uma reserva (~$150), corre atrás de fechar grupo de cor, constrói
//             parelho mantendo a reserva e dá lances até ~90% do valor.
//  • hard   — reserva menor (mais agressivo), valoriza fechar E bloquear grupos (laranja e vermelho
//             mais ainda), constrói até 3 casas rápido, dá lances até ~110% do valor (bem mais se
//             fecha o grupo) e hipoteca/desipoteca de forma esperta pra manter o dinheiro trabalhando.
//
// Sempre devolve uma mensagem do protocolo que o motor ACEITA agora (a simulação confere): o que é
// possível vem de `actionsFor`, a mesma lista que a tela usa. O bot só olha o que um jogador de
// verdade enxerga. Não propõe trocas — só responde às que recebe (decideTrade).

import { BotLevel, Bundle, MeActions, MonoState, Trade, actionsFor, buildError, edition as editionOf, mortgage, ownedBy, ownsGroup, playerById, sellBuilding, supply, tradeError } from "./engine";
import { Group, OwnableSquare, Square, groupSquares, isOwnable, mortgageValue, unmortgageCost } from "./editions";
import type { MonoClientMessage } from "./protocol";

type Rng = () => number;
type Street = Extract<Square, { kind: "street" }>;

const isStreet = (sq: Square): sq is Street => sq.kind === "street";
const squareAt = (s: MonoState, i: number): Square => editionOf(s).squares[i];

/** Como cada nível joga — o resto da IA só consulta esta tabela. */
interface Style {
  /** Chance de comprar uma casa que dá pra pagar (só o fácil sorteia). */
  buyChance: number;
  /** Dinheiro que sobra depois de comprar na vez. */
  buyReserve: number;
  /** Dinheiro que sobra depois de um lance (fechando um grupo, vale tudo). */
  bidReserve: number;
  /** Até que fração do preço dá lance, sem bônus de grupo (o fácil sorteia entre 30% e 70%, ignora isto). */
  bidMult: number;
  /** Dinheiro que sobra depois de construir a 1ª–3ª casa, e depois da 4ª / hotel. */
  buildReserve: number;
  topReserve: number;
  /** Chance de construir quando dá, e o maior nível (casas) a que chega. */
  buildChance: number;
  maxBuild: number;
  /** Dinheiro que sobra depois de tirar uma hipoteca, e a chance de fazer. */
  unmortgageReserve: number;
  unmortgageChance: number;
}

const STYLE: Record<BotLevel, Style> = {
  easy: { buyChance: 0.6, buyReserve: 0, bidReserve: 0, bidMult: 0.5, buildReserve: 100, topReserve: 400, buildChance: 0.3, maxBuild: 3, unmortgageReserve: 100, unmortgageChance: 0.4 },
  medium: { buyChance: 1, buyReserve: 150, bidReserve: 100, bidMult: 0.9, buildReserve: 150, topReserve: 350, buildChance: 1, maxBuild: 5, unmortgageReserve: 200, unmortgageChance: 1 },
  hard: { buyChance: 1, buyReserve: 75, bidReserve: 50, bidMult: 1.1, buildReserve: 75, topReserve: 250, buildChance: 1, maxBuild: 5, unmortgageReserve: 150, unmortgageChance: 1 },
};
/** Nível que o servidor não conhece (dado de fora) joga como o médio, em vez de quebrar. */
const styleOf = (level: BotLevel): Style => STYLE[level] ?? STYLE.medium;

// ── Leitura do tabuleiro ───────────────────────────────────────────────────

/** As outras ruas da cor da rua `idx` (vazio se a casa não é uma rua). */
function groupMates(s: MonoState, idx: number): number[] {
  const sq = squareAt(s, idx);
  return isStreet(sq) ? groupSquares(editionOf(s), sq.group).filter((i) => i !== idx) : [];
}

/** Com a casa `idx`, `id` fecha o grupo de cor (já tem todas as outras)? */
function completesGroup(s: MonoState, id: string, idx: number): boolean {
  const mates = groupMates(s, idx);
  return mates.length > 0 && mates.every((i) => s.props[i]?.owner === id);
}

/** Se um adversário levar a casa `idx`, ele fecha o grupo? (todas as outras já são dele) */
function blocksGroup(s: MonoState, id: string, idx: number): boolean {
  const mates = groupMates(s, idx);
  if (mates.length === 0) return false;
  const owner = s.props[mates[0]]?.owner;
  return !!owner && owner !== id && mates.every((i) => s.props[i]?.owner === owner);
}

/** `id` é dono do grupo de cor inteiro da casa `idx`? */
function inOwnedGroup(s: MonoState, id: string, idx: number): boolean {
  const sq = squareAt(s, idx);
  return isStreet(sq) && ownsGroup(s, id, sq.group);
}

/** Laranja e vermelho: as cores que mais rendem (o adversário cai nelas logo depois da prisão). */
const isHot = (sq: Square) => isStreet(sq) && (sq.group === "orange" || sq.group === "red");

const unownedCount = (s: MonoState) => s.props.filter((p) => p && p.owner === null).length;

const byIdx = <T extends { idx: number }>(a: T, b: T) => a.idx - b.idx;

// ── Rolar (e a prisão) ─────────────────────────────────────────────────────

/** Vale pagar a fiança? O fácil decide na sorte; o difícil sai cedo, mas no fim do jogo a prisão é o lugar mais seguro. */
function wantsBail(s: MonoState, cash: number, level: BotLevel, rng: Rng): boolean {
  const left = cash - editionOf(s).bail;
  if (level === "easy") return left >= 50 && rng() < 0.5;
  if (level === "medium") return left >= 250;
  return left >= 150 && unownedCount(s) >= 6;
}

function rollMove(s: MonoState, id: string, a: MeActions, level: BotLevel, rng: Rng): MonoClientMessage {
  const me = playerById(s, id)!;
  if (me.jail !== null) {
    if (a.useJailCard) return { type: "use_card" };
    if (a.payBail && wantsBail(s, me.cash, level, rng)) return { type: "pay_bail" };
  }
  return { type: "roll" };
}

// ── Comprar ────────────────────────────────────────────────────────────────

function wantsToBuy(s: MonoState, id: string, level: BotLevel, rng: Rng): boolean {
  const me = playerById(s, id)!;
  const sq = squareAt(s, me.pos);
  if (!isOwnable(sq)) return false;
  const st = styleOf(level);
  const left = me.cash - sq.price;
  if (left < 0) return false;
  if (level === "easy") return rng() < st.buyChance;
  const completes = completesGroup(s, id, me.pos);
  if (completes) return true;
  // O difícil também compra pra impedir o adversário de fechar o grupo, e topa gastar mais nas cores quentes.
  if (level === "hard" && blocksGroup(s, id, me.pos)) return true;
  return left >= (level === "hard" && isHot(sq) ? 25 : st.buyReserve);
}

function buyMove(s: MonoState, id: string, a: MeActions, level: BotLevel, rng: Rng): MonoClientMessage {
  return a.buy && wantsToBuy(s, id, level, rng) ? { type: "buy" } : { type: "decline" };
}

// ── Leilão ─────────────────────────────────────────────────────────────────

/** O máximo que esse bot paga pela casa em leilão (já respeitando o que sobra no bolso). */
function auctionCeiling(s: MonoState, id: string, level: BotLevel, rng: Rng): number {
  const auction = s.auction!;
  const sq = squareAt(s, auction.sq) as OwnableSquare;
  const me = playerById(s, id)!;
  const st = styleOf(level);
  const completes = completesGroup(s, id, auction.sq);
  let worth: number;
  if (level === "easy") worth = sq.price * (0.3 + 0.4 * rng());
  else if (level === "medium") worth = sq.price * (completes ? 1.3 : st.bidMult);
  else worth = sq.price * (completes ? 2 : blocksGroup(s, id, auction.sq) ? 1.4 : st.bidMult) * (isHot(sq) ? 1.1 : 1);
  return Math.floor(Math.min(worth, me.cash - (completes ? 0 : st.bidReserve)));
}

function auctionMove(s: MonoState, id: string, a: MeActions, level: BotLevel, rng: Rng): MonoClientMessage {
  const auction = s.auction!;
  const sq = squareAt(s, auction.sq) as OwnableSquare;
  // Sobe em passos proporcionais ao preço (senão um leilão de $400 levaria 40 lances de $10).
  const step = Math.max(10, Math.round(sq.price / 100) * 10);
  const raise = level === "easy" ? step * (1 + Math.floor(rng() * 2)) : step;
  const amount = Math.min(auction.bid + raise, auctionCeiling(s, id, level, rng));
  return a.bid && amount >= a.minBid && amount <= a.maxBid ? { type: "bid", amount } : { type: "pass_bid" };
}

// ── Dívida: levantar dinheiro ou quebrar ───────────────────────────────────

/** A próxima coisa a vender/hipotecar: a que menos vale pra quem fica (casa antes de terreno, grupo fechado por último). */
function pickLiquidation(s: MonoState, id: string, a: MeActions): MonoClientMessage | null {
  const options: { msg: MonoClientMessage; value: number }[] = [
    ...a.sell.map((idx) => ({ msg: { type: "sell", sq: idx } as MonoClientMessage, value: (squareAt(s, idx) as Street).houseCost })),
    ...a.mortgage.map((idx) => ({ msg: { type: "mortgage", sq: idx } as MonoClientMessage, value: (squareAt(s, idx) as OwnableSquare).price * (inOwnedGroup(s, id, idx) ? 2 : 1) })),
  ];
  // A ordenação é estável: no empate, a casa (que vem primeiro) sai antes do terreno.
  options.sort((x, y) => x.value - y.value);
  return options[0]?.msg ?? null;
}

/**
 * Os passos (vender casa, hipotecar) que deixam a dívida pagável, ensaiados no motor a seco; `[]` =
 * já dá pra pagar; null = nem vendendo tudo que as regras deixam. (Só assim sei que vale a pena
 * desmontar o patrimônio: quem vai quebrar entrega tudo inteiro ao credor.)
 */
function liquidationPlan(start: MonoState, id: string): MonoClientMessage[] | null {
  const plan: MonoClientMessage[] = [];
  let s = start;
  for (let guard = 0; guard < 200; guard++) {
    const a = actionsFor(s, id);
    if (a.payDebt) return plan;
    const next = pickLiquidation(s, id, a);
    if (!next) return null;
    const r = next.type === "sell" ? sellBuilding(s, id, next.sq) : next.type === "mortgage" ? mortgage(s, id, next.sq) : null;
    if (!r || !r.ok) return null;
    plan.push(next);
    s = r.state;
  }
  return null;
}

function debtMove(s: MonoState, id: string): MonoClientMessage {
  const plan = liquidationPlan(s, id);
  if (!plan) return { type: "bankrupt" };
  return plan[0] ?? { type: "pay_debt" };
}

// ── Fase livre: construir, tirar hipoteca, encerrar ────────────────────────

/** Uma construção que o bot quer fazer (legal nas regras, ignorando o dinheiro). */
interface Wish {
  idx: number;
  cost: number;
  /** Nível (casas) que a rua passa a ter. */
  level: number;
  /** Aluguel ganho por dinheiro gasto. */
  roi: number;
  /** Dinheiro que o bot quer ter ANTES de construir (custo + reserva). */
  need: number;
}

function wishes(s: MonoState, id: string, st: Style): Wish[] {
  const sup = supply(s);
  const out: Wish[] = [];
  for (const idx of ownedBy(s, id)) {
    const sq = squareAt(s, idx);
    if (!isStreet(sq)) continue;
    // "sem dinheiro" não elimina o desejo (o motor o checa por último); qualquer outro motivo, sim.
    const err = buildError(s, id, idx);
    if (err !== null && err !== "not_enough_cash") continue;
    const houses = s.props[idx]!.houses;
    if (houses === 4 ? sup.hotels <= 0 : sup.houses <= 0) continue;
    const level = houses + 1;
    if (level > st.maxBuild) continue;
    out.push({ idx, cost: sq.houseCost, level, roi: (sq.rent[level] - sq.rent[level - 1]) / sq.houseCost, need: sq.houseCost + (level <= 3 ? st.buildReserve : st.topReserve) });
  }
  return out;
}

/** Quanto o bot quer manter uma propriedade (as de menos valor são as primeiras a hipotecar). */
function keepValue(s: MonoState, id: string, idx: number): number {
  const sq = squareAt(s, idx) as OwnableSquare;
  return sq.price + 50 * groupMates(s, idx).filter((i) => s.props[i]?.owner === id).length;
}

function manageMove(s: MonoState, id: string, a: MeActions, level: BotLevel, rng: Rng): MonoClientMessage {
  const me = playerById(s, id)!;
  const st = styleOf(level);
  const wish = wishes(s, id, st);

  const unmortgageable = (pool: number[]) =>
    pool
      .filter((i) => me.cash - unmortgageCost(squareAt(s, i) as OwnableSquare) >= st.unmortgageReserve)
      .sort((x, y) => (squareAt(s, y) as OwnableSquare).price - (squareAt(s, x) as OwnableSquare).price || x - y);

  // 1. Hipoteca dentro de um grupo que já é meu: sai primeiro (com ela no grupo não dá pra construir).
  const lock = unmortgageable(a.unmortgage.filter((i) => inOwnedGroup(s, id, i)));
  if (lock.length > 0 && rng() < st.unmortgageChance) return { type: "unmortgage", sq: lock[0] };

  // 2. Construir: a rua que mais aluguel dá por dinheiro gasto.
  const doable = wish.filter((w) => me.cash >= w.need).sort((x, y) => y.roi - x.roi || x.idx - y.idx);
  if (doable.length > 0 && rng() < st.buildChance) return { type: "build", sq: doable[0].idx };

  // 3. (difícil) falta pouco pra construir até a 3ª casa: hipoteca o que menos vale pra completar o dinheiro.
  if (level === "hard") {
    const goal = wish.filter((w) => w.level <= 3 && me.cash < w.need).sort((x, y) => x.cost - y.cost || x.idx - y.idx)[0];
    if (goal) {
      const pool = a.mortgage
        .filter((i) => !inOwnedGroup(s, id, i))
        .map((idx) => ({ idx, keep: keepValue(s, id, idx), got: mortgageValue(squareAt(s, idx) as OwnableSquare) }))
        .sort((x, y) => x.keep - y.keep || byIdx(x, y));
      let got = 0;
      for (const c of pool) {
        got += c.got;
        if (me.cash + got >= goal.need) return { type: "mortgage", sq: pool[0].idx };
      }
    }
  }

  // 4. Tirar as outras hipotecas — mas só quando não há construção esperando dinheiro (senão o bot
  // hipotecaria e desipotecaria a mesma casa em círculos).
  if (wish.length === 0) {
    const rest = unmortgageable(a.unmortgage);
    if (rest.length > 0 && rng() < st.unmortgageChance) return { type: "unmortgage", sq: rest[0] };
  }
  return { type: "end_turn" };
}

// ── Troca recebida ─────────────────────────────────────────────────────────

const JAIL_CARD_VALUE = 50;

/** O que vale ter o grupo de cor inteiro (aluguel em dobro, poder construir): um bônus grande sobre o preço. */
function groupBonus(s: MonoState, group: Group): number {
  const total = groupSquares(editionOf(s), group).reduce((sum, i) => sum + (squareAt(s, i) as OwnableSquare).price, 0);
  return 200 + Math.round(total / 2);
}

const faceValue = (s: MonoState, idx: number) => {
  const sq = squareAt(s, idx) as OwnableSquare;
  return s.props[idx]?.mortgaged ? mortgageValue(sq) : sq.price;
};
const bundleValue = (s: MonoState, b: Bundle) => b.cash + b.props.reduce((sum, i) => sum + faceValue(s, i), 0) + b.jailCards * JAIL_CARD_VALUE;

/** Os grupos de cor que `id` passa a ter inteiros com a troca, e os que deixa de ter. */
function groupsChanged(s: MonoState, t: Trade, id: string): { gained: Group[]; lost: Group[] } {
  const ed = editionOf(s);
  const ownerAfter = (i: number) => (t.give.props.includes(i) ? t.to : t.take.props.includes(i) ? t.from : (s.props[i]?.owner ?? null));
  const groups = new Set<Group>();
  for (const sq of ed.squares) if (isStreet(sq)) groups.add(sq.group);
  const gained: Group[] = [];
  const lost: Group[] = [];
  for (const g of groups) {
    const squares = groupSquares(ed, g);
    const before = squares.every((i) => s.props[i]?.owner === id);
    const after = squares.every((i) => ownerAfter(i) === id);
    if (after && !before) gained.push(g);
    else if (before && !after) lost.push(g);
  }
  return { gained, lost };
}

/** Quanto a troca tem que valer a favor do bot, por nível: ganho ≥ entrega × percentual / 100 (inteiros, pra 1,1 × 100 não dar 110,00000000000001). */
const TRADE_PERCENT: Record<BotLevel, number> = { easy: 100, medium: 110, hard: 125 };

/**
 * Responde a uma proposta de troca dirigida ao bot: compara o que ele ganha com o que entrega.
 * Propriedade vale o preço (hipotecada, metade); fechar um grupo de cor vale um bônus grande —
 * pra quem fecha, e por isso também pesa contra quem ENTREGA a peça que fecha o grupo do adversário.
 */
export function decideTrade(state: MonoState, playerId: string, level: BotLevel): "accept" | "decline" {
  const t = state.trade;
  if (state.phase !== "playing" || !t || t.to !== playerId) return "decline";
  if (tradeError(state, t)) return "decline";
  const mine = groupsChanged(state, t, playerId);
  const theirs = groupsChanged(state, t, t.from);

  const gain = bundleValue(state, t.give) + mine.gained.reduce((sum, g) => sum + groupBonus(state, g), 0);
  const loss = bundleValue(state, t.take) + theirs.gained.reduce((sum, g) => sum + groupBonus(state, g), 0) + mine.lost.reduce((sum, g) => sum + groupBonus(state, g), 0);
  if (gain <= 0) return "decline";
  if (gain * 100 < (TRADE_PERCENT[level] ?? TRADE_PERCENT.medium) * loss) return "decline";
  // O difícil nunca entrega o grupo que fecha o do adversário sem receber pelo menos o dobro.
  if (level === "hard" && theirs.gained.length > 0 && gain < 2 * loss) return "decline";
  return "accept";
}

// ── A jogada ───────────────────────────────────────────────────────────────

/** Devolve a jogada de `playerId` agora; se não há nada a fazer (não é a vez dele), `end_turn` — que o motor recusa sem efeito. */
export function chooseBotAction(state: MonoState, playerId: string, level: BotLevel, rng: Rng): MonoClientMessage {
  const idle: MonoClientMessage = { type: "end_turn" };
  const me = playerById(state, playerId);
  if (state.phase !== "playing" || !me || me.bankrupt) return idle;
  const a = actionsFor(state, playerId);

  if (state.step === "auction") return a.bid || a.passBid ? auctionMove(state, playerId, a, level, rng) : idle;

  // Troca pendente trava tudo: quem recebeu responde, quem propôs (humano que sumiu) cancela.
  if (state.trade) {
    if (a.respondTrade) return decideTrade(state, playerId, level) === "accept" ? { type: "accept_trade" } : { type: "decline_trade" };
    return a.cancelTrade ? { type: "cancel_trade" } : idle;
  }

  switch (state.step) {
    case "roll":
      return a.roll ? rollMove(state, playerId, a, level, rng) : idle;
    case "buy":
      return a.decline ? buyMove(state, playerId, a, level, rng) : idle;
    case "debt":
      return a.bankrupt ? debtMove(state, playerId) : idle;
    case "manage":
      return a.endTurn ? manageMove(state, playerId, a, level, rng) : idle;
  }
  return idle;
}
