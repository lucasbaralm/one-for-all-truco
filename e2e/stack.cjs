#!/usr/bin/env node
// Sobe só a pilha de teste (Supabase de mentira + room servers + Next) e fica de pé até Ctrl+C — pra abrir o jogo
// à mão no navegador com uma sessão falsa (`localStorage["sb-localhost-auth-token"]`, ver kit.sessionJson) ou
// pra investigar uma falha dos testes olhando o log do Next/wrangler.
//   node e2e/stack.cjs            # velocidade 1 (tempo real)
//   SPEED=8 node e2e/stack.cjs

const kit = require("./kit.cjs");

(async () => {
  const stack = await kit.startStack({ speed: Number(process.env.SPEED) || 1, next: true });
  console.log(`PRONTO: ${kit.BASE}  (room servers em :${kit.PORTS.party}, Supabase de mentira em :${kit.PORTS.supabase})`);
  const stop = async () => {
    await stack.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {
    const t = stack.next.text();
    if (/error|Error/.test(t.slice(-600))) console.log("[next]", t.slice(-600));
  }, 5000);
})();
