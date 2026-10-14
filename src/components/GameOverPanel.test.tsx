import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resultHeadline } from "@/lib/gameResult";
import { GameOverPanel, GameOverRow } from "./GameOverPanel";

// A tela de fim de partida é a mesma nos três jogos: o que muda é o texto, que
// fala com quem está olhando, e a linha da própria pessoa em destaque.

const order = [
  { id: "ana", name: "Ana" },
  { id: "beto", name: "Beto" },
  { id: "cris", name: "Cris" },
];
const rows = (me: string | null): GameOverRow[] =>
  order.map((p, i) => ({ id: p.id, name: p.name, detail: `${10 - i} pts`, stats: i === 0 ? "💥 2 capturas" : undefined, isMe: p.id === me, color: i === 0 ? "#f00" : undefined }));
const noop = () => {};

const render = (me: string | null, winnerId = "ana", extra: Partial<React.ComponentProps<typeof GameOverPanel>> = {}) =>
  renderToStaticMarkup(
    <GameOverPanel
      headline={resultHeadline(order, winnerId, me)}
      rows={rows(me)}
      myStats={["🎲 12 rolagens"]}
      actions={[{ label: "Jogar de novo", onClick: noop, primary: true }, { label: "Sair", onClick: noop }]}
      {...extra}
    />
  );
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("GameOverPanel", () => {
  it("quem ganhou: 'Você venceu!', confete e a própria linha marcada", () => {
    const html = render("ana");
    expect(html).toContain("Parabéns!");
    expect(html).toContain("Você venceu!");
    expect(html).toContain("(você)");
    expect(html).toContain("z-[66]"); // o confete
  });

  it("quem perdeu: o lugar em que ficou e quem venceu — sem confete", () => {
    const html = render("cris");
    expect(html).toContain("Você ficou em 3º lugar");
    expect(html).toContain("Ana venceu");
    expect(html).not.toContain("Você venceu!");
    expect(html).not.toContain("z-[66]");
  });

  it("quem só assistia: o nome do vencedor, sem '(você)'", () => {
    const html = render(null, "beto");
    expect(html).toContain("Beto venceu");
    expect(html).not.toContain("(você)");
    expect(html).not.toContain("z-[66]");
  });

  it("uma linha por jogador, em ordem, com resultado e estatísticas", () => {
    const html = render("beto");
    for (const name of ["Ana", "Beto", "Cris"]) expect(html).toContain(name);
    expect(html.indexOf("Ana")).toBeLessThan(html.indexOf("Beto"));
    expect(html.indexOf("Beto")).toBeLessThan(html.indexOf("Cris"));
    expect(html).toContain("10 pts");
    expect(html).toContain("💥 2 capturas");
    expect(count(html, /\(você\)/g)).toBe(1);
  });

  it("fichinhas do próprio desempenho só aparecem quando há", () => {
    expect(render("ana")).toContain("🎲 12 rolagens");
    expect(render("ana", "ana", { myStats: [] })).not.toContain("rolagens");
  });

  it("botões na ordem pedida: o principal é o primeiro", () => {
    const html = render("ana");
    expect(count(html, /<button/g)).toBe(2);
    expect(html.indexOf("Jogar de novo")).toBeLessThan(html.indexOf("Sair"));
  });

  it("sem desfoque no fundo (um blur em tela cheia atrás de confete trava a animação)", () => {
    expect(render("ana")).not.toContain("backdrop-blur");
  });
});
