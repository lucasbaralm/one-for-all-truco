import { describe, expect, it } from "vitest";
import { AUTH_UNAVAILABLE_CLOSE_CODE, KICKED_CLOSE_CODE, UNAUTHORIZED_CLOSE_CODE } from "../party-codes";
import { isFreshRoomOf, statusAfterClose, statusAfterOpen } from "./roomRules";

describe("statusAfterClose — o que cada código de fechamento significa pro cliente", () => {
  it("expulso (4003) e login recusado (4001) param de tentar reconectar", () => {
    expect(statusAfterClose(KICKED_CLOSE_CODE)).toEqual({ status: "kicked", stopRetrying: true });
    expect(statusAfterClose(UNAUTHORIZED_CLOSE_CODE)).toEqual({ status: "unauthorized", stopRetrying: true });
  });

  it("servidor sem acesso ao Supabase (4002) continua tentando sozinho", () => {
    expect(statusAfterClose(AUTH_UNAVAILABLE_CLOSE_CODE)).toEqual({ status: "auth_unavailable", stopRetrying: false });
  });

  it("qualquer outra queda (rede, servidor reiniciando, 1006, 1001...) é 'reconectando'", () => {
    for (const code of [1000, 1001, 1006, 1011, 4000, 4004, 4999]) {
      expect(statusAfterClose(code), `código ${code}`).toEqual({ status: "reconnecting", stopRetrying: false });
    }
  });

  it("os três códigos do projeto são diferentes entre si (senão um viraria o outro)", () => {
    expect(new Set([KICKED_CLOSE_CODE, UNAUTHORIZED_CLOSE_CODE, AUTH_UNAVAILABLE_CLOSE_CODE]).size).toBe(3);
  });
});

describe("statusAfterOpen", () => {
  it("abrir a conexão vira 'open', menos quando o servidor acabou de avisar que não alcança o Supabase", () => {
    expect(statusAfterOpen("connecting")).toBe("open");
    expect(statusAfterOpen("reconnecting")).toBe("open");
    expect(statusAfterOpen("open")).toBe("open");
    expect(statusAfterOpen("auth_unavailable")).toBe("auth_unavailable"); // abre e fecha de novo: o aviso fica
  });
});

describe("isFreshRoomOf — hora de montar a partida 'contra bots'", () => {
  const fresh = { phase: "lobby", gameNumber: 0, players: [{ id: "eu" }] };

  it("lobby, nenhuma partida ainda e só eu na sala", () => {
    expect(isFreshRoomOf(fresh, "eu")).toBe(true);
  });

  it("não repete: com a partida rolando (reload), depois de uma revanche, ou com mais gente", () => {
    expect(isFreshRoomOf({ ...fresh, phase: "rolling" }, "eu")).toBe(false);
    expect(isFreshRoomOf({ ...fresh, phase: "playing" }, "eu")).toBe(false);
    expect(isFreshRoomOf({ ...fresh, gameNumber: 1 }, "eu")).toBe(false);
    expect(isFreshRoomOf({ ...fresh, players: [{ id: "eu" }, { id: "bot:1" }] }, "eu")).toBe(false);
  });

  it("nem quando a sala vazia/ocupada é de outra pessoa (não sou eu quem monta)", () => {
    expect(isFreshRoomOf({ ...fresh, players: [{ id: "outro" }] }, "eu")).toBe(false);
    expect(isFreshRoomOf({ ...fresh, players: [] }, "eu")).toBe(false);
  });
});
