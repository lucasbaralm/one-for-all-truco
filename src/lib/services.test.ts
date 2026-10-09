import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPartykit, checkSupabase, partykitBaseUrl } from "./services";

// Os testes de "o serviço está no ar?" que alimentam o aviso do menu e o painel
// das salas. O fetch é de mentira: respondendo, falhando ou nunca respondendo.

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "localhost:1999");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("partykitBaseUrl", () => {
  it("usa http em endereços locais e da rede interna, https no resto", () => {
    for (const host of ["localhost:1999", "127.0.0.1:1999", "[::1]:1999", "192.168.15.2:1999", "10.0.0.5:1999", "172.16.0.9:1999", "172.31.255.1:1999"]) {
      expect(partykitBaseUrl(host), host).toBe(`http://${host}`);
    }
    for (const host of ["fodinha.user.partykit.dev", "172.32.0.1:1999", "172.15.0.1", "example.com:443"]) {
      expect(partykitBaseUrl(host), host).toBe(`https://${host}`);
    }
  });

  it("sem host configurado não há URL", () => {
    expect(partykitBaseUrl("")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "");
    expect(partykitBaseUrl()).toBeNull();
  });
});

describe("checkPartykit", () => {
  it("qualquer resposta HTTP — até um 404 — significa que o servidor está de pé (e pede em no-cors)", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkPartykit()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:1999/");
    expect(init.mode).toBe("no-cors");
  });

  it("erro de rede (nada escutando na porta) = fora do ar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await checkPartykit()).toBe(false);
  });

  it("sem NEXT_PUBLIC_PARTYKIT_HOST nem tenta a rede — está 'fora do ar' pra quem joga", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkPartykit()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("servidor que não responde é dado como fora do ar depois de 4s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
      )
    );
    const result = checkPartykit();
    await vi.advanceTimersByTimeAsync(3900);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false); // ainda esperando
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toBe(false);
  });
});

describe("checkSupabase", () => {
  it("responde ao health check do Auth, mandando a apikey", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkSupabase()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://proj.supabase.test/auth/v1/health");
    expect((init.headers as Record<string, string>).apikey).toBe("anon-key");
  });

  it("qualquer coisa abaixo de 500 conta como no ar (até 401: o serviço respondeu)", async () => {
    for (const status of [200, 204, 401, 404]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(status === 204 ? null : "", { status }))); // 204 não pode ter corpo
      expect(await checkSupabase(), `status ${status}`).toBe(true);
    }
  });

  it("5xx (projeto pausado, instabilidade) e erro de rede = fora do ar", async () => {
    for (const status of [500, 502, 503, 540]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status })));
      expect(await checkSupabase(), `status ${status}`).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await checkSupabase()).toBe(false);
  });

  it("sem NEXT_PUBLIC_SUPABASE_URL não tenta a rede", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkSupabase()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
