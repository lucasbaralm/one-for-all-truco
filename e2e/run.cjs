#!/usr/bin/env node
// Roda as suítes E2E do Monopoly / Banco Imobiliário contra a pilha de verdade (ver e2e/kit.cjs).
//
//   node e2e/run.cjs                 # tudo
//   node e2e/run.cjs menu solo       # só essas
//   SPEED=12 NO_NEXT=1 node e2e/run.cjs server
//
// Suítes: menu · server · errors · solo-{monopoly,banco} · multi-{monopoly,banco} · build-{monopoly,banco} · layout-{monopoly,banco}
// (atalhos: `solo`, `multi`, `build` e `layout` = as duas edições)
// Variáveis: SPEED (divide as esperas dos bots no servidor, padrão 8) · NO_NEXT=1 (não sobe o Next; só `server`)
// Tudo (servidor, Next, Chrome) sobe e desce sozinho; as capturas de tela ficam em e2e/out/.

const kit = require("./kit.cjs");

const SUITES = {
  menu: (ctx) => require("./suites/menu.cjs")(ctx),
  server: (ctx) => require("./suites/server.cjs")(ctx),
  "solo-monopoly": (ctx) => require("./suites/solo.cjs")(ctx, "monopoly"),
  "solo-banco": (ctx) => require("./suites/solo.cjs")(ctx, "banco"),
  "multi-monopoly": (ctx) => require("./suites/multi.cjs")(ctx, "monopoly"),
  "multi-banco": (ctx) => require("./suites/multi.cjs")(ctx, "banco"),
  "build-monopoly": (ctx) => require("./suites/build.cjs")(ctx, "monopoly"),
  "build-banco": (ctx) => require("./suites/build.cjs")(ctx, "banco"),
  "layout-monopoly": (ctx) => require("./suites/layout.cjs")(ctx, "monopoly"),
  "layout-banco": (ctx) => require("./suites/layout.cjs")(ctx, "banco"),
  errors: (ctx) => require("./suites/errors.cjs")(ctx),
};

const GROUPS = { solo: ["solo-monopoly", "solo-banco"], multi: ["multi-monopoly", "multi-banco"], layout: ["layout-monopoly", "layout-banco"], build: ["build-monopoly", "build-banco"] };

(async () => {
  const asked = process.argv.slice(2);
  const wanted = asked.length ? asked.flatMap((a) => GROUPS[a] || [a]) : Object.keys(SUITES);
  for (const w of wanted) if (!SUITES[w]) throw new Error(`suíte desconhecida: ${w} (use: ${Object.keys(SUITES).join(", ")})`);
  const onlyServer = wanted.every((w) => w === "server");
  const stack = await kit.startStack({ speed: Number(process.env.SPEED) || 8, next: !(process.env.NO_NEXT || onlyServer) });
  let browser = null;
  let ok = false;
  try {
    if (!onlyServer) browser = await kit.launchBrowser();
    const ctx = { stack, browser };
    // O Next (dev) compila cada rota na PRIMEIRA visita de um navegador, e isso pode levar um minuto: aquece antes,
    // senão a primeira suíte estoura o tempo esperando a tela (parece falha do jogo, mas é só compilação).
    if (browser && !process.env.NO_WARMUP) {
      const t0 = Date.now();
      const w = await kit.newUser(browser, "Aquece", { shared: true });
      for (const path of ["/lobby", "/lobby/monopoly", "/lobby/banco", "/monopoly/AQUECE1?bots=1&level=easy&limit=20", "/banco/AQUECE2?bots=1&level=easy&limit=20"]) {
        await w.page.goto(`${kit.BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 240000 }).catch(() => {});
        if (path.includes("bots=")) await w.page.waitForSelector("[data-mono-game]", { timeout: 240000 }).catch(() => {});
        else await w.page.waitForSelector("a, button", { timeout: 120000 }).catch(() => {});
      }
      await w.close();
      console.log(`  (aquecimento do Next: ${Math.round((Date.now() - t0) / 1000)}s)`);
    }
    for (const w of wanted) {
      const t0 = Date.now();
      try {
        await SUITES[w](ctx);
      } catch (e) {
        kit.check(`a suíte '${w}' terminou sem estourar`, false, String(e && e.stack ? e.stack : e).split("\n").slice(0, 4).join(" | "));
      }
      console.log(`  (${w}: ${Math.round((Date.now() - t0) / 1000)}s)`);
    }
    ok = kit.summary();
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stack.stop();
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
