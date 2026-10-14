import { describe, expect, it } from "vitest";
import { nextWrongReaction } from "./wrongReaction";

describe("nextWrongReaction", () => {
  it("o PRIMEIRO erro da partida reage (a primeira visão veio sem erro nenhum)", () => {
    let r = nextWrongReaction(null, undefined); // chegou o estado, ninguém errou
    expect(r).toEqual({ react: false, seen: 0 });
    r = nextWrongReaction(r.seen, 1); // alguém erra
    expect(r).toEqual({ react: true, seen: 1 });
  });

  it("erro que já estava no estado quando a tela abriu (reconexão) não reage", () => {
    expect(nextWrongReaction(null, 4)).toEqual({ react: false, seen: 4 });
  });

  it("o mesmo erro visto de novo não reage de novo; um novo reage", () => {
    expect(nextWrongReaction(2, 2)).toEqual({ react: false, seen: 2 });
    expect(nextWrongReaction(2, 3)).toEqual({ react: true, seen: 3 });
  });

  it("sem erro no estado (partida nova, contadores zerados) não reage e não quebra", () => {
    expect(nextWrongReaction(5, undefined)).toEqual({ react: false, seen: 5 });
  });
});
