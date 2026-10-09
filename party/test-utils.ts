import { vi } from "vitest";
import type * as Party from "partykit/server";

// Utilidades pros testes dos room servers: uma sala "de mentira" (só o que o
// GameRoom usa) e um Supabase "de mentira" (token "user:<nome>" vira o usuário
// <nome>). Não é um arquivo de teste — é importado por party/*.test.ts.

export class FakeConn {
  state: { username?: string } | null = null;
  sent: { type?: string; [k: string]: unknown }[] = [];
  closed: [number, string][] = [];
  constructor(readonly id: string) {}
  setState(s: { username?: string }) {
    this.state = s;
  }
  send(msg: string) {
    this.sent.push(JSON.parse(msg));
  }
  close(code: number, reason: string) {
    this.closed.push([code, reason]);
  }
  /** A última mensagem de um tipo (ex.: "state") que o servidor mandou pra essa conexão. */
  last<T = unknown>(type: string): T | undefined {
    return this.sent.filter((m) => m.type === type).pop() as T | undefined;
  }
}

export function makeHarness<R extends Party.Server>(
  RoomClass: new (room: Party.Room) => R,
  { env = {}, storage: initialStorage }: { env?: Record<string, string>; storage?: Record<string, unknown> } = {}
) {
  const conns = new Map<string, FakeConn>();
  const store = new Map<string, unknown>(Object.entries(initialStorage ?? {}));
  const room = {
    id: "ABCD",
    env: { SUPABASE_URL: "http://supabase.test", SUPABASE_ANON_KEY: "anon", ...env },
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: unknown) => void store.set(k, v),
    },
    broadcast: (msg: string, without: string[] = []) => {
      for (const c of conns.values()) if (!without.includes(c.id)) c.send(msg);
    },
    getConnections: () => conns.values(),
  };
  const server = new RoomClass(room as unknown as Party.Room);
  const connect = async (name: string, token = `user:${name}`, claimed = name) => {
    const conn = new FakeConn(`c-${name}-${conns.size}`);
    conns.set(conn.id, conn);
    const ctx = { request: { url: `http://x/parties/test/ABCD?token=${token}&playerId=${claimed}` } };
    await server.onConnect!(conn as unknown as Party.Connection, ctx as unknown as Party.ConnectionContext);
    return conn;
  };
  const say = (conn: FakeConn, msg: object) => server.onMessage!(JSON.stringify(msg), conn as unknown as Party.Connection);
  const drop = (conn: FakeConn) => {
    conns.delete(conn.id);
    server.onClose!(conn as unknown as Party.Connection);
  };
  return { server, conns, store, connect, say, drop };
}

export interface SupabaseStubOptions {
  /** Linhas da tabela rooms (Fodinha guarda o estado da partida lá): id da sala → state. */
  roomRows?: Record<string, unknown>;
  /** Cada upsert em rooms cai aqui. */
  roomWrites?: unknown[];
}

/**
 * Troca o fetch global por um Supabase de mentira: token "user:<nome>" vira o
 * usuário <nome>; gravações em match_history caem em `history`; a tabela rooms
 * (só a Fodinha usa) lê de `roomRows` e grava em `roomWrites`.
 */
export function stubSupabase(history: unknown[], opts: SupabaseStubOptions = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.endsWith("/auth/v1/user")) {
        const auth = (init?.headers as Record<string, string>).Authorization;
        const m = /^Bearer user:(.+)$/.exec(auth);
        if (!m) return new Response("{}", { status: 401 });
        return json({ user_metadata: { username: m[1] } });
      }
      if (url.includes("/rest/v1/match_history")) {
        history.push(JSON.parse(init!.body as string));
        return new Response("", { status: 201 });
      }
      if (url.includes("/rest/v1/rooms")) {
        if ((init?.method ?? "GET") === "GET") {
          const id = /id=eq.([^&]+)/.exec(url)?.[1] ?? "";
          const state = opts.roomRows?.[id];
          return json(state ? [{ state }] : []);
        }
        opts.roomWrites?.push(JSON.parse(init!.body as string));
        return new Response("", { status: 201 });
      }
      return json({}, 404);
    })
  );
}
