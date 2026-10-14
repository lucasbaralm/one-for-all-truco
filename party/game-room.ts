import type { Conn, ConnContext, RoomHandler, RoomPort } from "./room-types";
import {
  AUTH_UNAVAILABLE_CLOSE_CODE,
  KICKED_CLOSE_CODE,
  UNAUTHORIZED_CLOSE_CODE,
} from "../src/lib/party-codes";

// Base dos room servers de jogos com salas (Ludo, Dobble...). Cada jogo traz só
// o que é dele — o controlador (regras), como serializar o estado pros
// clientes e a linha do histórico; tudo que é "sala" mora aqui:
//  • autenticação pelo token do Supabase (login recusado × Supabase fora do ar);
//  • a identidade verificada da conexão é a única que conta (nunca o que o
//    cliente diz ser);
//  • prazo de graça no lobby (refresh não custa o assento), jogador caído na
//    partida só vira "desconectado", sala vazia pausa tudo;
//  • estado salvo no storage do próprio room (sem tabela nova no Supabase) e
//    resultado gravado em match_history.

export type GameRoomEnv = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };

/** O que a base precisa de um controlador de jogo. */
export interface RoomController<S> {
  state: S;
  dispatch(actorId: string, message: never): { ok: true; state: S } | { ok: false; error: string };
  setConnected(id: string, connected: boolean): void;
  leave(id: string): void;
  setPaused(paused: boolean): void;
}

export interface ControllerHooks<S> {
  onChange: (state: S) => void;
  onKick: (playerId: string) => void;
}

const STATE_KEY = "state";
// Quem some do lobby (fechou a aba, refresh) tem esse tempo pra voltar antes
// de perder o assento.
const LOBBY_GRACE_MS = 15_000;
const MAX_AVATAR_URL_LENGTH = 600;
// Quanto esperar o Supabase responder na checagem do login. Tem que ser menor
// que o tempo que o navegador espera a conexão abrir (4s no partysocket) —
// senão ele desiste antes de receber o motivo do fechamento.
const AUTH_TIMEOUT_MS = 3000;

type AuthResult = { username: string } | { error: "invalid" | "unavailable" };
type ConnState = { username?: string };

export abstract class GameRoom<S> implements RoomHandler {
  protected controller: RoomController<S>;
  private wasOver = false;
  // Verificação de identidade em andamento por conexão: mensagens que chegam
  // antes de a checagem no Supabase terminar esperam por ela, em vez de serem
  // descartadas como "sem identidade".
  private pendingAuth = new Map<string, Promise<string | null>>();
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(readonly room: RoomPort) {
    this.controller = this.createController({
      onChange: (state) => this.handleChange(state),
      onKick: (playerId) => this.closeConnectionsOf(playerId),
    });
    // Sem ninguém conectado nada acontece sozinho (bots não jogam no vazio).
    this.controller.setPaused(true);
  }

  // ── o que cada jogo define ───────────────────────────────────────────────
  protected abstract createController(hooks: ControllerHooks<S>): RoomController<S>;
  /** Reações aceitas e repassadas pra sala. */
  protected abstract emojis(): readonly string[];
  /**
   * JSON da mensagem "state" que vai pros clientes. `viewer` é a identidade verificada de quem vai
   * receber (null = mensagem pra todos); só importa pros jogos com informação secreta por jogador
   * (a mão no Uno) — ver `perViewer()`. Os outros ignoram o segundo parâmetro.
   */
  protected abstract stateMessage(state: S, viewer: string | null): string;
  /**
   * true = cada jogador recebe uma mensagem DIFERENTE (a própria mão, por exemplo) em vez de todos
   * receberem a mesma. Os outros jogos (tudo que está na mesa é público) deixam false.
   */
  protected perViewer(): boolean {
    return false;
  }
  protected abstract isLobby(state: S): boolean;
  protected abstract isGameOver(state: S): boolean;
  /** O jogador da sala com esse id (null = não é jogador). */
  protected abstract findPlayer(state: S, id: string): { connected: boolean } | undefined;
  /** Depois de restaurar do storage: nenhum humano está conectado ainda. */
  protected abstract markHumansDisconnected(state: S): S;
  /** Prefixo do room_id no histórico, que separa os jogos na mesma tabela (ex.: "LUDO:"). */
  protected abstract historyPrefix(): string;
  protected abstract historyRow(state: S): { winner_name: string; players_summary: unknown } | null;

  protected get env(): GameRoomEnv {
    return this.room.env as unknown as GameRoomEnv;
  }

  async onStart() {
    const saved = await this.room.storage.get<S>(STATE_KEY);
    if (!saved) return;
    // Conexões não sobrevivem a um reinício: todo humano começa desconectado
    // e volta a "conectado" quando reenviar o join.
    this.controller.state = this.markHumansDisconnected(saved);
    this.wasOver = this.isGameOver(saved);
  }

  // ── Ciclo de vida das conexões ───────────────────────────────────────────

  async onConnect(connection: Conn, ctx: ConnContext) {
    const url = new URL(ctx.request.url);
    const auth = this.verify(url.searchParams.get("token"), url.searchParams.get("playerId"));
    this.pendingAuth.set(
      connection.id,
      auth.then((r) => ("username" in r ? r.username : null))
    );
    const result = await auth;
    if ("error" in result) {
      if (result.error === "unavailable") connection.close(AUTH_UNAVAILABLE_CLOSE_CODE, "auth_unavailable");
      else connection.close(UNAUTHORIZED_CLOSE_CODE, "unauthorized");
      return;
    }
    connection.setState({ username: result.username } satisfies ConnState);
    connection.send(this.stateMessage(this.controller.state, result.username));
  }

  // Verifica o token do Supabase contra a própria API de auth (evita guardar o
  // JWT secret aqui) e confirma que o playerId reivindicado é o dono do token.
  // "invalid" = o Supabase respondeu e o token não vale; "unavailable" = não
  // deu pra falar com o Supabase (o cliente mostra um aviso diferente).
  private async verify(token: string | null, claimedName: string | null): Promise<AuthResult> {
    if (!token || !claimedName) return { error: "invalid" };
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = this.env;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        signal: controller.signal,
      });
      if (res.status >= 500) return { error: "unavailable" };
      if (!res.ok) return { error: "invalid" };
      const user = (await res.json()) as { user_metadata?: { username?: string } };
      const verified = user.user_metadata?.username;
      return verified && verified === claimedName ? { username: verified } : { error: "invalid" };
    } catch {
      return { error: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }

  private async identity(connection: Conn): Promise<string | null> {
    const known = (connection.state as ConnState | null)?.username;
    if (known) return known;
    return (await this.pendingAuth.get(connection.id)) ?? null;
  }

  private hasConnection(username: string, except?: string): boolean {
    for (const c of this.room.getConnections<ConnState>()) {
      if (c.id !== except && c.state?.username === username) return true;
    }
    return false;
  }

  private anyConnection(except?: string): boolean {
    for (const c of this.room.getConnections<ConnState>()) {
      if (c.id !== except && c.state?.username) return true;
    }
    return false;
  }

  private closeConnectionsOf(username: string) {
    for (const c of this.room.getConnections<ConnState>()) {
      if (c.state?.username === username) c.close(KICKED_CLOSE_CODE, "kicked");
    }
  }

  private dropped(connection: Conn) {
    this.pendingAuth.delete(connection.id);
    const username = (connection.state as ConnState | null)?.username;
    if (!username) return;
    // Outra aba/dispositivo do mesmo jogador ainda conectado: nada muda.
    if (this.hasConnection(username, connection.id)) return;

    const state = this.controller.state;
    if (this.isLobby(state)) {
      if (this.findPlayer(state, username)) {
        this.controller.setConnected(username, false);
        this.graceTimers.set(
          username,
          setTimeout(() => {
            this.graceTimers.delete(username);
            const cur = this.controller.state;
            const p = this.findPlayer(cur, username);
            if (p && !p.connected && this.isLobby(cur)) this.controller.leave(username);
          }, LOBBY_GRACE_MS)
        );
      }
    } else {
      this.controller.setConnected(username, false);
    }
    if (!this.anyConnection(connection.id)) this.controller.setPaused(true);
  }

  onClose(connection: Conn) {
    this.dropped(connection);
  }

  onError(connection: Conn) {
    this.dropped(connection);
  }

  // ── Mensagens ────────────────────────────────────────────────────────────

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Conn) {
    if (typeof raw !== "string") return;
    let message: { type?: unknown; [k: string]: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message.type !== "string") return;

    const username = await this.identity(sender);
    if (!username) return;

    if (message.type === "emoji") {
      if (typeof message.emoji !== "string" || !this.emojis().includes(message.emoji)) return;
      this.room.broadcast(JSON.stringify({ type: "emoji", emoji: message.emoji, fromPlayerId: username }), [sender.id]);
      return;
    }

    if (message.type === "join") {
      // O nome vem da identidade verificada, nunca do que o cliente diz.
      const avatar =
        typeof message.avatarUrl === "string" && message.avatarUrl.length <= MAX_AVATAR_URL_LENGTH ? message.avatarUrl : null;
      message = { type: "join", name: username, avatarUrl: avatar };
      const grace = this.graceTimers.get(username);
      if (grace) {
        clearTimeout(grace);
        this.graceTimers.delete(username);
      }
      // Qualquer conexão viva (jogador ou espectador) acorda a sala, mesmo que o
      // join em si seja recusado (sala cheia / partida em andamento).
      this.controller.setPaused(false);
    }

    const result = this.controller.dispatch(username, message as never);
    if (!result.ok) sender.send(JSON.stringify({ type: "error", error: result.error }));
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  private handleChange(state: S) {
    if (this.perViewer()) {
      // Cada um recebe a SUA visão. Conexão que ainda não terminou de autenticar fica de fora: o onConnect dela manda o estado.
      for (const c of this.room.getConnections<ConnState>()) {
        const who = c.state?.username;
        if (who) c.send(this.stateMessage(state, who));
      }
    } else {
      this.room.broadcast(this.stateMessage(state, null));
    }
    void this.room.storage.put(STATE_KEY, state);
    const over = this.isGameOver(state);
    if (over && !this.wasOver) void this.saveMatchHistory(state);
    this.wasOver = over;
  }

  private async saveMatchHistory(state: S) {
    const row = this.historyRow(state);
    if (!row) return;
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = this.env;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/match_history`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        // O prefixo do room_id é o que separa os jogos no histórico (mesma tabela, sem coluna nova).
        body: JSON.stringify({ room_id: `${this.historyPrefix()}${this.room.id}`, ...row }),
      });
    } catch {
      // histórico é best-effort, não pode travar a partida
    }
  }
}
