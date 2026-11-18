// Jogadores automáticos do Monopoly / Banco Imobiliário nos testes E2E.
//  • uiStep(page)  — joga PELA TELA: lê os data-* e clica nos botões de verdade (rolar, comprar, lance, pagar,
//    construir, hipotecar, encerrar). Nunca decide nada que a tela não ofereça.
//  • rawStep(player) — joga pelo WebSocket olhando só `view.me` (o que o servidor diz que dá pra fazer).
// Os dois usam a mesma "política": comprar quase tudo, construir sempre que dá, hipotecar só quando deve,
// dar lance pequeno em leilão — o suficiente pra partida andar, ter monopólios, casas, falências.

const { sleep } = require("./kit.cjs");

const GAME_OVER = 'div.fixed.inset-0[class*="z-[65]"]';

/** Estado resumido da tela do jogo (null se não for a tela de partida). */
async function screen(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-mono-game]");
    if (!root) return null;
    const actions = document.querySelector("[data-mono-actions]");
    return {
      phase: root.getAttribute("data-phase"),
      step: root.getAttribute("data-step"),
      myTurn: actions?.getAttribute("data-my-turn") === "true",
      has: (s) => !!document.querySelector(s),
    };
  }).catch(() => null);
}

const present = (page, sel) => page.evaluate((s) => !!document.querySelector(s), sel).catch(() => false);
const enabled = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.disabled; }, sel).catch(() => false);
const click = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.disabled) return false; e.click(); return true; }, sel).catch(() => false);

/** Abre o diálogo de propriedades, executa `fn` e fecha. */
async function withAssets(page, fn) {
  if (!(await click(page, "[data-mono-open-assets]"))) return false;
  await page.waitForSelector("[data-mono-assets-dialog]", { timeout: 4000 }).catch(() => {});
  let out = false;
  try {
    out = await fn();
  } finally {
    await click(page, "[data-mono-close]");
    await page.waitForFunction(() => !document.querySelector("[data-mono-assets-dialog]"), { timeout: 3000 }).catch(() => {});
  }
  return out;
}

/**
 * Uma jogada pela tela. Devolve o nome do que fez ("roll", "buy"...) ou null se não havia nada a fazer.
 * opts: { buy: 0..1 (chance de comprar), bid: 0..1, build: bool, rng }
 */
async function uiStep(page, opts = {}) {
  const rng = opts.rng || Math.random;
  const buyChance = opts.buy ?? 0.85;
  const bidChance = opts.bid ?? 0.5;

  // proposta de troca dirigida a mim
  if (await present(page, "[data-mono-trade-offer]")) {
    const accept = opts.acceptTrades ?? rng() < 0.5;
    return (await click(page, accept ? "[data-mono-trade-accept]" : "[data-mono-trade-decline]")) ? (accept ? "trade-accept" : "trade-decline") : null;
  }
  if (await present(page, GAME_OVER)) return null;
  const s = await screen(page);
  if (!s || s.phase !== "playing") return null;

  // leilão: o painel mostra os lances só pra quem tem a vez de dar lance
  if (s.step === "auction") {
    if (await present(page, "[data-mono-pass]")) {
      if (rng() < bidChance && (await enabled(page, "[data-mono-bid]"))) return (await click(page, "[data-mono-bid]")) ? "bid" : null;
      return (await click(page, "[data-mono-pass]")) ? "pass" : null;
    }
    return null;
  }
  if (!s.myTurn) return null;

  if (s.step === "roll") {
    // preso e com dinheiro sobrando: às vezes paga a fiança
    if ((await enabled(page, "[data-mono-bail]")) && rng() < 0.4) return (await click(page, "[data-mono-bail]")) ? "bail" : null;
    if ((await enabled(page, "[data-mono-jailcard]")) && rng() < 0.7) return (await click(page, "[data-mono-jailcard]")) ? "jailcard" : null;
    if (opts.buildBeforeRoll && (await tryBuild(page))) return "build";
    return (await click(page, "[data-mono-roll]")) ? "roll" : null;
  }
  if (s.step === "buy") {
    if ((await enabled(page, "[data-mono-buy]")) && rng() < buyChance) return (await click(page, "[data-mono-buy]")) ? "buy" : null;
    return (await click(page, "[data-mono-decline]")) ? "decline" : null;
  }
  if (s.step === "debt") {
    if (await enabled(page, "[data-mono-pay-debt]")) return (await click(page, "[data-mono-pay-debt]")) ? "pay-debt" : null;
    // levanta dinheiro: vende casa, senão hipoteca
    const raised = await withAssets(page, async () => {
      for (const sel of ["[data-mono-sell]:not(:disabled)", "[data-mono-mortgage]:not(:disabled)"]) {
        if (await click(page, sel)) return true;
      }
      return false;
    });
    if (raised) return "raise";
    if (!(await click(page, "[data-mono-bankrupt]"))) return null;
    await sleep(80);
    return (await click(page, "[data-mono-bankrupt-confirm]")) ? "bankrupt" : null;
  }
  if (s.step === "manage") {
    if (opts.build !== false && (await tryBuild(page))) return "build";
    if (opts.unmortgage !== false && (await tryUnmortgage(page))) return "unmortgage";
    return (await click(page, "[data-mono-end]")) ? "end" : null;
  }
  return null;
}

async function tryBuild(page) {
  return withAssets(page, async () => click(page, "[data-mono-build]:not(:disabled)"));
}
async function tryUnmortgage(page) {
  return withAssets(page, async () => click(page, "[data-mono-unmortgage]:not(:disabled)"));
}

/** Joga pela tela até acabar a partida (ou estourar o tempo). Devolve { actions, over }. */
async function uiPlayUntil(page, { until, timeoutMs = 240000, opts = {}, every = 60, onStep } = {}) {
  const t0 = Date.now();
  const counts = {};
  while (Date.now() - t0 < timeoutMs) {
    if (await present(page, GAME_OVER)) return { counts, over: true };
    if (until && (await until())) return { counts, over: false, stopped: true };
    const did = await uiStep(page, opts);
    if (did) {
      counts[did] = (counts[did] || 0) + 1;
      if (onStep) await onStep(did, counts);
      await sleep(every);
    } else await sleep(150);
  }
  return { counts, over: false, timeout: true };
}

// ── pelo WebSocket ──────────────────────────────────────────────────────────

/** Uma jogada olhando só o que o servidor diz que dá (`view.me`). Devolve o nome da ação ou null. */
function rawStep(p, rng = Math.random, opts = {}) {
  const v = p.view;
  if (!v || v.phase !== "playing") return null;
  const a = v.me;
  const send = (m, name) => {
    p.send(m);
    return name;
  };
  if (a.respondTrade) return send({ type: rng() < (opts.acceptTrade ?? 0.5) ? "accept_trade" : "decline_trade" }, "trade-response");
  if (a.bid || a.passBid) {
    if (a.bid && rng() < (opts.bid ?? 0.5)) return send({ type: "bid", amount: Math.min(a.maxBid, Math.max(a.minBid, v.auction.bid + 10)) }, "bid");
    return send({ type: "pass_bid" }, "pass");
  }
  if (a.useJailCard && rng() < 0.7) return send({ type: "use_card" }, "jailcard");
  if (a.payBail && rng() < 0.4) return send({ type: "pay_bail" }, "bail");
  if (a.roll) return send({ type: "roll" }, "roll");
  // (as flags de `view.me` já são só da pessoa da vez: `decline` e `bankrupt` nunca são verdadeiras pros outros)
  if (a.decline) {
    if (a.buy && rng() < (opts.buy ?? 0.85)) return send({ type: "buy" }, "buy");
    return send({ type: "decline" }, "decline");
  }
  if (a.bankrupt) {
    if (a.payDebt) return send({ type: "pay_debt" }, "pay-debt");
    if (a.sell.length) return send({ type: "sell", sq: a.sell[0] }, "sell");
    if (a.mortgage.length) return send({ type: "mortgage", sq: a.mortgage[0] }, "mortgage");
    return send({ type: "bankrupt" }, "bankrupt");
  }
  if (a.endTurn) {
    if (opts.build !== false && a.build.length) return send({ type: "build", sq: a.build[0] }, "build");
    if (a.unmortgage.length && rng() < 0.6) return send({ type: "unmortgage", sq: a.unmortgage[0] }, "unmortgage");
    return send({ type: "end_turn" }, "end");
  }
  return null;
}

module.exports = { GAME_OVER, screen, present, enabled, click, withAssets, uiStep, uiPlayUntil, rawStep };
