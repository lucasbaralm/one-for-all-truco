// Conferências compartilhadas pelas suítes: a TELA tem que dizer exatamente o que o SERVIDOR sabe.

const { peek, sleep } = require("./kit.cjs");

/** Lê da tela tudo o que o servidor também sabe. */
function domState(page) {
  return page.evaluate(() => {
    const game = document.querySelector("[data-mono-game]");
    if (!game) return null;
    const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
    return {
      phase: game.getAttribute("data-phase"),
      step: game.getAttribute("data-step"),
      cash: Object.fromEntries([...document.querySelectorAll("[data-mono-tile]")].map((t) => [t.getAttribute("data-mono-tile"), num(t.querySelector("[data-mono-cash-value]")?.getAttribute("data-mono-cash-value"))])),
      bankrupt: Object.fromEntries([...document.querySelectorAll("[data-mono-tile]")].map((t) => [t.getAttribute("data-mono-tile"), t.getAttribute("data-bankrupt") === "true"])),
      turnTile: [...document.querySelectorAll("[data-mono-tile]")].find((t) => t.getAttribute("data-turn") === "true")?.getAttribute("data-mono-tile") ?? null,
      pos: Object.fromEntries([...document.querySelectorAll("[data-mono-token]")].map((t) => [t.getAttribute("data-mono-token"), num(t.getAttribute("data-pos"))])),
      jailed: Object.fromEntries([...document.querySelectorAll("[data-mono-token]")].map((t) => [t.getAttribute("data-mono-token"), t.getAttribute("data-jailed") === "true"])),
      squares: Object.fromEntries([...document.querySelectorAll("[data-mono-sq]")].map((s) => [s.getAttribute("data-mono-sq"), { owner: s.getAttribute("data-owner") || null, houses: num(s.getAttribute("data-houses")), mortgaged: s.getAttribute("data-mortgaged") === "true" }])),
      dice: document.querySelector("[data-mono-dice]")?.getAttribute("data-mono-dice") || "",
      squareCount: document.querySelectorAll("[data-mono-sq]").length,
    };
  });
}

/**
 * Compara a tela com o servidor. A tela e o servidor mudam sozinhos (bots), então só vale quando o estado
 * do servidor não mexeu entre as duas leituras (mesmo eventSeq antes e depois) — tenta de novo se mexeu.
 */
async function compare(page, party, room, name, tries = 8) {
  let last = [];
  for (let t = 0; t < tries; t++) {
    const a = await peek(room, party, name);
    const dom = await domState(page);
    const b = await peek(room, party, name);
    if (!dom) return { ok: false, diffs: ["a tela do jogo não está aberta"], server: a };
    if (a.eventSeq !== b.eventSeq) {
      await sleep(250);
      continue;
    }
    const diffs = [];
    const v = b;
    if (dom.phase !== v.phase) diffs.push(`fase: tela ${dom.phase} × servidor ${v.phase}`);
    if (v.phase === "playing" && dom.step !== v.step) diffs.push(`etapa: tela ${dom.step} × servidor ${v.step}`);
    if (dom.squareCount !== 40) diffs.push(`a tela tem ${dom.squareCount} casas`);
    v.players.forEach((p, i) => {
      if (dom.cash[p.id] !== p.cash && !p.bankrupt) diffs.push(`dinheiro de ${p.id}: tela ${dom.cash[p.id]} × servidor ${p.cash}`);
      if (dom.bankrupt[p.id] !== p.bankrupt) diffs.push(`falência de ${p.id}: tela ${dom.bankrupt[p.id]} × servidor ${p.bankrupt}`);
      if (!p.bankrupt) {
        if (dom.pos[p.id] !== p.pos) diffs.push(`posição de ${p.id}: tela ${dom.pos[p.id]} × servidor ${p.pos}`);
        if (dom.jailed[p.id] !== (p.jail !== null)) diffs.push(`prisão de ${p.id}: tela ${dom.jailed[p.id]} × servidor ${p.jail !== null}`);
      } else if (p.id in dom.pos) diffs.push(`${p.id} faliu mas a peça ainda está no tabuleiro`);
      if (v.phase === "playing" && i === v.turn && !p.bankrupt && dom.turnTile !== p.id) diffs.push(`vez: tela ${dom.turnTile} × servidor ${p.id}`);
    });
    v.props.forEach((pr, i) => {
      if (!pr) return;
      const sq = dom.squares[i];
      if ((sq.owner || null) !== pr.owner) diffs.push(`dono da casa ${i}: tela ${sq.owner} × servidor ${pr.owner}`);
      if (sq.houses !== pr.houses) diffs.push(`casas em ${i}: tela ${sq.houses} × servidor ${pr.houses}`);
      if (sq.mortgaged !== pr.mortgaged) diffs.push(`hipoteca em ${i}: tela ${sq.mortgaged} × servidor ${pr.mortgaged}`);
    });
    if (v.dice) {
      const want = `${v.dice[0]}+${v.dice[1]}`;
      if (dom.dice !== want) diffs.push(`dados: tela ${dom.dice} × servidor ${want}`);
    }
    if (diffs.length === 0) return { ok: true, diffs, server: v };
    last = diffs;
    await sleep(300); // animação/mensagem a caminho: dá um tempo e tenta de novo
  }
  return { ok: false, diffs: last, server: null };
}

/** Joga em paralelo as páginas dadas até `until()`; cada uma age só na sua vez. */
async function playTogether(pages, { until, timeoutMs = 240000, optsOf = () => ({}), every = 80 } = {}) {
  const { uiStep, present, GAME_OVER } = require("./driver.cjs");
  const t0 = Date.now();
  const counts = {};
  while (Date.now() - t0 < timeoutMs) {
    let acted = false;
    for (const p of pages) {
      // `until` roda antes de CADA jogada (senão a página que acabou de chegar na etapa certa já agiria)
      if (until && (await until())) return { counts, stopped: true };
      if (await present(p.page, GAME_OVER)) continue;
      const did = await uiStep(p.page, optsOf(p));
      if (did) {
        acted = true;
        counts[p.name] = counts[p.name] || {};
        counts[p.name][did] = (counts[p.name][did] || 0) + 1;
      }
    }
    await sleep(acted ? every : 140);
  }
  return { counts, timeout: true };
}

module.exports = { domState, compare, playTogether };
