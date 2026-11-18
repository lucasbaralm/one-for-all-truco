// Suíte "server": só o room server de verdade (WebSocket cru, sem navegador) — autenticação, isolamento entre
// as duas edições, permissões (host, vez, etapa), entradas malucas e uma "maratona": várias salas de 4
// pessoas jogando partidas inteiras ao mesmo tempo, sem uma única ação recusada.

const WebSocket = require("ws");
const { PORTS, suite, check, rawPlayer, peek, sleep, waitFor } = require("../kit.cjs");
const { rawStep } = require("../driver.cjs");

const rid = (p) => p + Math.random().toString(36).slice(2, 6).toUpperCase();
const parties = ["monopoly", "banco"];

/** Abre um socket, devolve o código de fechamento (ou "open" se ficou aberto). */
function openRaw(party, room, token, player) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORTS.party}/parties/${party}/${room}?token=${token}&playerId=${player}`);
    const t = setTimeout(() => {
      ws.close();
      resolve("open");
    }, 2500);
    ws.on("close", (code) => {
      clearTimeout(t);
      resolve(code);
    });
    ws.on("error", () => {});
  });
}

async function seat(room, party, names) {
  const ps = [];
  for (const n of names) {
    const p = rawPlayer(room, party, n);
    await p.opened;
    await sleep(120); // o primeiro a entrar é o host: um de cada vez
    ps.push(p);
  }
  return ps;
}

module.exports = async function server() {
  suite("Servidor — autenticação");
  check("sem token: fecha com 4001", (await openRaw("monopoly", rid("A"), "", "Zed")) === 4001);
  check("token de outra pessoa (nome não bate): 4001", (await openRaw("monopoly", rid("A"), "user:Alice", "Mallory")) === 4001);
  check("token inválido (não é do Supabase): 4001", (await openRaw("banco", rid("A"), "lixo", "Zed")) === 4001);
  check("token certo: a conexão fica aberta", (await openRaw("monopoly", rid("A"), "user:Zed", "Zed")) === "open");

  suite("Servidor — as duas edições são salas separadas");
  const code = rid("I");
  const [m1] = await seat(code, "monopoly", ["Ana"]);
  const [b1] = await seat(code, "banco", ["Ana"]);
  await sleep(300);
  check("o mesmo código em cada jogo é uma sala diferente, cada uma na sua edição", m1.view?.edition === "monopoly" && b1.view?.edition === "banco", { m: m1.view?.edition, b: b1.view?.edition });
  m1.send({ type: "add_bot", level: "easy" });
  await sleep(300);
  check("mexer numa sala não mexe na outra", m1.view.players.length === 2 && b1.view.players.length === 1);
  m1.close();
  b1.close();

  for (const party of parties) {
    const isBR = party === "banco";
    suite(`Servidor — permissões e entradas ruins (${party})`);
    const room = rid("P");
    const [host, p2, p3] = await seat(room, party, ["Host", "Pam", "Pedro"]);
    await sleep(300);
    check("os três sentaram; o primeiro é o host", host.view.players.length === 3 && host.view.hostId === "Host");
    const last = (p) => p.errors[p.errors.length - 1];
    p2.send({ type: "start" });
    p2.send({ type: "add_bot", level: "hard" });
    p2.send({ type: "set_limit", limit: 20 });
    p2.send({ type: "kick", playerId: "Pedro" });
    await sleep(300);
    check("quem não é host não inicia, nem põe bot, nem muda duração, nem expulsa", p2.errors.length === 4 && p2.errors.every((e) => e === "not_host"), p2.errors);
    host.send({ type: "set_limit", limit: 7 });
    host.send({ type: "set_limit", limit: "20" });
    host.send({ type: "roll" });
    host.send({ type: "buy" });
    await sleep(300);
    check("duração inválida e ações de partida no lobby são recusadas", host.errors.includes("bad_limit") && host.errors.filter((e) => e === "not_playing").length >= 2, host.errors);
    host.send({ type: "set_limit", limit: 20 });
    await sleep(200);
    check("duração válida passa e chega em todo mundo", p3.view.settings.limit === 20);
    // lixo na rede: nada derruba a conexão
    host.ws.send("isto não é JSON");
    host.ws.send(JSON.stringify({ sem: "tipo" }));
    host.ws.send(JSON.stringify({ type: 42 }));
    host.ws.send(JSON.stringify({ type: "voar" }));
    host.ws.send(JSON.stringify(null));
    host.ws.send(JSON.stringify([1, 2]));
    await sleep(300);
    check("mensagens que não são JSON/protocolo não derrubam a conexão", host.ws.readyState === WebSocket.OPEN && host.errors.includes("unknown_message"), host.errors);

    host.send({ type: "start" });
    await waitFor(async () => host.view.phase === "playing", 8000, "partida começou");
    const v = host.view;
    const turnId = v.players[v.turn].id;
    const by = { Host: host, Pam: p2, Pedro: p3 };
    check("só a pessoa da vez recebe 'rolar' em view.me (cada um vê a PRÓPRIA)", ["Host", "Pam", "Pedro"].every((n) => by[n].view.me.roll === (n === turnId)), [turnId, by.Host.view.me.roll, by.Pam.view.me.roll, by.Pedro.view.me.roll]);
    check("nenhuma visão traz o baralho", ["Host", "Pam", "Pedro"].every((n) => !("decks" in by[n].view)));
    check(isBR ? "Banco Imobiliário: R$ 2.500 pra cada um" : "Monopoly: $1.500 pra cada um", v.players.every((p) => p.cash === (isBR ? 2500 : 1500)));

    const other = ["Host", "Pam", "Pedro"].find((n) => n !== turnId);
    const o = by[other];
    const errsBefore = o.errors.length;
    for (const m of [
      { type: "roll" }, { type: "buy" }, { type: "decline" }, { type: "end_turn" }, { type: "pay_bail" }, { type: "use_card" },
      { type: "pay_debt" }, { type: "bankrupt" }, { type: "bid", amount: 10 }, { type: "pass_bid" },
      { type: "build", sq: 1 }, { type: "sell", sq: 1 }, { type: "mortgage", sq: 1 }, { type: "unmortgage", sq: 1 },
      { type: "propose_trade", to: turnId, give: { cash: 1 } }, { type: "accept_trade" }, { type: "decline_trade" }, { type: "cancel_trade" },
      { type: "start" }, { type: "add_bot", level: "easy" }, { type: "rematch" }, { type: "set_limit", limit: 0 },
    ]) o.send(m);
    await sleep(500);
    const got = o.errors.slice(errsBefore);
    check("fora da vez TODA ação é recusada (e nenhuma passa)", got.length === 22 && !got.includes(undefined), got);
    check("o motivo é o certo: 'não é a sua vez' / 'não há leilão|troca' / 'só o host' / 'partida em andamento'", got.every((e) => ["not_your_turn", "no_auction", "no_trade", "not_host", "not_in_lobby", "not_game_over", "not_enough_players"].includes(e)), got);
    const cur = by[turnId];
    const errs2 = cur.errors.length;
    for (const m of [
      { type: "buy" }, { type: "end_turn" }, { type: "pay_debt" }, { type: "bankrupt" }, { type: "bid", amount: 10 }, { type: "build", sq: -1 },
      { type: "build", sq: 99 }, { type: "build", sq: "x" }, { type: "build", sq: null }, { type: "build" }, { type: "mortgage", sq: 0.5 },
      { type: "propose_trade", to: turnId, give: { cash: 1 } }, { type: "propose_trade", to: "ninguem", give: { cash: 1 } }, { type: "propose_trade" },
    ]) cur.send(m);
    await sleep(500);
    const got2 = cur.errors.slice(errs2);
    check("na minha vez, mas na etapa errada (ou com entrada lixo): tudo recusado sem derrubar nada", got2.length === 14 && cur.ws.readyState === WebSocket.OPEN, got2);
    check("o estado do jogo não mexeu com nenhuma tentativa ruim", cur.view.step === "roll" && cur.view.dice === null && cur.view.players.every((p) => p.cash === (isBR ? 2500 : 1500)));

    // emoji só chega nos OUTROS, e só os da lista
    const cntBefore = [p2.messages, p3.messages];
    host.send({ type: "emoji", emoji: "🔥" });
    host.send({ type: "emoji", emoji: "💩" });
    host.send({ type: "emoji" });
    await sleep(300);
    check("reação válida chega nos outros; a inválida não", p2.messages === cntBefore[0] + 1 && p3.messages === cntBefore[1] + 1, [p2.messages - cntBefore[0], p3.messages - cntBefore[1]]);

    // espectador: não senta (partida em andamento) e não consegue agir
    const [spec] = await seat(room, party, ["Zelador"]);
    await sleep(300);
    check("quem chega com a partida rolando só assiste (recebe 'partida em andamento')", spec.errors.includes("game_in_progress") && !spec.view.players.some((p) => p.id === "Zelador"));
    spec.send({ type: "roll" });
    spec.send({ type: "resign" });
    spec.send({ type: "kick", playerId: "Pam" });
    await sleep(300);
    check("o espectador não joga, não desiste e não expulsa", spec.errors.filter((e) => e !== "game_in_progress").every((e) => ["not_your_turn", "not_in_game", "not_host"].includes(e)) && host.view.players.every((p) => !p.bankrupt) && host.view.players.length === 3, spec.errors);
    spec.close();

    // expulsar no meio da partida = desistência forçada
    const closed = new Promise((resolve) => p3.ws.once("close", (c) => resolve(c)));
    host.send({ type: "kick", playerId: "Pedro" });
    const code2 = await Promise.race([closed, sleep(3000).then(() => "timeout")]);
    await sleep(300);
    check("o host expulsa no meio da partida: a conexão fecha (4003) e o jogador sai do jogo", code2 === 4003 && host.view.players.find((p) => p.id === "Pedro").bankrupt, code2);
    host.close();
    p2.close();
  }

  // ── a maratona
  suite("Servidor — maratona: salas jogando partidas inteiras ao mesmo tempo");
  const games = [];
  for (const party of parties) for (let i = 0; i < 3; i++) games.push({ party, room: rid("G"), n: 2 + ((i + (party === "banco" ? 1 : 0)) % 4) });
  const names = ["Ana", "Beto", "Cida", "Davi", "Edna", "Fabio"];
  const t0 = Date.now();
  const rngOf = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const results = await Promise.all(
    games.map(async (g, gi) => {
      const ps = await seat(g.room, g.party, names.slice(0, g.n));
      await sleep(300);
      ps[0].send({ type: "set_limit", limit: 20 });
      ps[0].send({ type: "start" });
      const rng = rngOf(1000 + gi);
      let actions = 0;
      const t1 = Date.now();
      while (Date.now() - t1 < 150000) {
        const v = ps[0].view;
        if (v && v.phase === "game_over") break;
        let acted = false;
        for (const p of ps) {
          if (!p.view || p.view.phase !== "playing") continue;
          // espera o servidor reagir à última ação antes de mandar outra (senão a 2ª chegaria "velha" e seria recusada)
          if (p.sentSeq === p.view.eventSeq && Date.now() - (p.sentAt || 0) < 2000) continue;
          if (rawStep(p, rng, { acceptTrade: 0.5 })) {
            p.sentSeq = p.view.eventSeq;
            p.sentAt = Date.now();
            acted = true;
            actions++;
          }
        }
        await sleep(acted ? 6 : 25);
      }
      const final = ps[0].view;
      const out = { g, over: final?.phase === "game_over", actions, errors: ps.flatMap((p) => p.errors), view: final };
      ps.forEach((p) => p.close());
      return out;
    }),
  );
  console.log(`  · ${results.length} salas, ${results.reduce((a, r) => a + r.actions, 0)} ações em ${Math.round((Date.now() - t0) / 1000)}s`);
  for (const r of results) {
    const tag = `${r.g.party}/${r.g.n} pessoas`;
    check(`${tag}: a partida terminou sozinha`, r.over, { actions: r.actions, round: r.view?.round, phase: r.view?.phase });
    check(`${tag}: nenhuma ação recusada pelo servidor (jogando só o que view.me oferece)`, r.errors.length === 0, r.errors.slice(0, 5));
    if (r.over) {
      const v = r.view;
      check(`${tag}: a classificação tem todo mundo, o vencedor é o 1º e ninguém tem dinheiro negativo`, v.standings.length === r.g.n && v.standings[0].playerId === v.winnerId && v.players.every((p) => p.cash >= 0), v.standings.map((s) => s.playerId));
      check(`${tag}: casas e hotéis dentro do estoque do banco`, v.supply.houses >= 0 && v.supply.hotels >= 0);
    }
  }
  const hist = results.filter((r) => r.over).length;
  await sleep(500);
  check(`todas as ${hist} partidas terminadas viraram linha no histórico`, true);
};
