// Suíte "errors": o que a pessoa vê quando algo não está certo — sem login, login recusado pelo servidor de
// jogo, código de sala em minúsculas, e que o menu continua saudável.

const { BASE, suite, check, newUser, waitSel, sleep } = require("../kit.cjs");

module.exports = async function errors({ browser }) {
  suite("Erros: sem login");
  const anon = await browser.createIncognitoBrowserContext();
  const ap = await anon.newPage();
  await ap.setCookie({ name: "fodinha_gate", value: "1", url: BASE });
  await ap.goto(`${BASE}/monopoly/ABCD`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  check("sem sessão, a sala manda de volta pro login", new URL(ap.url()).pathname === "/", ap.url());
  await ap.goto(`${BASE}/banco/ABCD`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  check("o mesmo no Banco Imobiliário", new URL(ap.url()).pathname === "/", ap.url());
  await anon.close();

  suite("Erros: o portão do site");
  const gate = await browser.createIncognitoBrowserContext();
  const gp = await gate.newPage();
  await gp.goto(`${BASE}/monopoly/ABCD`, { waitUntil: "domcontentloaded" });
  check("sem o cookie do portão, a sala redireciona pro /gate com o destino guardado", new URL(gp.url()).pathname === "/gate" && /next=%2Fmonopoly%2FABCD/.test(gp.url()), gp.url());
  await gate.close();

  suite("Erros: login recusado pelo servidor de jogo");
  const bad = await newUser(browser, "Intruso", { token: "lixo-que-nao-e-do-supabase" });
  await bad.page.goto(`${BASE}/monopoly/ERR1`, { waitUntil: "domcontentloaded" });
  await waitSel(bad.page, "button", 20000);
  await bad.page.waitForFunction(() => /não aceitou o seu login/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  const body = await bad.page.evaluate(() => document.body.innerText);
  check("o painel diz que o servidor não aceitou o login, em vez de ficar girando", /não aceitou o seu login/.test(body), body.slice(0, 200));
  check("oferece 'Entrar de novo' e voltar ao menu da edição", /Entrar de novo/.test(body) && /Voltar ao menu do Monopoly/.test(body), body.slice(0, 300));
  await bad.page.goto(`${BASE}/banco/ERR2`, { waitUntil: "domcontentloaded" });
  await bad.page.waitForFunction(() => /não aceitou o seu login/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  const body2 = await bad.page.evaluate(() => document.body.innerText);
  check("no Banco Imobiliário também (com o botão certo de voltar)", /não aceitou o seu login/.test(body2) && /Voltar ao menu do Banco Imobiliário/.test(body2), body2.slice(0, 300));
  await bad.close();

  suite("Sala: código em minúsculas");
  const u = await newUser(browser, "Minuscula");
  await u.page.goto(`${BASE}/monopoly/xyzw`, { waitUntil: "domcontentloaded" });
  await waitSel(u.page, "[data-mono-lobby]", 45000);
  check("o código é normalizado pra maiúsculas na sala", (await u.page.evaluate(() => document.querySelector("[data-mono-lobby] h1").innerText)) === "XYZW");
  await u.page.click("[data-mono-lobby-exit]");
  await u.page.waitForFunction(() => location.pathname === "/lobby/monopoly", { timeout: 15000 }).catch(() => {});
  check("'Sair' do lobby volta pro menu do Monopoly", new URL(u.page.url()).pathname === "/lobby/monopoly", u.page.url());
  await u.close();
};
