// Verificações de "o serviço está no ar?" feitas pelo NAVEGADOR — é o que
// importa de verdade (por exemplo, abrir o site pela rede local com o host do
// room server apontando pra "localhost" não funciona no celular, e só o navegador
// de quem joga percebe isso).

export type ServiceHealth = "checking" | "ok" | "down";

const TIMEOUT_MS = 4000;

const LOCAL_HOST = /^(localhost|127\.|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Host dos room servers (o Worker do PartyServer): NEXT_PUBLIC_PARTY_HOST. O nome antigo, do tempo do
 * PartyKit, ainda vale enquanto a variável não é renomeada no ambiente (ex.: na Vercel).
 * Cada leitura é literal pra o Next embutir o valor no navegador.
 */
export function partyHost(): string | undefined {
  return process.env.NEXT_PUBLIC_PARTY_HOST || process.env.NEXT_PUBLIC_PARTYKIT_HOST || undefined;
}

export function partyBaseUrl(host = partyHost()): string | null {
  if (!host) return null;
  return `${LOCAL_HOST.test(host) ? "http" : "https"}://${host}`;
}

async function responds(url: string, init: RequestInit, isUp: (res: Response) => boolean): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return isUp(res);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * O room server responde (qualquer resposta HTTP, mesmo 404) ou não. Usa
 * `no-cors` porque só queremos saber se o servidor está de pé, não ler nada
 * — e assim não depende de CORS no servidor.
 */
export async function checkParty(): Promise<boolean> {
  const base = partyBaseUrl();
  if (!base) return false;
  return responds(`${base}/`, { mode: "no-cors" }, () => true);
}

/** O Supabase responde ao health check do Auth (qualquer coisa abaixo de 500 = no ar). */
export async function checkSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) return false;
  return responds(`${url}/auth/v1/health`, { headers: key ? { apikey: key } : {} }, (res) => res.status < 500);
}
