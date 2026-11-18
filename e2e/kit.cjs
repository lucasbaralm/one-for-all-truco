// Kit dos testes ponta a ponta (E2E): sobe a pilha INTEIRA do jeito que roda em produção, só que sem
// credenciais de verdade —
//   • um Supabase de mentira (:4010) que reconhece o token "user:<nome>" (login) e guarda o histórico;
//   • o room server de verdade (`wrangler dev`, :1999) apontado pro Supabase de mentira, com os
//     bots/animações acelerados (MONOPOLY_SPEED / BANCO_SPEED);
//   • o Next de verdade (`next dev`, :3000) falando com os dois;
//   • navegadores de verdade (Puppeteer + Chrome do sistema), um contexto anônimo por pessoa, cada um
//     já "logado" com uma sessão falsa no localStorage.
// Ninguém digita senha: a sessão falsa é um JSON com access_token "user:<nome>".
//
// Uso: `node e2e/run.cjs <suítes>` (ver e2e/README.md). Este arquivo só tem as peças.

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORTS = { next: 3000, party: 1999, supabase: 4010 };
const BASE = `http://localhost:${PORTS.next}`;
const SUPABASE_URL = `http://localhost:${PORTS.supabase}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── resultado dos testes ────────────────────────────────────────────────────
const results = { pass: 0, fail: 0, failures: [] };
let currentSuite = "";
function suite(name) {
  currentSuite = name;
  console.log(`\n━━ ${name}`);
}
function check(name, cond, detail) {
  if (cond) {
    results.pass++;
    console.log(`  ✓ ${name}`);
  } else {
    results.fail++;
    results.failures.push(`[${currentSuite}] ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
    console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
  return !!cond;
}
function summary() {
  console.log(`\n══ ${results.pass} ok, ${results.fail} falhas`);
  for (const f of results.failures) console.log(`  ✗ ${f}`);
  return results.fail === 0;
}

// ── Supabase de mentira ─────────────────────────────────────────────────────
function startMockSupabase() {
  const history = [];
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  };
  const server = http.createServer((req, res) => {
    const send = (code, body, extra = {}) => {
      res.writeHead(code, { "content-type": "application/json", ...cors, ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204, "");
    const url = new URL(req.url, SUPABASE_URL);
    if (url.pathname === "/auth/v1/health") return send(200, { ok: true });
    if (url.pathname === "/auth/v1/user") {
      const m = /^Bearer user:(.+)$/.exec(req.headers.authorization || "");
      if (!m) return send(401, { error: "invalid" });
      return send(200, { id: `id-${m[1]}`, user_metadata: { username: m[1] } });
    }
    if (url.pathname.startsWith("/rest/v1/match_history")) {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            history.push(JSON.parse(body));
          } catch {}
          send(201, "");
        });
        return;
      }
      return send(200, history.map((h, i) => ({ id: String(i), created_at: new Date().toISOString(), ...h })));
    }
    if (url.pathname.startsWith("/rest/v1/")) return send(200, []);
    return send(404, {});
  });
  return new Promise((resolve) => server.listen(PORTS.supabase, () => resolve({ server, history, close: () => server.close() })));
}

// ── processos ───────────────────────────────────────────────────────────────
const children = [];
function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...opts.env }, windowsHide: true });
  children.push(child);
  const log = [];
  const onData = (d) => {
    const s = d.toString();
    log.push(s);
    if (log.length > 400) log.shift();
    if (opts.echo) process.stdout.write(s);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  return { child, log, text: () => log.join("") };
}
async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await fn()) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error(`timeout esperando ${what}`);
}
function killTree(child) {
  try {
    if (process.platform === "win32") execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch {}
}
function killPorts() {
  if (process.platform !== "win32") return;
  for (const port of Object.values(PORTS)) {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      for (const line of out.split(/\r?\n/)) {
        const m = /LISTENING\s+(\d+)/.exec(line);
        if (m && m[1] !== "0") execSync(`taskkill /PID ${m[1]} /T /F`, { stdio: "ignore" });
      }
    } catch {}
  }
}

/**
 * Sobe tudo. `speed` divide as esperas dos bots/animações no servidor. `next: false` não sobe o Next
 * (suítes que só falam com o servidor de jogo).
 */
async function startStack({ speed = 8, next = true, persist } = {}) {
  killPorts();
  const mock = await startMockSupabase();
  const persistDir = persist || fs.mkdtempSync(path.join(os.tmpdir(), "fodinha-e2e-"));
  // o estado de salas do wrangler sobrevive entre execuções: começa SEMPRE do zero
  fs.rmSync(persistDir, { recursive: true, force: true });
  const party = run("npx", [
    "wrangler", "dev", "--port", String(PORTS.party), "--persist-to", `"${persistDir}"`,
    "--var", `SUPABASE_URL:${SUPABASE_URL}`, "--var", "SUPABASE_ANON_KEY:test",
    "--var", `MONOPOLY_SPEED:${speed}`, "--var", `BANCO_SPEED:${speed}`,
  ], { env: { WRANGLER_SEND_METRICS: "false", CI: "1" } });
  await waitFor(() => /Ready on/i.test(party.text()), 120000, "o wrangler (room servers)");

  let nextProc = null;
  if (next) {
    // o Next guarda em cache o que embutiu de NEXT_PUBLIC_*: sem apagar, ele usa o Supabase de verdade
    fs.rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
    nextProc = run("npx", ["next", "dev", "-p", String(PORTS.next)], {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test",
        NEXT_PUBLIC_PARTY_HOST: `localhost:${PORTS.party}`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });
    await waitFor(() => /Ready in|✓ Ready|Local:/i.test(nextProc.text()), 180000, "o next dev");
    // compila as rotas na primeira visita (senão a primeira navegação do teste estoura o tempo)
    for (const p of ["/gate", "/lobby", "/lobby/monopoly", "/lobby/banco", "/monopoly/WARM", "/banco/WARM"]) {
      try {
        await fetch(`${BASE}${p}`, { headers: { cookie: "fodinha_gate=1" }, redirect: "manual" });
      } catch {}
    }
  }
  return {
    mock,
    party,
    next: nextProc,
    async stop() {
      for (const c of children) killTree(c);
      mock.close();
      killPorts();
      fs.rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
      fs.rmSync(persistDir, { recursive: true, force: true });
    },
  };
}

// ── navegadores ─────────────────────────────────────────────────────────────
let puppeteer;
async function launchBrowser(extraArgs = []) {
  puppeteer = puppeteer || require("puppeteer");
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "fodinha-chrome-")),
    // Várias pessoas = várias abas: sem estas flags o Chrome "congela" as animações das abas que não estão na frente
    // (o framer-motion espera o requestAnimationFrame) e a tela de quem não está em foco parece travada.
    args: [
      "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
      ...extraArgs,
    ],
    defaultViewport: { width: 1536, height: 730 },
  });
}

const sessionJson = (name) =>
  JSON.stringify({
    access_token: `user:${name}`,
    token_type: "bearer",
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: "x",
    user: { id: `id-${name}`, aud: "authenticated", role: "authenticated", email: `${name}@test.dev`, user_metadata: { username: name } },
  });

/**
 * Uma pessoa logada (sessão falsa). Cada pessoa ganha o PRÓPRIO Chrome (janela dela, perfil limpo): numa aba que não
 * está na frente o Chrome pausa o requestAnimationFrame e as animações da tela (framer-motion) congelam — o que não
 * acontece com gente de verdade, cada uma na sua janela. `shared: true` usa um contexto anônimo do navegador dado.
 * `token` troca o access_token (ex.: pra testar login recusado).
 */
async function newUser(browser, name, { viewport, token, shared } = {}) {
  const own = shared ? null : await launchBrowser();
  const ctx = own ? null : await browser.createIncognitoBrowserContext();
  const page = own ? (await own.pages())[0] || (await own.newPage()) : await ctx.newPage();
  if (viewport) await page.setViewport(viewport);
  await page.setCookie({ name: "fodinha_gate", value: "1", url: BASE });
  const json = token ? sessionJson(name).replace(`user:${name}`, token) : sessionJson(name);
  await page.evaluateOnNewDocument((key, value) => {
    try {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem("fodinha_sound", "off");
    } catch {}
  }, "sb-localhost-auth-token", json);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return { name, ctx: ctx || own, page, errors, async close() { await (own ? own.close() : ctx.close()).catch(() => {}); } };
}

// ── servidor de jogo: olhar o estado de verdade ─────────────────────────────
/** Abre um websocket cru, lê o PRIMEIRO "state" (a visão dessa pessoa) e fecha. Não manda `join`, então não ocupa vaga nem acorda a sala. */
function peek(room, party, name, ms = 4000) {
  const WebSocket = require("ws");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORTS.party}/parties/${party}/${room}?token=user:${name}&playerId=${name}`);
    const t = setTimeout(() => {
      try { ws.terminate(); } catch {}
      reject(new Error("peek: sem resposta"));
    }, ms);
    ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === "state") {
        clearTimeout(t);
        ws.close();
        resolve(m.state);
      }
    });
    ws.on("close", (code) => {
      clearTimeout(t);
      reject(new Error(`peek: fechou ${code}`));
    });
    ws.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/** Um jogador "cru" (sem navegador): conecta, entra, guarda a última visão e deixa mandar mensagens. */
function rawPlayer(room, party, name) {
  const WebSocket = require("ws");
  const ws = new WebSocket(`ws://localhost:${PORTS.party}/parties/${party}/${room}?token=user:${name}&playerId=${name}`);
  const p = { name, ws, view: null, errors: [], messages: 0 };
  p.opened = new Promise((resolve, reject) => {
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join", name }));
      resolve();
    });
    ws.on("error", reject);
  });
  ws.on("message", (d) => {
    p.messages++;
    const m = JSON.parse(d.toString());
    if (m.type === "state") p.view = m.state;
    else if (m.type === "error") p.errors.push(m.error);
  });
  p.send = (m) => ws.send(JSON.stringify(m));
  p.close = () => ws.close();
  p.waitFor = (fn, ms = 15000, what = "condição") => waitFor(() => p.view && fn(p.view), ms, what);
  return p;
}

// ── páginas ─────────────────────────────────────────────────────────────────
const text = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
const exists = async (page, sel) => !!(await page.$(sel));
async function waitSel(page, sel, ms = 20000) {
  await page.waitForSelector(sel, { timeout: ms });
}
async function clickSel(page, sel) {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.$eval(sel, (e) => e.scrollIntoView({ block: "center" })).catch(() => {});
  await page.click(sel);
}
/** Clica via DOM (não depende de estar visível/na frente — útil pra botões sob animação). */
async function domClick(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, sel);
}

async function shot(page, file, opts = {}) {
  const dir = path.join(ROOT, "e2e", "out");
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, file);
  await page.screenshot({ path: full, fullPage: !!opts.fullPage });
  return full;
}

module.exports = {
  ROOT, BASE, PORTS, SUPABASE_URL, sleep, suite, check, summary, results,
  startStack, launchBrowser, newUser, peek, rawPlayer, waitFor, waitSel, clickSel, domClick, text, exists, shot, sessionJson,
};
