// Mantém o projeto do Supabase acordado. O plano gratuito PAUSA o projeto depois de uma semana sem atividade (e nada
// no site acessa o Supabase enquanto ninguém está jogando), então o Worker faz uma leitura mínima uma vez por dia —
// Cron Trigger em wrangler.jsonc, chamado pelo `scheduled` de worker/index.ts.
//
// A leitura é UMA linha da tabela `rooms` com a chave anônima: a mesma leitura que o servidor da Fodinha já faz (party/server.ts),
// então a permissão existe. Se o Supabase responder com erro (projeto já pausado, chave trocada...), lança — o Cloudflare
// mostra a execução como falha nos logs do Worker, que é o aviso.

export interface KeepAliveEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const TIMEOUT_MS = 15_000;

export async function keepSupabaseAwake(env: KeepAliveEnv, doFetch: typeof fetch = fetch): Promise<void> {
  const res = await doFetch(`${env.SUPABASE_URL}/rest/v1/rooms?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await res.text(); // consome o corpo: a requisição só termina de verdade depois disso
  if (!res.ok) throw new Error(`Supabase keep-alive: HTTP ${res.status}`);
  console.log(`Supabase keep-alive ok (HTTP ${res.status})`);
}
