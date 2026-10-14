// O que os room servers (GameRoom, a Fodinha) precisam de quem os hospeda — só isso.
// Eles não importam o framework de WebSocket: `worker/adapter.ts` liga estas interfaces
// ao PartyServer (Durable Objects da Cloudflare), e `party/test-utils.ts` liga a uma
// sala de mentira. Foi assim que a troca PartyKit → PartyServer não mexeu em nenhuma
// regra de jogo nem nos testes de integração dos servidores.

/** Uma conexão WebSocket. `state` guarda o que o servidor decidir (aqui: o usuário verificado). */
export interface Conn<S = unknown> {
  readonly id: string;
  readonly state: S | null;
  setState(state: S): unknown;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

/** Contexto da conexão que acabou de abrir (só a URL do upgrade interessa: token e playerId vão nela). */
export interface ConnContext {
  request: { url: string };
}

export interface RoomStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

/** A "sala" vista pelo servidor do jogo. */
export interface RoomPort {
  /** Nome da sala (o código que está na URL). */
  readonly id: string;
  /** Variáveis do ambiente (SUPABASE_URL, SUPABASE_ANON_KEY, *_SPEED). */
  readonly env: Record<string, unknown>;
  readonly storage: RoomStorage;
  /** Manda pra todas as conexões, menos as de `without` (ids de conexão). */
  broadcast(message: string, without?: string[]): void;
  getConnections<S = unknown>(): Iterable<Conn<S>>;
}

/** O ciclo de vida que o framework chama. */
export interface RoomHandler {
  onStart?(): void | Promise<void>;
  onConnect?(connection: Conn, ctx: ConnContext): void | Promise<void>;
  onMessage?(message: string | ArrayBuffer | ArrayBufferView, sender: Conn): void | Promise<void>;
  onClose?(connection: Conn): void;
  onError?(connection: Conn): void;
}

/** Como se constrói o servidor de uma sala. */
export type RoomFactory = new (room: RoomPort) => RoomHandler;
