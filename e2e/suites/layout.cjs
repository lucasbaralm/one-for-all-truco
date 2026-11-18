// Suíte "layout": a tela do jogo em vários tamanhos REAIS de área útil (monitor com barra do Windows, meia
// tela, celular com barras do navegador, celular na horizontal), em cada etapa da partida. Em vez de olhar o
// olho: mede o DOM — nada vaza pro lado, o tabuleiro é quadrado e inteiro na tela, as peças ficam dentro dele,
// os painéis não se sobrepõem ao tabuleiro, o botão principal está VISÍVEL e ALCANÇÁVEL (elementFromPoint).
// Salva um PNG de cada combinação em e2e/out/.

const { BASE, suite, check, newUser, waitSel, sleep, shot } = require("../kit.cjs");
const { uiPlayUntil, present, click, screen } = require("../driver.cjs");

const VIEWPORTS = [
  { name: "1536x730", w: 1536, h: 730 },
  { name: "1920x945", w: 1920, h: 945 },
  { name: "1366x633", w: 1366, h: 633 },
  { name: "960x945", w: 960, h: 945 },
  { name: "740x320-paisagem", w: 740, h: 320, mobile: true },
  { name: "412x780", w: 412, h: 780, mobile: true },
  { name: "360x650", w: 360, h: 650, mobile: true },
  { name: "980x1950-site-desktop", w: 980, h: 1950, mobile: true },
];

const rid = () => "L" + Math.random().toString(36).slice(2, 6).toUpperCase();

/** Mede tudo de uma vez dentro da página. */
function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const board = document.querySelector("[data-mono-board]");
    const br = board ? rect(board) : null;
    const tokens = [...document.querySelectorAll("[data-mono-token]")].map((t) => rect(t));
    const tiles = [...document.querySelectorAll("[data-mono-tile]")].map((t) => rect(t));
    const inter = (a, b) => a.x < b.r - 1 && a.r > b.x + 1 && a.y < b.b - 1 && a.b > b.y + 1;
    const sq = [...document.querySelectorAll("[data-mono-sq]")].map((s) => rect(s));
    const names = [...document.querySelectorAll(".mono-sq-name")].filter((e) => getComputedStyle(e).display !== "none");
    const actions = document.querySelector("[data-mono-actions]");
    const main = ["[data-mono-roll]", "[data-mono-buy]", "[data-mono-end]", "[data-mono-pay-debt]", "[data-mono-bid]"].map((s) => document.querySelector(s)).find(Boolean);
    let reach = null;
    if (main) {
      const r = main.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      reach = { visible: r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw, reachable: !!el && (el === main || main.contains(el)), rect: { y: r.y, b: r.bottom, h: r.height, w: r.width } };
    }
    const priceFont = parseFloat(getComputedStyle(document.querySelector(".mono-sq-price") || document.body).fontSize);
    return {
      vw, vh,
      overflowX: document.documentElement.scrollWidth - vw,
      overflowY: document.documentElement.scrollHeight - vh,
      board: br,
      boardSquare: br ? Math.abs(br.w - br.h) <= 1.5 : false,
      boardInside: br ? br.x >= -0.5 && br.r <= vw + 0.5 && br.y >= -0.5 && br.b <= vh + 0.5 : false,
      tokensInside: br ? tokens.every((t) => t.x >= br.x - 1 && t.r <= br.r + 1 && t.y >= br.y - 1 && t.b <= br.b + 1) : false,
      tokenCount: tokens.length,
      tilesOverlapBoard: br ? tiles.filter((t) => inter(t, br)).length : 0,
      actionsOverlapBoard: br && actions ? inter(rect(actions), br) : false,
      squaresAllSized: sq.every((s) => s.w > 5 && s.h > 5),
      namesClipped: names.filter((e) => e.scrollWidth > e.clientWidth + 2).length,
      namesShown: names.length,
      priceFont,
      boardW: br?.w,
      reach,
      tileCount: tiles.length,
    };
  });
}

module.exports = async function layout({ browser }, edition = "monopoly") {
  const name = "Lia";
  const u = await newUser(browser, name);
  const page = u.page;

  for (const vp of VIEWPORTS) {
    suite(`Layout ${vp.name} (${edition})`);
    await page.setViewport({ width: vp.w, height: vp.h, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
    // uma sala (partida) nova por tamanho de tela: a anterior pode ter acabado ou falido a pessoa
    await page.goto(`${BASE}/${edition}/${rid()}?bots=3&level=easy&limit=40`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "[data-mono-game]", 60000);
    await sleep(500);

    for (const state of ["roll", "buy"]) {
      // espera a etapa (jogando pela tela até lá)
      const r = await uiPlayUntil(page, {
        timeoutMs: 120000,
        every: 30,
        opts: { buy: 0 },
        until: async () => {
          const s = await screen(page);
          return !!s && s.phase === "playing" && s.myTurn && s.step === state;
        },
      });
      if (!check(`chegou na etapa '${state}' pra medir`, !!r.stopped, r.counts)) continue;
      await sleep(450);
      const m = await measure(page);
      const tag = `${state}`;
      check(`${tag}: nada vaza pro lado (scrollX = ${Math.round(m.overflowX)})`, m.overflowX <= 1, m.overflowX);
      check(`${tag}: a página não rola na vertical (o jogo cabe na tela)`, m.overflowY <= 1, m.overflowY);
      check(`${tag}: o tabuleiro é um quadrado inteiro na tela (${Math.round(m.board.w)}px)`, m.boardSquare && m.boardInside, m.board);
      check(`${tag}: as 40 casas têm tamanho`, m.squaresAllSized);
      check(`${tag}: as ${m.tokenCount} peças ficam dentro do tabuleiro`, m.tokensInside && m.tokenCount >= 2 && m.tokenCount <= 4, m.tokenCount);
      check(`${tag}: os cartões dos jogadores não cobrem o tabuleiro`, m.tilesOverlapBoard === 0, m.tilesOverlapBoard);
      check(`${tag}: o painel de ações não cobre o tabuleiro`, !m.actionsOverlapBoard);
      if (m.reach) check(`${tag}: o botão principal está visível e dá pra clicar nele`, m.reach.visible && m.reach.reachable, m.reach);
      else check(`${tag}: há um botão principal`, false, "nenhum botão de ação encontrado");
      if (m.boardW >= 500) check(`${tag}: tabuleiro grande mostra nomes (${m.namesShown}) e nenhum corta na largura`, m.namesShown > 20 && m.namesClipped === 0, { shown: m.namesShown, clipped: m.namesClipped });
      else if (m.boardW >= 230) check(`${tag}: tabuleiro pequeno esconde os nomes e deixa o preço legível (${m.priceFont.toFixed(1)}px)`, m.namesShown <= 4 && m.priceFont >= 5.5, { shown: m.namesShown, font: m.priceFont });
      else check(`${tag}: celular deitado (${Math.round(m.boardW)}px): nomes escondidos; a escritura vem tocando na casa`, m.namesShown <= 4, { shown: m.namesShown });
      await shot(page, `${edition}-layout-${vp.name}-${state}.png`);
    }

    // diálogo de propriedades e de troca cabem na tela
    if (await click(page, "[data-mono-open-assets]")) {
      await sleep(400);
      const d = await page.evaluate(() => {
        const el = document.querySelector("[data-mono-assets-dialog]");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, h: r.height, vh: innerHeight };
      });
      check("o diálogo de propriedades cabe na tela", !!d && d.inside, d);
      await shot(page, `${edition}-layout-${vp.name}-propriedades.png`);
      await click(page, "[data-mono-close]");
      await sleep(250);
    }
    if (await click(page, "[data-mono-open-trade]")) {
      await sleep(400);
      const d = await page.evaluate(() => {
        const el = document.querySelector("[data-mono-trade-composer]");
        if (!el) return null;
        const dialog = el.closest(".rounded-2xl");
        const r = dialog.getBoundingClientRect();
        return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
      });
      check("o diálogo de troca cabe na tela", !!d && d.inside, d);
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.querySelector('button[aria-label="Fechar"]')?.click());
      await sleep(250);
    }
  }

  const errs = u.errors.filter((e) => !/favicon|Failed to load resource|ERR_|WebSocket|net::/.test(e));
  check("nenhum erro de JavaScript em nenhum tamanho de tela", errs.length === 0, errs.slice(0, 4));
  await u.close();
};
