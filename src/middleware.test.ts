import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

// O portão de senha que protege o site inteiro (os três jogos): sem o cookie,
// tudo vai pra /gate — menos o próprio portão, a rota que valida a senha e os
// arquivos estáticos.

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });
const isRedirectToGate = (res: Response) => res.status === 307 && new URL(res.headers.get("location")!).pathname === "/gate";

describe("portão do site", () => {
  it("sem o cookie, qualquer página de qualquer jogo vai pro portão — guardando pra onde voltar", () => {
    for (const path of ["/", "/lobby", "/lobby/ludo", "/lobby/dobble", "/ludo/ABCD", "/dobble/ABCD", "/game/ABCD"]) {
      const res = middleware(request(path));
      expect(isRedirectToGate(res), path).toBe(true);
      expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe(path);
    }
  });

  it("guarda também a query da sala (o ?bots=... das partidas contra bots não se perde)", () => {
    const res = middleware(request("/ludo/ABCDEF?bots=3&level=hard&color=red"));
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/ludo/ABCDEF?bots=3&level=hard&color=red");
  });

  it("com o cookie certo, deixa passar", () => {
    for (const path of ["/lobby", "/ludo/ABCD", "/dobble/ABCD?bots=2", "/game/ABCD"]) {
      const res = middleware(request(path, "fodinha_gate=1"));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("cookie com outro valor não vale", () => {
    for (const cookie of ["fodinha_gate=0", "fodinha_gate=true", "fodinha_gate=", "outro=1"]) {
      expect(isRedirectToGate(middleware(request("/lobby", cookie))), cookie).toBe(true);
    }
  });

  it("o portão, a rota da senha, os temas e o favicon passam sem cookie (senão ninguém entra)", () => {
    for (const path of ["/gate", "/gate?next=%2Flobby", "/api/gate", "/themes/bg_aquarium.jpg", "/favicon.ico"]) {
      const res = middleware(request(path));
      expect(res.status, path).toBe(200);
    }
  });
});
