import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import type { Conn, RoomFactory, RoomHandler, RoomPort } from "../party/room-types";

// Liga um servidor de sala (GameRoom, FodinhaRoom — party/*.ts, que só conhecem as interfaces de
// party/room-types.ts) a um Durable Object do PartyServer. É a ÚNICA ponta do projeto que
// conhece o PartyServer; trocar de framework de novo é trocar este arquivo.
//
// Sem hibernação (o padrão): os bots e o prazo de graça do lobby usam setTimeout, que não
// sobrevive a um Durable Object hibernado — enquanto há conexões aberta, ele fica vivo em
// memória; sem ninguém conectado o jogo já pausa sozinho (GameRoom.setPaused) e o estado
// volta do storage no próximo onStart.

export function partyServer(Room: RoomFactory) {
  return class PartyRoom extends Server<Cloudflare.Env> {
    private handler!: RoomHandler;

    async onStart() {
      const port: RoomPort = {
        id: this.name,
        env: this.env as unknown as Record<string, unknown>,
        storage: {
          get: <T>(key: string) => this.ctx.storage.get<T>(key),
          put: (key: string, value: unknown) => this.ctx.storage.put(key, value),
        },
        broadcast: (message, without) => this.broadcast(message, without),
        getConnections: <S>() => this.getConnections() as unknown as Iterable<Conn<S>>,
      };
      this.handler = new Room(port);
      await this.handler.onStart?.();
    }

    onConnect(connection: Connection, ctx: ConnectionContext) {
      return this.handler.onConnect?.(connection as unknown as Conn, ctx);
    }

    // PartyServer entrega (conexão, mensagem); o servidor do jogo recebe (mensagem, conexão).
    onMessage(connection: Connection, message: WSMessage) {
      return this.handler.onMessage?.(message, connection as unknown as Conn);
    }

    onClose(connection: Connection) {
      this.handler.onClose?.(connection as unknown as Conn);
    }

    onError(connection: Connection) {
      this.handler.onError?.(connection as unknown as Conn);
    }
  };
}
