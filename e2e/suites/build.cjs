// Suíte "build": construir, vender casa, hipotecar e tirar a hipoteca PELA TELA, com um grupo de cor de verdade.
// Fechar um grupo no acaso demora, então a Alice (tela) joga com 2 jogadores crus (WebSocket) que, na vez deles,
// PRESENTEIAM a ela (troca sem pedir nada em troca; a tela da Alice aceita) as ruas dos grupos em que ela já tem
// alguma — até ela ter um grupo inteiro. Depois confere cada regra na tela e no servidor.

const { BASE, suite, check, newUser, rawPlayer, waitSel, waitFor, sleep, peek, shot } = require("../kit.cjs");
const { GAME_OVER, uiStep, present, click, enabled, screen, withAssets } = require("../driver.cjs");
const { compare } = require("../common.cjs");

// As ruas ficam nas mesmas casas nas duas edições.
const GROUPS = [[1, 3], [6, 8, 9], [11, 13, 14], [16, 18, 19], [21, 23, 24], [26, 27, 29], [31, 32, 34], [37, 39]];
const rid = () => "B" + Math.random().toString(36).slice(2, 6).toUpperCase();

function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fullGroup = (v, who) => GROUPS.find((g) => g.every((i) => v.props[i]?.owner === who));

module.exports = async function build({ browser }, edition = "monopoly") {
  suite(`Construir, vender e hipotecar pela tela (${edition})`);
  const { rawStep } = require("../driver.cjs");
  const room = rid();
  const alice = await newUser(browser, "Alice");
  const page = alice.page;
  await page.goto(`${BASE}/${edition}/${room}`, { waitUntil: "domcontentloaded" });
  await waitSel(page, "[data-mono-lobby]", 60000);
  const rafa = rawPlayer(room, edition, "Rafa");
  await rafa.opened;
  await sleep(150);
  const rita = rawPlayer(room, edition, "Rita");
  await rita.opened;
  const raws = [rafa, rita];
  await waitFor(() => page.evaluate(() => document.querySelectorAll("[data-mono-lobby-player]").length === 3), 10000, "3 no lobby");
  await page.evaluate(() => document.querySelector("[data-mono-start]").click());
  await waitSel(page, "[data-mono-game]", 20000);

  // ── joga até a Alice ter um grupo inteiro (com presentes dos outros) e já ter construído
  const rng = rngOf(7);
  const t0 = Date.now();
  let gifts = 0;
  const gifted = new Set();
  const view = () => raws[0].view;
  const aliceHasHouses = () => {
    const v = view();
    const g = v && fullGroup(v, "Alice");
    return !!g && g.some((i) => v.props[i].houses > 0);
  };
  const stopHere = async () => {
    if (!aliceHasHouses()) return false;
    const s = await screen(page);
    return !!s && s.myTurn && s.step === "manage";
  };
  let stopped = false;
  while (Date.now() - t0 < 6 * 60 * 1000) {
    if (await present(page, GAME_OVER)) break;
    if (await stopHere()) {
      stopped = true;
      break;
    }
    let acted = false;
    // jogadores crus
    for (const p of raws) {
      const v = p.view;
      if (!v || v.phase !== "playing") continue;
      if (p.sentSeq === v.eventSeq && Date.now() - (p.sentAt || 0) < 2000) continue;
      let did = null;
      if (v.me.endTurn && v.me.propose && !v.trade) {
        // presente: uma rua de um grupo em que a Alice já tem alguma
        for (const g of GROUPS) {
          if (!g.some((i) => v.props[i]?.owner === "Alice")) continue;
          const gift = g.find((i) => v.props[i]?.owner === p.name && !gifted.has(i) && v.props[i].houses === 0);
          if (gift !== undefined) {
            gifted.add(gift);
            p.send({ type: "propose_trade", to: "Alice", give: { props: [gift] } });
            gifts++;
            did = "gift";
            break;
          }
        }
      }
      if (!did) did = rawStep(p, rng, { acceptTrade: 1, build: true });
      if (did) {
        p.sentSeq = v.eventSeq;
        p.sentAt = Date.now();
        acted = true;
      }
    }
    // a tela da Alice
    const did = await uiStep(page, { buy: 1, bid: 0.5, acceptTrades: true, build: true, unmortgage: true });
    if (did) acted = true;
    await sleep(acted ? 25 : 90);
  }
  const v0 = await peek(room, edition, "Alice");
  console.log(`  · ${gifts} presentes, rodada ${v0.round}, ${Math.round((Date.now() - t0) / 1000)}s`);
  check("a Alice fechou um grupo de cor (com presentes) e construiu pela tela", stopped, { gifts, round: v0.round });
  if (!stopped) {
    await alice.close();
    raws.forEach((p) => p.close());
    return;
  }

  // ── a tela concorda com o servidor, casas incluídas
  let cmp = await compare(page, edition, room, "Alice");
  check("tela e servidor concordam (donos, casas, dinheiro, peças)", cmp.ok, cmp.diffs);
  let srv = await peek(room, edition, "Alice");
  const group = fullGroup(srv, "Alice");
  const houseCount = (v) => group.reduce((n, i) => n + (v.props[i].houses === 5 ? 0 : v.props[i].houses), 0);
  const dom = await page.evaluate(() => ({ houses: document.querySelectorAll(".mono-house").length, hotels: document.querySelectorAll(".mono-hotel").length }));
  const allHouses = srv.props.reduce((n, p) => n + (p && p.houses > 0 && p.houses < 5 ? p.houses : 0), 0);
  const allHotels = srv.props.filter((p) => p && p.houses === 5).length;
  check("as casinhas verdes e os hotéis desenhados são exatamente os do servidor", dom.houses === allHouses && dom.hotels === allHotels, { dom, allHouses, allHotels });
  check("construiu parelho: a diferença entre as ruas do grupo é no máximo 1", Math.max(...group.map((i) => srv.props[i].houses)) - Math.min(...group.map((i) => srv.props[i].houses)) <= 1, group.map((i) => srv.props[i].houses));

  // ── o diálogo de propriedades
  await click(page, "[data-mono-open-assets]");
  await waitSel(page, "[data-mono-assets-dialog]", 5000);
  await sleep(300);
  const supplyText = await page.evaluate(() => document.querySelector("[data-mono-assets-dialog]").innerText.match(/Banco: (\d+) casas · (\d+) hotéis/));
  check("o diálogo mostra o estoque do banco igual ao do servidor", !!supplyText && Number(supplyText[1]) === srv.supply.houses && Number(supplyText[2]) === srv.supply.hotels, { text: supplyText?.[0], srv: srv.supply });
  const rowHouses = await page.$$eval("[data-mono-asset]", (rows) => Object.fromEntries(rows.map((r) => [r.dataset.monoAsset, Number(r.dataset.houses)])));
  check("cada linha mostra as casas que a rua tem de verdade", group.every((i) => rowHouses[i] === srv.props[i].houses), { rowHouses, group });

  // construir mais uma na rua que estiver no mínimo; a mesma rua passa a estar "adiantada" e o botão trava com o motivo
  const min = Math.min(...group.map((i) => srv.props[i].houses));
  const target = group.find((i) => srv.props[i].houses === min);
  const canBuild = await enabled(page, `[data-mono-build="${target}"]`);
  check("a rua mais atrasada do grupo pode receber casa (botão habilitado)", canBuild || srv.props[target].houses === 5, { target, houses: srv.props[target].houses });
  const cashBefore = srv.players.find((p) => p.id === "Alice").cash;
  if (canBuild && min < 4) {
    await page.evaluate((i) => document.querySelector(`[data-mono-build="${i}"]`).click(), target);
    await waitFor(async () => (await peek(room, edition, "Alice")).props[target].houses === min + 1, 6000, "casa construída");
    srv = await peek(room, edition, "Alice");
    check("construir pela tela cobra o custo da casa e sobe a casa no servidor", srv.props[target].houses === min + 1 && srv.players.find((p) => p.id === "Alice").cash < cashBefore, { target });
    await sleep(500);
    const t = await page.evaluate((i) => document.querySelector(`[data-mono-build="${i}"]`)?.getAttribute("title") || "", target);
    const stillEnabled = await enabled(page, `[data-mono-build="${target}"]`);
    const others = group.filter((i) => i !== target);
    if (others.some((i) => srv.props[i].houses < srv.props[target].houses)) check("a mesma rua não aceita outra casa até as outras alcançarem (botão desabilitado: 'construa parelho')", !stillEnabled && /parelho/i.test(t), { stillEnabled, title: t });
  } else check("(grupo já no limite: pulou a parte de construir mais uma)", true);

  // hipotecar com casa no grupo: bloqueado, com o motivo
  const withHouse = group.find((i) => srv.props[i].houses > 0);
  const mortgageTitle = await page.evaluate((i) => document.querySelector(`[data-mono-mortgage="${i}"]`)?.getAttribute("title") || "", withHouse);
  check("hipotecar rua de grupo com casa fica desabilitado e diz 'venda as construções'", !(await enabled(page, `[data-mono-mortgage="${withHouse}"]`)) && /Venda as construções/i.test(mortgageTitle), mortgageTitle);

  // vender todas as casas, uma a uma, pela tela (sempre a mais construída — a regra manda)
  let sold = 0;
  for (let guard = 0; guard < 30; guard++) {
    const v = await peek(room, edition, "Alice");
    const total = group.reduce((n, i) => n + v.props[i].houses, 0);
    if (total === 0) break;
    const top = Math.max(...group.map((i) => v.props[i].houses));
    const sq = group.find((i) => v.props[i].houses === top);
    // a que NÃO é a mais construída tem 'vender' desabilitado (venda parelha)
    const lower = group.find((i) => v.props[i].houses > 0 && v.props[i].houses < top);
    if (lower !== undefined && sold === 0) {
      check("vender é parelho: só a rua mais construída tem 'vender' habilitado", !(await enabled(page, `[data-mono-sell="${lower}"]`)) && (await enabled(page, `[data-mono-sell="${sq}"]`)), { lower, sq });
    }
    const cash = v.players.find((p) => p.id === "Alice").cash;
    await page.evaluate((i) => document.querySelector(`[data-mono-sell="${i}"]`).click(), sq);
    await waitFor(async () => (await peek(room, edition, "Alice")).props[sq].houses === top - 1, 6000, "casa vendida");
    const after = (await peek(room, edition, "Alice")).players.find((p) => p.id === "Alice").cash;
    if (after <= cash) check("vender devolve metade do custo", false, { cash, after });
    sold++;
    await sleep(120);
  }
  srv = await peek(room, edition, "Alice");
  check(`vendeu as ${sold} casas pela tela e o grupo ficou limpo`, sold > 0 && group.every((i) => srv.props[i].houses === 0), group.map((i) => srv.props[i].houses));
  cmp = await compare(page, edition, room, "Alice");
  check("tela e servidor continuam iguais depois de vender tudo", cmp.ok, cmp.diffs);

  // sem casas: hipotecar uma rua do grupo; as outras não constroem mais (hipoteca no grupo) e o motivo aparece
  const m = group[0];
  await sleep(300);
  check("sem casas no grupo, hipotecar fica habilitado", await enabled(page, `[data-mono-mortgage="${m}"]`));
  const cashBeforeMortgage = srv.players.find((p) => p.id === "Alice").cash;
  await page.evaluate((i) => document.querySelector(`[data-mono-mortgage="${i}"]`).click(), m);
  await waitFor(async () => (await peek(room, edition, "Alice")).props[m].mortgaged, 6000, "hipotecada");
  srv = await peek(room, edition, "Alice");
  check("hipotecar recebe metade do preço", srv.players.find((p) => p.id === "Alice").cash > cashBeforeMortgage);
  await sleep(500);
  const other = group.find((i) => i !== m);
  const buildTitle = await page.evaluate((i) => document.querySelector(`[data-mono-build="${i}"]`)?.getAttribute("title") || "", other);
  check("com uma rua hipotecada no grupo, construir nas outras fica bloqueado com o motivo", !(await enabled(page, `[data-mono-build="${other}"]`)) && /hipotecada/i.test(buildTitle), buildTitle);
  const rowTxt = await page.$eval(`[data-mono-asset="${m}"]`, (e) => e.innerText);
  check("a linha da hipotecada diz 'hipotecada' e oferece tirar a hipoteca", /hipotecada/i.test(rowTxt) && (await present(page, `[data-mono-unmortgage="${m}"]`)), rowTxt);
  const squareState = await page.$eval(`[data-mono-sq="${m}"]`, (e) => e.dataset.mortgaged);
  check("no tabuleiro a casa fica marcada como hipotecada", squareState === "true");
  await page.evaluate((i) => document.querySelector(`[data-mono-unmortgage="${i}"]`).click(), m);
  await waitFor(async () => !(await peek(room, edition, "Alice")).props[m].mortgaged, 6000, "hipoteca tirada");
  check("tirar a hipoteca libera de novo a construção no grupo", await (async () => {
    await sleep(500);
    return enabled(page, `[data-mono-build="${other}"]`);
  })());
  await shot(page, `${edition}-build-dialogo.png`);

  // ── fora da vez o diálogo abre, mas nada de construir
  await click(page, "[data-mono-close]");
  check("nenhum erro de JavaScript na tela", alice.errors.filter((e) => !/favicon|Failed to load resource|ERR_|WebSocket|net::/.test(e)).length === 0, alice.errors.slice(0, 3));
  const errs = [rafa, rita].flatMap((p) => p.errors);
  check("os jogadores crus não tiveram nenhuma ação recusada", errs.every((e) => ["not_your_turn", "wrong_step", "trade_pending"].includes(e)) && errs.length <= 3, errs.slice(0, 6));
  await alice.close();
  raws.forEach((p) => p.close());
};
