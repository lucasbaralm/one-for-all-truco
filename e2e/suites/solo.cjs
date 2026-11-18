// Suíte "solo": uma pessoa jogando PELA TELA contra bots (sala do servidor montada pela URL), do primeiro
// lance de dados ao painel de fim de jogo e à revanche. Confere o tempo todo que a tela diz o mesmo que o
// servidor (dinheiro, peças, donos, casas, hipotecas, dados, vez) e que o histórico foi gravado.

const { BASE, suite, check, newUser, waitSel, sleep, peek, shot } = require("../kit.cjs");
const { GAME_OVER, uiPlayUntil, present, click, screen } = require("../driver.cjs");
const { compare } = require("../common.cjs");

const rid = () => "S" + Math.random().toString(36).slice(2, 7).toUpperCase();

module.exports = async function solo({ browser, stack }, edition = "monopoly") {
  const isBR = edition === "banco";
  const name = "Zeca";
  const room = rid();
  suite(`Solo contra 2 bots (hard, 20 rodadas) — ${edition}`);
  const u = await newUser(browser, name);
  const page = u.page;
  await page.goto(`${BASE}/${edition}/${room}?bots=2&level=hard&limit=20`, { waitUntil: "domcontentloaded" });
  await waitSel(page, "[data-mono-game]", 45000);

  // ── a mesa montada
  const first = await page.evaluate(() => ({
    squares: document.querySelectorAll("[data-mono-sq]").length,
    tiles: document.querySelectorAll("[data-mono-tile]").length,
    tokens: document.querySelectorAll("[data-mono-token]").length,
    title: document.querySelector("header")?.innerText || "",
    body: document.body.innerText,
    corner: document.querySelector('[data-mono-sq="0"]')?.innerText || "",
    jail: document.querySelector('[data-mono-sq="10"]')?.innerText || "",
    parking: document.querySelector('[data-mono-sq="20"]')?.innerText || "",
  }));
  check("o tabuleiro tem as 40 casas", first.squares === 40, first.squares);
  check("3 cartões de jogador e 3 peças", first.tiles === 3 && first.tokens === 3, first);
  check("o título diz a edição e que é contra 2 bots", new RegExp(isBR ? "Banco Imobiliário" : "Monopoly").test(first.title) && /contra 2 bots/.test(first.title) && /Difícil/.test(first.title), first.title);
  check("o canto de partida tem o nome da edição e o salário", isBR ? /PONTO DE PARTIDA/i.test(first.corner) && /R\$ 200/.test(first.corner) : /SAÍDA/i.test(first.corner) && /\$200/.test(first.corner), first.corner);
  check("prisão e estacionamento/parada livre", /PRISÃO/i.test(first.jail) && (isBR ? /PARADA LIVRE/i : /ESTACIONAMENTO/i).test(first.parking), { jail: first.jail, parking: first.parking });
  check("começa com o dinheiro da edição", isBR ? /R\$ 2\.500/.test(first.body) : /\$1\.500/.test(first.body));
  const names = await page.$$eval("[data-mono-sq]", (s) => s.map((x) => x.getAttribute("aria-label")));
  check(isBR ? "os bairros do Banco Imobiliário estão no tabuleiro" : "as ruas do Monopoly estão no tabuleiro",
    (isBR ? ["Leblon", "Av. Paulista", "Ipanema", "Morumbi", "Companhia Ferroviária", "Brooklin"] : ["Mediterranean Avenue", "Boardwalk", "Reading Railroad", "Park Place", "Electric Company"]).every((n) => names.some((x) => x && x.startsWith(n))), names.slice(0, 5));
  await shot(page, `${edition}-solo-inicio.png`);

  // ── o servidor concorda com a tela no começo
  let srv = await peek(room, edition, name);
  check("o servidor é da edição certa e começou a partida", srv.edition === edition && srv.phase === "playing" && srv.players.length === 3 && srv.settings.limit === 20, { e: srv.edition, p: srv.phase, l: srv.settings.limit });
  check("dois bots difíceis e eu", srv.players.filter((p) => p.bot === "hard").length === 2 && srv.players.some((p) => p.id === name && !p.bot));
  check("a visão que o servidor manda não traz o baralho", !("decks" in srv));

  // ── joga até acabar, conferindo tela × servidor a cada 12 jogadas minhas
  let consistentChecks = 0;
  let inconsistent = [];
  let sawAuction = false;
  let sawDebt = false;
  let sawBuild = false;
  let sawMortgage = false;
  const t0 = Date.now();
  const res = await uiPlayUntil(page, {
    timeoutMs: 9 * 60 * 1000,
    opts: { buildBeforeRoll: false },
    every: 40,
    onStep: async (did, counts) => {
      if (did === "build") sawBuild = true;
      if (did === "raise") sawMortgage = true;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total % 12 === 0) {
        const r = await compare(page, edition, room, name).catch((e) => ({ ok: false, diffs: [String(e)] }));
        consistentChecks++;
        if (!r.ok) inconsistent.push(r.diffs.slice(0, 3));
      }
      const s = await screen(page);
      if (s?.step === "auction") sawAuction = true;
      if (s?.step === "debt") sawDebt = true;
    },
  });
  check("a partida chegou ao fim (painel de fim de jogo)", res.over, { counts: res.counts, secs: Math.round((Date.now() - t0) / 1000) });
  check(`tela e servidor concordaram em todas as ${consistentChecks} conferências durante a partida`, inconsistent.length === 0 && consistentChecks >= 3, inconsistent.slice(0, 3));
  check("a tela jogou de tudo: rolou, comprou, encerrou a vez", (res.counts.roll || 0) > 10 && (res.counts.buy || 0) > 1 && (res.counts.end || 0) > 5, res.counts);
  if (isBR) check("Banco Imobiliário nunca abre leilão", !sawAuction);
  else check("Monopoly: recusar abriu leilão pelo menos uma vez (ou ninguém recusou)", sawAuction || (res.counts.decline || 0) === 0, res.counts);
  console.log(`  · jogadas: ${JSON.stringify(res.counts)} leilão=${sawAuction} dívida=${sawDebt} casas=${sawBuild} hipoteca/venda=${sawMortgage}`);

  // ── fim de jogo
  if (res.over) {
    const over = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? { text: el.innerText, rows: el.querySelectorAll(".rounded-xl.px-3").length, buttons: [...el.querySelectorAll("button")].map((b) => b.innerText.trim()) } : null;
    }, GAME_OVER);
    srv = await peek(room, edition, name);
    check("o servidor também encerrou: fase game_over, vencedor e classificação de 3", srv.phase === "game_over" && !!srv.winnerId && srv.standings?.length === 3, { phase: srv.phase, w: srv.winnerId });
    check("o painel mostra uma linha por jogador", over.rows === 3, over.rows);
    const winner = srv.players.find((p) => p.id === srv.winnerId);
    check("o painel diz quem venceu do MEU ponto de vista", srv.winnerId === name ? /Você venceu/.test(over.text) : new RegExp(`Você ficou em [23]º lugar`).test(over.text) && over.text.includes(winner.name), over.text.slice(0, 160));
    check("o painel mostra patrimônio e estatísticas", /patrimônio|faliu/i.test(over.text) && /propriedade|aluguel/i.test(over.text), over.text.slice(0, 400));
    check("botões: jogar de novo e sair", over.buttons.some((b) => /Jogar de novo/.test(b)) && over.buttons.some((b) => /Sair/.test(b)), over.buttons);
    check("a classificação é ordenada por patrimônio (vivos) — o 1º é o vencedor", srv.standings[0].playerId === srv.winnerId && srv.standings.filter((s) => !s.bankrupt).every((s, i, a) => i === 0 || a[i - 1].netWorth >= s.netWorth));
    await shot(page, `${edition}-solo-fim.png`);

    const hist = stack.mock.history.filter((h) => h.room_id === `${isBR ? "BANCO" : "MONOPOLY"}:${room}`);
    check("o histórico foi gravado no Supabase (prefixo da edição) com o vencedor", hist.length === 1 && hist[0].winner_name === winner.name && Array.isArray(hist[0].players_summary) && hist[0].players_summary.length === 3, hist);

    // ── revanche: sozinho contra bots, começa outra partida na hora
    await click(page, "button:not([disabled])").catch(() => {});
    const clicked = await page.evaluate((sel) => {
      const b = [...document.querySelector(sel).querySelectorAll("button")].find((x) => /Jogar de novo/.test(x.innerText));
      if (!b) return false;
      b.click();
      return true;
    }, GAME_OVER);
    check("clicou em 'Jogar de novo'", clicked);
    await page.waitForFunction((sel) => !document.querySelector(sel) && document.querySelectorAll("[data-mono-tile]").length === 3, { timeout: 20000 }, GAME_OVER).catch(() => {});
    await sleep(600);
    srv = await peek(room, edition, name);
    check("revanche: partida nova (gameNumber 2) já rolando contra os mesmos bots", srv.gameNumber === 2 && srv.phase === "playing" && srv.players.length === 3, { n: srv.gameNumber, p: srv.phase });
    // (os bots já podem ter jogado alguns lances até aqui: confere que NADA da partida velha ficou)
    check("revanche: ninguém falido, classificação e vencedor zerados, rodada 1", srv.players.every((p) => !p.bankrupt) && srv.standings === null && srv.winnerId === null && srv.round <= 2, { round: srv.round });
    check("revanche: o dinheiro é o de uma partida nova (ninguém com o patrimônio da anterior)", srv.players.every((p) => p.cash <= (isBR ? 2500 : 1500) + 400) && srv.props.filter((p) => p && p.owner).length <= 6, srv.players.map((p) => p.cash));
    const again = await compare(page, edition, room, name);
    check("revanche: a tela mostra a partida nova", again.ok, again.diffs);
    check("o histórico da partida nova começou do zero", await page.evaluate(() => !document.querySelector(".fixed.inset-0")?.innerText?.includes("Fim de jogo")));
  }

  const errs = u.errors.filter((e) => !/favicon|Failed to load resource|ERR_|WebSocket|net::/.test(e));
  check("nenhum erro de JavaScript na tela durante a partida", errs.length === 0, errs.slice(0, 4));
  await u.close();
};
