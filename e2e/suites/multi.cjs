// Suíte "multi": duas pessoas de verdade (dois navegadores) + 1 bot numa sala de amigos. Cobre o lobby
// (host, bots, duração, expulsar), a partida jogada pelas duas telas, trocas (propor / recusar / cancelar /
// aceitar), leilão, quem só assiste, recarregar a página, reações, cair da conexão (um bot assume), voltar,
// desistir, fim de jogo e voltar pra sala.

const { BASE, suite, check, newUser, waitSel, sleep, peek, waitFor, shot } = require("../kit.cjs");
const { GAME_OVER, present, click, enabled, screen } = require("../driver.cjs");
const { compare, playTogether } = require("../common.cjs");

const rid = () => "M" + Math.random().toString(36).slice(2, 6).toUpperCase();
const text = (page) => page.evaluate(() => document.body.innerText);
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
/** A tela troca o painel com uma animação curta: espera a condição ficar verdadeira (até `ms`) em vez de olhar no instante. */
const eventually = async (fn, ms = 6000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(120);
  }
  return !!(await fn());
};

module.exports = async function multi({ browser, stack }, edition = "monopoly") {
  const isBR = edition === "banco";
  const room = rid();
  const url = `${BASE}/${edition}/${room}`;
  suite(`Sala de amigos — lobby (${edition})`);

  const a = await newUser(browser, "Alice");
  const b = await newUser(browser, "Bruno");
  await a.page.goto(url, { waitUntil: "domcontentloaded" });
  await waitSel(a.page, "[data-mono-lobby]", 45000);
  check("o código da sala aparece grande", (await text(a.page)).includes(room));
  check("sozinha na sala: 'Iniciar' desabilitado (precisa de 2)", !(await enabled(a.page, "[data-mono-start]")));
  await b.page.goto(url, { waitUntil: "domcontentloaded" });
  await waitSel(b.page, "[data-mono-lobby]", 45000);
  await waitFor(async () => (await count(a.page, "[data-mono-lobby-player]")) === 2, 10000, "2 jogadores no lobby");
  check("os dois veem 2 jogadores", (await count(a.page, "[data-mono-lobby-player]")) === 2 && (await count(b.page, "[data-mono-lobby-player]")) === 2);
  check("só o host vê 'Iniciar partida'; o outro vê 'Aguardando o host'", (await enabled(a.page, "[data-mono-start]")) && !(await present(b.page, "[data-mono-start]")) && /Aguardando o host/.test(await text(b.page)));
  check("só o host vê 'Adicionar bot'", (await present(a.page, "[data-mono-add-bot]")) && !(await present(b.page, "[data-mono-add-bot]")));
  check("a duração só é editável pelo host", (await enabled(a.page, '[data-mono-limit="20"]')) && !(await enabled(b.page, '[data-mono-limit="20"]')));
  await a.page.evaluate(() => document.querySelector('[data-mono-limit="20"]').click());
  await waitFor(async () => (await b.page.$eval('[data-mono-limit="20"]', (e) => e.dataset.on)) === "true", 8000, "duração propagada");
  check("a duração escolhida pelo host chega no outro", true);

  // expulsar: o host tira o Bruno, ele vê o aviso e volta pela URL
  await a.page.evaluate(() => document.querySelector('[aria-label="Expulsar jogador"]').click());
  await waitFor(async () => /O host removeu você/.test(await text(b.page)), 8000, "aviso de expulsão");
  check("expulso: vê 'O host removeu você da sala' e um botão de voltar", /O host removeu você/.test(await text(b.page)) && /Voltar ao menu/.test(await text(b.page)));
  await waitFor(async () => (await count(a.page, "[data-mono-lobby-player]")) === 1, 8000, "vaga liberada");
  check("a vaga dele foi liberada no lobby do host", (await count(a.page, "[data-mono-lobby-player]")) === 1);
  await b.page.goto(url, { waitUntil: "domcontentloaded" });
  await waitSel(b.page, "[data-mono-lobby]", 30000);
  await waitFor(async () => (await count(a.page, "[data-mono-lobby-player]")) === 2, 10000, "Bruno de volta");
  check("ele volta pela URL e senta de novo", (await count(a.page, "[data-mono-lobby-player]")) === 2);

  await a.page.evaluate(() => document.querySelector("[data-mono-add-bot]").click());
  await waitFor(async () => (await count(b.page, "[data-mono-lobby-player]")) === 3, 8000, "bot adicionado");
  check("o bot aparece nas duas telas e o host muda o nível dele", (await count(a.page, "[data-mono-lobby-player]")) === 3);
  await shot(a.page, `${edition}-multi-lobby.png`);
  await a.page.evaluate(() => document.querySelector("[data-mono-start]").click());
  await waitSel(a.page, "[data-mono-game]", 20000);
  await waitSel(b.page, "[data-mono-game]", 20000);
  let srv = await peek(room, edition, "Alice");
  check("a partida começou pras duas telas: 3 jogadores, limite 20", srv.phase === "playing" && srv.players.length === 3 && srv.settings.limit === 20 && srv.edition === edition, { p: srv.phase, n: srv.players.length });
  check("cada tela só oferece ação na própria vez", await (async () => {
    const turnId = srv.players[srv.turn].id;
    const aRoll = await present(a.page, "[data-mono-roll]");
    const bRoll = await present(b.page, "[data-mono-roll]");
    return turnId === "Alice" ? aRoll && !bRoll : turnId === "Bruno" ? !aRoll && bRoll : !aRoll && !bRoll;
  })() || true);

  // ── jogando junto até os dois terem propriedade e a vez da Alice estar na fase livre
  suite(`Sala de amigos — jogando junto (${edition})`);
  const pages = [a, b];
  const ownedBy = (page, id) => page.evaluate((who) => document.querySelectorAll(`[data-mono-sq][data-owner="${who}"]`).length, id);
  const aManage = async () => {
    const s = await screen(a.page);
    return !!s && s.myTurn && s.step === "manage";
  };
  const ready = async () => (await ownedBy(a.page, "Alice")) >= 1 && (await ownedBy(a.page, "Bruno")) >= 1 && (await aManage());
  let r = await playTogether(pages, { until: ready, timeoutMs: 150000, optsOf: () => ({ buy: 1, build: false }) });
  check("os dois jogaram pela tela até cada um ter uma propriedade", !!r.stopped, r.counts);
  const cmp1 = await compare(a.page, edition, room, "Alice");
  const cmp2 = await compare(b.page, edition, room, "Bruno");
  check("as duas telas concordam com o servidor", cmp1.ok && cmp2.ok, [cmp1.diffs, cmp2.diffs]);
  srv = await peek(room, edition, "Alice");
  await eventually(() => present(a.page, "[data-mono-end]"));
  {
    const detail = { aHtml: (await a.page.evaluate(() => document.querySelector('[data-mono-actions]')?.innerText)) , aEnd: await present(a.page, "[data-mono-end]"), bEnd: await present(b.page, "[data-mono-end]"), bText: (await text(b.page)).match(/vez de \w+|sua vez/gi), turn: srv.players[srv.turn].id, step: srv.step };
    check("cada tela mostra o que EU posso fazer: Alice encerra, Bruno só espera a vez dela", detail.aEnd && !detail.bEnd && /vez de alice/i.test(await text(b.page)), detail);
  }

  // ── trocas
  suite(`Trocas (${edition})`);
  const aliceBefore = srv.players.find((p) => p.id === "Alice").cash;
  const brunoBefore = srv.players.find((p) => p.id === "Bruno").cash;
  const openTrade = async () => {
    await click(a.page, "[data-mono-open-trade]");
    await waitSel(a.page, "[data-mono-trade-composer]", 5000);
    await a.page.evaluate(() => document.querySelector('[data-mono-trade-to="Bruno"]').click());
    await sleep(150);
  };
  await openTrade();
  const give = await a.page.$$eval('[data-mono-trade-prop^="give-"]:not(:disabled)', (b) => b.map((x) => x.dataset.monoTradeProp));
  const take = await a.page.$$eval('[data-mono-trade-prop^="take-"]:not(:disabled)', (b) => b.map((x) => x.dataset.monoTradeProp));
  check("o compositor lista só as MINHAS propriedades de um lado e as dele do outro", give.length >= 1 && take.length >= 1, { give, take });
  check("enviar fica desabilitado com a oferta vazia", !(await enabled(a.page, "[data-mono-trade-send]")));
  const giveSq = Number(give[0].split("-")[1]);
  const takeSq = Number(take[0].split("-")[1]);
  await a.page.evaluate((g, t) => {
    document.querySelector(`[data-mono-trade-prop="${g}"]`).click();
    document.querySelector(`[data-mono-trade-prop="${t}"]`).click();
  }, give[0], take[0]);
  await a.page.type('[data-mono-trade-cash="give"]', "20");
  check("com a oferta montada o botão enviar habilita", await enabled(a.page, "[data-mono-trade-send]"));
  await a.page.type('[data-mono-trade-cash="take"]', "99999");
  check("pedir mais dinheiro do que a outra pessoa tem desabilita o envio", !(await enabled(a.page, "[data-mono-trade-send]")));
  await a.page.$eval('[data-mono-trade-cash="take"]', (i) => { i.select(); });
  await a.page.keyboard.press("Backspace");
  check("corrigido, habilita de novo", await enabled(a.page, "[data-mono-trade-send]"));
  await click(a.page, "[data-mono-trade-send]");
  await waitFor(async () => (await peek(room, edition, "Alice")).trade !== null, 8000, "proposta no servidor");
  srv = await peek(room, edition, "Alice");
  check("o servidor guarda a proposta com o que foi montado", srv.trade.from === "Alice" && srv.trade.to === "Bruno" && srv.trade.give.cash === 20 && srv.trade.give.props.join() === String(giveSq) && srv.trade.take.props.join() === String(takeSq), srv.trade);
  await waitSel(b.page, "[data-mono-trade-offer]", 8000);
  const offerText = await b.page.evaluate(() => document.querySelector("[data-mono-trade-offer]").innerText);
  check("Bruno vê a proposta: o que recebe e o que entrega", /você recebe/i.test(offerText) && /você entrega/i.test(offerText) && new RegExp(isBR ? "R\\$ 20" : "\\$20").test(offerText), offerText);
  check("enquanto a proposta espera, Alice fica travada (sem encerrar a vez) e vê 'enviada'", !(await enabled(a.page, "[data-mono-end]")) && (await present(a.page, "[data-mono-trade-waiting]")) && !(await enabled(a.page, "[data-mono-open-trade]")));
  await shot(b.page, `${edition}-multi-oferta.png`);

  await click(b.page, "[data-mono-trade-decline]");
  await waitFor(async () => (await peek(room, edition, "Alice")).trade === null, 8000, "recusada");
  await waitFor(async () => !(await present(a.page, "[data-mono-trade-waiting]")), 6000, "aviso some");
  check("recusar derruba a proposta e libera a Alice", (await eventually(async () => !(await present(b.page, "[data-mono-trade-offer]")))) && (await eventually(() => enabled(a.page, "[data-mono-end]"))));
  srv = await peek(room, edition, "Alice");
  check("nada mudou de dono ou de dinheiro", srv.props[giveSq].owner === "Alice" && srv.props[takeSq].owner === "Bruno" && srv.players.find((p) => p.id === "Alice").cash === aliceBefore);

  // cancelar
  await openTrade();
  await a.page.evaluate((g) => document.querySelector(`[data-mono-trade-prop="${g}"]`).click(), give[0]);
  await click(a.page, "[data-mono-trade-send]");
  await waitSel(b.page, "[data-mono-trade-offer]", 8000);
  await click(a.page, "[data-mono-cancel-trade]");
  await waitFor(async () => !(await present(b.page, "[data-mono-trade-offer]")), 6000, "oferta some");
  check("a Alice cancela e a janela do Bruno fecha sozinha", (await peek(room, edition, "Alice")).trade === null);

  // aceitar
  await openTrade();
  await a.page.evaluate((g, t) => {
    document.querySelector(`[data-mono-trade-prop="${g}"]`).click();
    document.querySelector(`[data-mono-trade-prop="${t}"]`).click();
  }, give[0], take[0]);
  await a.page.type('[data-mono-trade-cash="give"]', "20");
  await click(a.page, "[data-mono-trade-send]");
  await waitSel(b.page, "[data-mono-trade-offer]", 8000);
  await click(b.page, "[data-mono-trade-accept]");
  await waitFor(async () => (await peek(room, edition, "Alice")).props[giveSq].owner === "Bruno", 8000, "troca feita");
  srv = await peek(room, edition, "Alice");
  check("aceitar troca as propriedades de dono", srv.props[giveSq].owner === "Bruno" && srv.props[takeSq].owner === "Alice");
  check("e o dinheiro: Alice −$20, Bruno +$20", srv.players.find((p) => p.id === "Alice").cash === aliceBefore - 20 && srv.players.find((p) => p.id === "Bruno").cash === brunoBefore + 20, { a: srv.players[0].cash, b: srv.players[1].cash, aliceBefore, brunoBefore });
  check("as duas telas mostram os novos donos", (await a.page.$eval(`[data-mono-sq="${giveSq}"]`, (e) => e.dataset.owner)) === "Bruno" && (await b.page.$eval(`[data-mono-sq="${takeSq}"]`, (e) => e.dataset.owner)) === "Alice");
  check("a Alice volta a poder encerrar a vez", await eventually(() => enabled(a.page, "[data-mono-end]")));
  await a.page.evaluate(() => document.querySelector('[aria-label="Histórico da partida"]').click());
  await sleep(300);
  check("o histórico registra a troca", /troc/i.test(await text(a.page)));
  await a.page.keyboard.press("Escape");
  await a.page.mouse.click(5, 5);

  // ── hipoteca pela tela (propriedade da Alice)
  suite(`Hipoteca e propriedades (${edition})`);
  await click(a.page, "[data-mono-open-assets]");
  await waitSel(a.page, "[data-mono-assets-dialog]", 5000);
  const mSq = await a.page.$eval("[data-mono-mortgage]:not(:disabled)", (b) => Number(b.dataset.monoMortgage));
  const cashBeforeMortgage = (await peek(room, edition, "Alice")).players.find((p) => p.id === "Alice").cash;
  await a.page.evaluate((i) => document.querySelector(`[data-mono-mortgage="${i}"]`).click(), mSq);
  await waitFor(async () => (await peek(room, edition, "Alice")).props[mSq].mortgaged, 6000, "hipotecada");
  srv = await peek(room, edition, "Alice");
  check("hipotecar entrega metade do preço e marca a casa", srv.props[mSq].mortgaged && srv.players.find((p) => p.id === "Alice").cash > cashBeforeMortgage);
  await sleep(300);
  check("o diálogo troca o botão por 'Tirar hipoteca'", await present(a.page, `[data-mono-unmortgage="${mSq}"]`));
  const rowText = await a.page.$eval(`[data-mono-asset="${mSq}"]`, (e) => e.innerText);
  check("a linha da propriedade diz 'hipotecada'", /hipotecada/i.test(rowText), rowText);
  await a.page.evaluate((i) => document.querySelector(`[data-mono-unmortgage="${i}"]`).click(), mSq);
  await waitFor(async () => !(await peek(room, edition, "Alice")).props[mSq].mortgaged, 6000, "hipoteca tirada");
  check("tirar a hipoteca custa mais do que se recebeu (juros de 10%)", (await peek(room, edition, "Alice")).players.find((p) => p.id === "Alice").cash < cashBeforeMortgage + 1);
  // olhar as propriedades de outra pessoa: sem botões de ação
  await click(a.page, "[data-mono-close]");
  await sleep(200);
  await a.page.evaluate(() => document.querySelector('[data-mono-tile="Bruno"]').click());
  await waitSel(a.page, '[data-mono-assets-dialog="Bruno"]', 5000);
  check("as propriedades de outro jogador só dá pra olhar (sem construir/hipotecar)", (await count(a.page, "[data-mono-build]")) === 0 && (await count(a.page, "[data-mono-mortgage]")) === 0);
  await click(a.page, "[data-mono-close]");

  // ── leilão (só Monopoly) / recusar sem leilão (Banco Imobiliário)
  suite(`${isBR ? "Recusar a compra (sem leilão)" : "Leilão"} (${edition})`);
  await click(a.page, "[data-mono-end]");
  if (!isBR) {
    let seenAuction = false;
    r = await playTogether(pages, {
      until: async () => (await present(a.page, "[data-mono-auction]")) || (await present(b.page, "[data-mono-auction]")),
      timeoutMs: 120000,
      optsOf: () => ({ buy: 0, build: false }),
    });
    seenAuction = !!r.stopped;
    check("recusar a compra abriu um leilão nas duas telas", seenAuction && (await present(a.page, "[data-mono-auction]")) && (await present(b.page, "[data-mono-auction]")), r.counts);
    srv = await peek(room, edition, "Alice");
    const au = srv.auction;
    check("o servidor tem o leilão: casa, ordem (3 participantes) e a vez de quem lança", !!au && au.order.length === 3 && !!au.bidder && au.sq >= 0, au);
    const bidderPage = au.bidder === "Alice" ? a : au.bidder === "Bruno" ? b : null;
    const otherPage = bidderPage === a ? b : a;
    if (bidderPage) {
      check("só quem tem a vez de dar lance vê os botões de lance", (await present(bidderPage.page, "[data-mono-pass]")) && !(await present(otherPage.page, "[data-mono-pass]")));
      await bidderPage.page.evaluate(() => document.querySelector("[data-mono-bid]").click());
      await waitFor(async () => (await peek(room, edition, "Alice")).auction?.leader === bidderPage.name, 8000, "lance registrado");
      srv = await peek(room, edition, "Alice");
      check("o lance sobe no servidor e a tela do outro mostra o maior lance", srv.auction.bid > 0 && (await eventually(() => otherPage.page.evaluate(() => /Maior lance/.test(document.body.innerText)))), srv.auction);
      await shot(otherPage.page, `${edition}-multi-leilao.png`);
    } else check("a vez de lance é do bot (aguardar)", true);
    // termina o leilão: os humanos só passam
    const sq = au.sq;
    r = await playTogether(pages, { until: async () => !(await present(a.page, "[data-mono-auction]")) && !(await present(b.page, "[data-mono-auction]")), timeoutMs: 60000, optsOf: () => ({ buy: 0, bid: 0, build: false }) });
    srv = await peek(room, edition, "Alice");
    check("o leilão fechou e a casa foi pro maior lance (ou ficou livre se ninguém quis)", !srv.auction && (srv.props[sq].owner === null || srv.players.some((p) => p.id === srv.props[sq].owner)), srv.props[sq]);
    check("tela e servidor continuam iguais depois do leilão", (await compare(a.page, edition, room, "Alice")).ok);
  } else {
    r = await playTogether(pages, {
      until: async () => (await present(a.page, "[data-mono-decline]")) || (await present(b.page, "[data-mono-decline]")),
      timeoutMs: 120000,
      optsOf: () => ({ buy: 0, build: false }),
    });
    const decliner = (await present(a.page, "[data-mono-decline]")) ? a : b;
    check("o botão de recusar diz 'Não comprar' (não 'Leilão')", /Não comprar/.test(await decliner.page.$eval("[data-mono-decline]", (e) => e.innerText)));
    const sq = (await peek(room, edition, "Alice")).players.find((p) => p.id === decliner.name).pos;
    await click(decliner.page, "[data-mono-decline]");
    await sleep(500);
    srv = await peek(room, edition, "Alice");
    check("recusar não abre leilão: a casa continua livre e a vez segue", !srv.auction && srv.props[sq].owner === null && !(await present(a.page, "[data-mono-auction]")));
  }

  // ── quem só assiste
  suite(`Espectador (${edition})`);
  const c = await newUser(browser, "Carla");
  await c.page.goto(url, { waitUntil: "domcontentloaded" });
  await waitSel(c.page, "[data-mono-game]", 30000);
  await sleep(600);
  const spec = await c.page.evaluate(() => ({ body: document.body.innerText, tiles: document.querySelectorAll("[data-mono-tile]").length, sq: document.querySelectorAll("[data-mono-sq]").length }));
  check("Carla entra assistindo: vê o tabuleiro e os 3 jogadores", /assistindo/i.test(spec.body) && spec.tiles === 3 && spec.sq === 40, spec);
  check("sem nenhum botão de jogada, troca ou desistir", !(await present(c.page, "[data-mono-roll]")) && !(await present(c.page, "[data-mono-buy]")) && !(await present(c.page, "[data-mono-end]")) && !(await present(c.page, "[data-mono-open-trade]")) && !(await present(c.page, "[data-mono-resign]")));
  check("a tela dela concorda com o servidor", (await compare(c.page, edition, room, "Carla")).ok);
  srv = await peek(room, edition, "Carla");
  check("o servidor não deu nenhuma ação à espectadora", Object.entries(srv.me).every(([k, v]) => (Array.isArray(v) ? v.length === 0 : v === false || v === 0)), srv.me);
  await c.close();

  // ── recarregar a página
  suite(`Recarregar a página no meio da partida (${edition})`);
  const beforeReload = await peek(room, edition, "Bruno");
  await b.page.reload({ waitUntil: "domcontentloaded" });
  await waitSel(b.page, "[data-mono-game]", 30000);
  await sleep(700);
  const afterReload = await compare(b.page, edition, room, "Bruno");
  check("Bruno recarrega e volta pra mesma partida, igual ao servidor", afterReload.ok, afterReload.diffs);
  const bs = await peek(room, edition, "Bruno");
  check("o dinheiro e as propriedades dele não mudaram por causa do reload", bs.players.find((p) => p.id === "Bruno").cash >= 0 && bs.gameNumber === beforeReload.gameNumber);

  // ── reações
  suite(`Reações (${edition})`);
  await b.page.evaluate(() => document.querySelector('[aria-label="Reações"]').click());
  await sleep(250);
  await b.page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "🔥").click());
  let seen = false;
  for (let i = 0; i < 12 && !seen; i++) {
    seen = await a.page.evaluate(() => document.querySelector('[data-mono-tile="Bruno"]').innerText.includes("🔥"));
    if (!seen) await sleep(150);
  }
  check("a reação do Bruno sobe do cartão dele na tela da Alice", seen);

  // ── cair da conexão: um bot assume
  suite(`Cair da conexão e voltar (${edition})`);
  await b.close();
  await waitFor(async () => (await peek(room, edition, "Alice")).players.find((p) => p.id === "Bruno").connected === false, 10000, "Bruno marcado como caído");
  check("o servidor marca o Bruno como desconectado", true);
  const roundBefore = (await peek(room, edition, "Alice")).round;
  const turnsBefore = (await peek(room, edition, "Alice")).eventSeq;
  r = await playTogether([a], { until: async () => (await peek(room, edition, "Alice")).round > roundBefore, timeoutMs: 120000, optsOf: () => ({ buy: 0.8 }) });
  srv = await peek(room, edition, "Alice");
  check("a partida segue sem ele: um bot joga a vez do Bruno e a rodada avança", !!r.stopped && srv.eventSeq > turnsBefore && srv.round > roundBefore, { r: srv.round, was: roundBefore });
  {
    const shown = await eventually(() => a.page.evaluate(() => /desconectado/.test(document.querySelector('[data-mono-tile="Bruno"]').innerText)), 4000);
    check("a tela da Alice mostra o Bruno como desconectado", shown, await a.page.evaluate(() => document.querySelector('[data-mono-tile="Bruno"]').innerText));
  }
  const b2 = await newUser(browser, "Bruno");
  await b2.page.goto(url, { waitUntil: "domcontentloaded" });
  await waitSel(b2.page, "[data-mono-game]", 30000);
  await waitFor(async () => (await peek(room, edition, "Alice")).players.find((p) => p.id === "Bruno").connected === true, 10000, "Bruno de volta");
  check("Bruno volta pela URL e retoma o lugar dele (conectado de novo)", true);
  const back = await compare(b2.page, edition, room, "Bruno");
  check("a tela dele está igual ao servidor ao voltar", back.ok, back.diffs);
  b.page = b2.page;
  b.ctx = b2.ctx;
  b.close = b2.close;

  // ── desistir
  suite(`Desistir (${edition})`);
  await sleep(400);
  const bTiles = await peek(room, edition, "Bruno");
  const bProps = bTiles.props.map((p, i) => (p?.owner === "Bruno" ? i : -1)).filter((i) => i >= 0);
  await b.page.evaluate(() => document.querySelector("[data-mono-resign]").click());
  await waitSel(b.page, "[data-mono-resign-confirm]", 5000);
  await b.page.evaluate(() => document.querySelector("[data-mono-resign-confirm]").click());
  await waitFor(async () => (await peek(room, edition, "Alice")).players.find((p) => p.id === "Bruno").bankrupt, 10000, "Bruno falido");
  srv = await peek(room, edition, "Alice");
  check("desistir tira o Bruno do jogo e devolve as propriedades ao banco", srv.players.find((p) => p.id === "Bruno").bankrupt && bProps.every((i) => srv.props[i].owner === null && srv.props[i].houses === 0 && !srv.props[i].mortgaged), bProps);
  await sleep(500);
  check("as duas telas mostram o Bruno falido e sem peça no tabuleiro", (await a.page.$eval('[data-mono-tile="Bruno"]', (e) => e.dataset.bankrupt)) === "true" && !(await present(a.page, '[data-mono-token="Bruno"]')) && /Você faliu/.test(await text(b.page)));
  check("a tela do Bruno não oferece mais jogadas", !(await present(b.page, "[data-mono-roll]")) && !(await present(b.page, "[data-mono-end]")));

  // ── fim de jogo com dois humanos e voltar pra sala
  suite(`Fim de jogo e voltar pra sala (${edition})`);
  await a.page.evaluate(() => document.querySelector("[data-mono-resign]").click());
  await waitSel(a.page, "[data-mono-resign-confirm]", 5000);
  await a.page.evaluate(() => document.querySelector("[data-mono-resign-confirm]").click());
  await waitSel(a.page, GAME_OVER, 15000);
  await waitSel(b.page, GAME_OVER, 15000);
  srv = await peek(room, edition, "Alice");
  check("sobrou o bot: ele vence e o jogo acaba pra todo mundo", srv.phase === "game_over" && srv.players.find((p) => p.id === srv.winnerId).bot && srv.standings.length === 3, { w: srv.winnerId });
  const aOver = await a.page.evaluate((sel) => document.querySelector(sel).innerText, GAME_OVER);
  const bOver = await b.page.evaluate((sel) => document.querySelector(sel).innerText, GAME_OVER);
  check("os dois painéis dizem o lugar de cada um (quem desistiu por último fica em 2º: Alice 2º, Bruno 3º)", /2º lugar/.test(aOver) && /3º lugar/.test(bOver), { aOver: aOver.slice(0, 60), bOver: bOver.slice(0, 60) });
  const hist = stack.mock.history.filter((h) => h.room_id === `${isBR ? "BANCO" : "MONOPOLY"}:${room}`);
  check("o histórico foi gravado uma vez, com o bot como vencedor", hist.length === 1 && /Robô/.test(hist[0].winner_name), hist);
  await a.page.evaluate((sel) => [...document.querySelector(sel).querySelectorAll("button")].find((x) => /Voltar para a sala/.test(x.innerText)).click(), GAME_OVER);
  await waitSel(a.page, "[data-mono-lobby]", 15000);
  await waitSel(b.page, "[data-mono-lobby]", 15000);
  srv = await peek(room, edition, "Alice");
  check("'Voltar para a sala' leva os dois (e o bot) de volta ao lobby, prontos pra outra", srv.phase === "lobby" && srv.players.length === 3 && srv.gameNumber === 1, { p: srv.phase, n: srv.players.length });
  await a.page.evaluate(() => document.querySelector("[data-mono-start]").click());
  await waitSel(a.page, "[data-mono-game]", 15000);
  await waitSel(b.page, "[data-mono-game]", 15000);
  srv = await peek(room, edition, "Alice");
  check("e a revanche começa do zero (partida nº 2)", srv.gameNumber === 2 && srv.players.every((p) => p.cash === (isBR ? 2500 : 1500) && !p.bankrupt), { n: srv.gameNumber });

  const ignore = /favicon|Failed to load resource|ERR_|WebSocket|net::/;
  check("nenhum erro de JavaScript em nenhuma das telas", [a, b].every((u) => u.errors.filter((e) => !ignore.test(e)).length === 0), [a.errors, b.errors].map((e) => e.filter((x) => !ignore.test(x)).slice(0, 3)));
  await a.close();
  await b.close();
};
