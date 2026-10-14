import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreDelta } from "./ScoreDelta";

describe("ScoreDelta", () => {
  it("primeira tela: só o número, sem '+N' (nada mudou ainda)", () => {
    const html = renderToStaticMarkup(<ScoreDelta value={7} />);
    expect(html).toContain(">7<");
    expect(html).not.toContain("+");
  });

  it("aceita um jeito próprio de mostrar o número", () => {
    const html = renderToStaticMarkup(<ScoreDelta value={4}>{(n) => <>💀 {n} pts</>}</ScoreDelta>);
    expect(html).toContain("💀 4 pts");
  });

  it("placar da rodada: começa no valor de ANTES e só depois sobe pro novo", () => {
    const html = renderToStaticMarkup(<ScoreDelta value={5} from={3} />);
    expect(html).toContain(">3<");
    expect(html).not.toContain(">5<");
  });
});
