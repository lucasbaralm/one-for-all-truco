import { describe, expect, it, vi } from "vitest";
import { CLOUDFLARE_TTL_S, STUN_SERVERS, buildIceServers } from "./iceServers";

const CF = { CLOUDFLARE_TURN_KEY_ID: "key123", CLOUDFLARE_TURN_API_TOKEN: "secret-token" };
const cloudflareServers = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
  { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:5349?transport=tcp"], username: "u", credential: "c" },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("sem TURN configurado", () => {
  it("usa só STUN e avisa que não tem retransmissão", async () => {
    const fetchFn = vi.fn();
    expect(await buildIceServers({}, fetchFn as unknown as typeof fetch)).toEqual({ iceServers: STUN_SERVERS, relay: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("metade da configuração não conta", async () => {
    const fetchFn = vi.fn();
    expect((await buildIceServers({ CLOUDFLARE_TURN_KEY_ID: "k" }, fetchFn as unknown as typeof fetch)).relay).toBe(false);
    expect((await buildIceServers({ TURN_URLS: "turn:x:3478", TURN_USERNAME: "u" }, fetchFn as unknown as typeof fetch)).relay).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Cloudflare Realtime TURN", () => {
  it("pede credencial temporária ao Cloudflare, com a chave só no servidor", async () => {
    const fetchFn = vi.fn(async () => json({ iceServers: cloudflareServers }));
    const r = await buildIceServers(CF, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body as string)).toEqual({ ttl: CLOUDFLARE_TTL_S });
    expect(r.relay).toBe(true);
    expect(r.iceServers).toEqual([...STUN_SERVERS, ...cloudflareServers]);
  });

  it("aceita a resposta antiga, com um objeto só", async () => {
    const fetchFn = vi.fn(async () => json({ iceServers: cloudflareServers[1] }));
    const r = await buildIceServers(CF, fetchFn as unknown as typeof fetch);
    expect(r.relay).toBe(true);
    expect(r.iceServers).toEqual([...STUN_SERVERS, cloudflareServers[1]]);
  });

  it("escapa o id da chave na URL", async () => {
    const fetchFn = vi.fn(async () => json({ iceServers: cloudflareServers }));
    await buildIceServers({ ...CF, CLOUDFLARE_TURN_KEY_ID: "a/b?c" }, fetchFn as unknown as typeof fetch);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toContain("/keys/a%2Fb%3Fc/");
  });

  it("se o Cloudflare falha, cai pro STUN (ou pro TURN do ambiente)", async () => {
    for (const fetchFn of [
      vi.fn(async () => json({ error: "no" }, 403)),
      vi.fn(async () => { throw new Error("rede"); }),
      vi.fn(async () => json({ iceServers: [] })),
      vi.fn(async () => json({ iceServers: [{ urls: ["stun:so-stun:3478"] }] })), // sem nenhum turn: não é retransmissão
    ]) {
      expect(await buildIceServers(CF, fetchFn as unknown as typeof fetch)).toEqual({ iceServers: STUN_SERVERS, relay: false });
    }
    const fetchFn = vi.fn(async () => json({}, 500));
    const r = await buildIceServers({ ...CF, TURN_URLS: "turn:meu.servidor:3478", TURN_USERNAME: "u", TURN_CREDENTIAL: "c" }, fetchFn as unknown as typeof fetch);
    expect(r.relay).toBe(true);
    expect(r.iceServers.at(-1)).toEqual({ urls: ["turn:meu.servidor:3478"], username: "u", credential: "c" });
  });
});

describe("TURN próprio (coturn, Metered...)", () => {
  it("monta o servidor com a lista de URLs", async () => {
    const r = await buildIceServers({ TURN_URLS: " turn:a.com:3478 , turns:a.com:5349 ,", TURN_USERNAME: "user", TURN_CREDENTIAL: "pass" });
    expect(r).toEqual({
      iceServers: [...STUN_SERVERS, { urls: ["turn:a.com:3478", "turns:a.com:5349"], username: "user", credential: "pass" }],
      relay: true,
    });
  });
});
