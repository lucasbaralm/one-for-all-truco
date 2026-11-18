// Suíte "menu": o menu de jogos, o lobby de cada edição (jogar contra bots / criar / entrar / regras)
// e o seletor de temas. Só precisa do Next e do Supabase de mentira (nenhuma sala é aberta).

const { BASE, suite, check, newUser, waitSel, clickSel, sleep, shot } = require("../kit.cjs");

const THEME_COUNT = 23;

module.exports = async function menu({ browser }) {
  suite("Menu principal");
  const u = await newUser(browser, "Menu");
  const page = u.page;
  await page.goto(`${BASE}/lobby`, { waitUntil: "domcontentloaded" });
  await waitSel(page, 'a[href="/lobby/monopoly"]');

  const cards = await page.$$eval('a[href^="/lobby/"]', (as) => as.map((a) => ({ href: a.getAttribute("href"), text: a.textContent })));
  const hrefs = cards.map((c) => c.href);
  check("o menu tem os 8 jogos", cards.length >= 8 && ["fodinha", "ludo", "dobble", "uno", "forca", "mimica", "monopoly", "banco"].every((g) => hrefs.includes(`/lobby/${g}`)), hrefs);
  const mono = cards.find((c) => c.href === "/lobby/monopoly");
  const banco = cards.find((c) => c.href === "/lobby/banco");
  check("cartão do Monopoly tem título, resumo e chips", /Monopoly/.test(mono.text) && /leilões|falência/i.test(mono.text) && /2–6 jogadores/.test(mono.text) && /Contra bots/.test(mono.text), mono.text);
  check("cartão do Banco Imobiliário tem título, resumo e chips", /Banco Imobiliário/.test(banco.text) && /Sorte ou Revés/.test(banco.text) && /Online/.test(banco.text), banco.text);
  const arts = await page.$$eval('a[href="/lobby/monopoly"] svg, a[href="/lobby/banco"] svg', (s) => s.length);
  check("os dois cartões têm a arte do tabuleiro", arts >= 2, arts);
  await sleep(1800); // os cartões entram com animação
  await shot(page, "menu-principal.png", { fullPage: true });

  for (const edition of ["monopoly", "banco"]) {
    suite(`Lobby — ${edition}`);
    const isBR = edition === "banco";
    await page.goto(`${BASE}/lobby/${edition}`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "[data-mono-play-bots]");
    const body = await page.evaluate(() => document.body.innerText);
    check("título da edição", new RegExp(isBR ? "BANCO IMOBILIÁRIO" : "MONOPOLY").test(body));
    check("diz o dinheiro inicial e se tem leilão", isBR ? /R\$ 2\.500/.test(body) && /sem leilão/.test(body) : /\$1\.500/.test(body) && /· leilão/.test(body), body.slice(0, 400));
    check("regras da edição certa (leilão × sem leilão)", isBR ? /não tem leilão/i.test(body) && /Sorte ou Revés/.test(body) && /Companhias/.test(body) : /vai a LEILÃO/.test(body) && /Caixa Comunitária/.test(body) && /Ferrovias/.test(body));
    const botBtns = await page.$$eval("[data-mono-bots]", (b) => b.map((x) => x.dataset.monoBots));
    check("1 a 5 bots", botBtns.join(",") === "1,2,3,4,5", botBtns);
    const durations = await page.$$eval("[data-mono-duration]", (b) => b.map((x) => x.textContent.trim()));
    check("durações: até a falência, 20 e 40 rodadas", durations.length === 3 && /falência/.test(durations[0]) && /20 rodadas/.test(durations[1]) && /40 rodadas/.test(durations[2]), durations);

    // monta o jogo contra bots
    await clickSel(page, '[data-mono-bots="4"]');
    check("o botão mostra quantos bots", /Jogar contra 4 bots/.test(await page.$eval("[data-mono-play-bots]", (b) => b.textContent)));
    await clickSel(page, '[data-mono-bots="1"]');
    check("no singular", /Jogar contra 1 bot$/.test((await page.$eval("[data-mono-play-bots]", (b) => b.textContent)).trim()));
    await clickSel(page, '[data-mono-bots="4"]');
    await clickSel(page, '[data-mono-level="hard"]');
    await clickSel(page, '[data-mono-duration="20"]');
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), clickSel(page, "[data-mono-play-bots]")]);
    check("'Jogar contra bots' leva pra sala com ?bots&level&limit", new RegExp(`/${edition}/[A-Z]{6}\\?bots=4&level=hard&limit=20$`).test(page.url()), page.url());

    // padrão: 3 bots, médio, 40 rodadas; escolhendo "até a falência" some o limit
    await page.goto(`${BASE}/lobby/${edition}`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "[data-mono-play-bots]");
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), clickSel(page, "[data-mono-play-bots]")]);
    check("padrão: 3 bots, médio, 40 rodadas", new RegExp(`/${edition}/[A-Z]{6}\\?bots=3&level=medium&limit=40$`).test(page.url()), page.url());
    await page.goto(`${BASE}/lobby/${edition}`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "[data-mono-play-bots]");
    await clickSel(page, '[data-mono-duration="0"]');
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), clickSel(page, "[data-mono-play-bots]")]);
    check("'até a falência' não manda limit", new RegExp(`/${edition}/[A-Z]{6}\\?bots=3&level=medium$`).test(page.url()), page.url());

    // criar e entrar por código
    await page.goto(`${BASE}/lobby/${edition}`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "[data-mono-create-room]");
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), clickSel(page, "[data-mono-create-room]")]);
    check("'Criar Sala' abre uma sala de 4 letras", new RegExp(`/${edition}/[A-Z]{4}$`).test(page.url()), page.url());

    await page.goto(`${BASE}/lobby/${edition}`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "#mono-code");
    const disabledBefore = await page.$eval('form button[type="submit"]', (b) => b.disabled);
    await page.type("#mono-code", "ab");
    const disabledTwo = await page.$eval('form button[type="submit"]', (b) => b.disabled);
    await page.type("#mono-code", "cd");
    const value = await page.$eval("#mono-code", (i) => i.value);
    const enabledFour = await page.$eval('form button[type="submit"]', (b) => !b.disabled);
    check("código: só habilita com 3+ letras e vira maiúsculo", disabledBefore && disabledTwo && enabledFour && value === "ABCD", { disabledBefore, disabledTwo, enabledFour, value });
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }), page.keyboard.press("Enter")]);
    check("entrar por código leva pra sala certa", page.url().endsWith(`/${edition}/ABCD`), page.url());
  }
  await shot(page, "lobby-banco.png").catch(() => {});

  // parâmetros estranhos na URL não derrubam a sala (viram o padrão)
  suite("Sala: URL com parâmetros ruins");
  await page.goto(`${BASE}/monopoly/ZZZZ?bots=999&level=godlike&limit=7`, { waitUntil: "domcontentloaded" });
  check("a página abre mesmo assim", !(await page.evaluate(() => /Application error|404/.test(document.body.innerText))));

  // ── temas ───────────────────────────────────────────────────────────────
  suite("Seletor de temas");
  await page.goto(`${BASE}/lobby`, { waitUntil: "domcontentloaded" });
  await waitSel(page, 'a[href="/lobby/monopoly"]');
  const trigger = await page.$('button[aria-label="Escolher tema"]');
  if (check("existe o botão do seletor de temas", !!trigger)) {
    await trigger.click();
    await sleep(500);
    const popover = await page.evaluate(() => {
      const content = document.querySelector("[data-slot='popover-content']");
      const buttons = content ? [...content.querySelectorAll("button[title]")] : [];
      const text = content ? content.innerText : "";
      return { titles: buttons.map((b) => b.getAttribute("title")), text };
    });
    check(`o seletor lista os ${THEME_COUNT} temas`, popover.titles.length === THEME_COUNT, popover.titles.length);
    check("tem os temas de Hora de Aventura e o Bubbline", ["Bubbline", "Finn & Jake", "BMO", "Reino de Gelo", "Marceline", "Reino do Fogo"].every((t) => popover.titles.includes(t)), popover.titles);
    check("os temas aparecem em grupos com título", /hora de aventura/i.test(popover.text) && /clássicos/i.test(popover.text) && /mais temas/i.test(popover.text), popover.text);
    for (const label of ["Bubbline", "Marceline", "Neon"]) {
      await page.evaluate((l) => document.querySelector(`button[title="${l}"]`)?.click(), label);
      await sleep(250);
      const bg = await page.evaluate(() => {
        const el = [...document.querySelectorAll("div")].find((d) => d.style.backgroundImage && d.className.includes("bg-cover"));
        return { image: el?.style.backgroundImage || "", saved: localStorage.getItem("fodinha_theme") };
      });
      const id = { Bubbline: "bubbline", Marceline: "marceline", Neon: "neon" }[label];
      check(`escolher "${label}" troca o fundo e guarda a escolha`, bg.image.includes(`bg_${id}.svg`) && bg.saved === id, bg);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitSel(page, 'a[href="/lobby/monopoly"]');
    await sleep(400);
    const kept = await page.evaluate(() => localStorage.getItem("fodinha_theme"));
    check("o tema escolhido sobrevive ao recarregar", kept === "neon", kept);
    // volta ao padrão pra não influenciar as outras suítes
    await page.evaluate(() => localStorage.setItem("fodinha_theme", "aquarium"));
  }
  check("nenhum erro de JavaScript nas telas do menu", u.errors.filter((e) => !/Failed to load resource|favicon|WebSocket|ERR_/.test(e)).length === 0, u.errors.slice(0, 4));
  await u.close();
};
