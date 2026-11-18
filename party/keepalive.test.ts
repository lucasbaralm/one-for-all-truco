import { afterEach, describe, expect, it, vi } from "vitest";
import { keepSupabaseAwake } from "./keepalive";

const env = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon-key" };
const reply = (status: number, body = "[]") => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

afterEach(() => vi.restoreAllMocks());

describe("keep-alive do Supabase", () => {
  it("lê uma linha da tabela rooms com a chave anônima", async () => {
    const doFetch = reply(200);
    await keepSupabaseAwake(env, doFetch);
    expect(doFetch).toHaveBeenCalledTimes(1);
    const [url, init] = (doFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://abc.supabase.co/rest/v1/rooms?select=id&limit=1");
    expect(init.headers).toEqual({ apikey: "anon-key", Authorization: "Bearer anon-key" });
    expect(init.method ?? "GET").toBe("GET");
  });

  it("não escreve nada e não manda corpo (só lê)", async () => {
    const doFetch = reply(200);
    await keepSupabaseAwake(env, doFetch);
    const init = (doFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it("tabela vazia (200 com lista vazia) também conta como sucesso", async () => {
    await expect(keepSupabaseAwake(env, reply(200, "[]"))).resolves.toBeUndefined();
  });

  it("resposta de erro do Supabase (projeto pausado, chave errada) lança com o status", async () => {
    await expect(keepSupabaseAwake(env, reply(540, "paused"))).rejects.toThrow("HTTP 540");
    await expect(keepSupabaseAwake(env, reply(401, "{}"))).rejects.toThrow("HTTP 401");
  });

  it("falha de rede lança (o Cloudflare mostra a execução como falha)", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(keepSupabaseAwake(env, down)).rejects.toThrow("fetch failed");
  });

  it("a requisição tem prazo (não fica pendurada)", async () => {
    const doFetch = reply(200);
    await keepSupabaseAwake(env, doFetch);
    const init = (doFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
