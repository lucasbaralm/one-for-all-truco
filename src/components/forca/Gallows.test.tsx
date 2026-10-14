import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_LIVES } from "@/lib/forca/engine";
import { Gallows, PARTS } from "./Gallows";

const render = (lives: number, lost = false) => renderToStaticMarkup(<Gallows lives={lives} lost={lost} />);
const parts = (html: string) => [...html.matchAll(/data-forca-part="([a-z-]+)"/g)].map((m) => m[1]);

describe("Gallows", () => {
  it("tem uma parte do boneco pra cada vida (6 vidas = 6 partes)", () => {
    expect(PARTS).toHaveLength(MAX_LIVES);
  });

  it("com todas as vidas só a estrutura aparece; cada vida perdida desenha a próxima parte, na ordem", () => {
    expect(parts(render(MAX_LIVES))).toEqual([]);
    expect(parts(render(MAX_LIVES - 1))).toEqual(["head"]);
    expect(parts(render(MAX_LIVES - 3))).toEqual(["head", "body", "left-arm"]);
    expect(parts(render(0))).toEqual(["head", "body", "left-arm", "right-arm", "left-leg", "right-leg"]);
  });

  it("marca quantas partes foram desenhadas e fala as vidas pra leitores de tela", () => {
    const html = render(2);
    expect(html).toContain('data-lost="4"');
    expect(html).toContain("2 vidas restantes");
    expect(render(1)).toContain("1 vida restante");
  });

  it("vidas fora do intervalo não quebram o desenho", () => {
    expect(parts(render(-3))).toHaveLength(MAX_LIVES);
    expect(parts(render(99))).toEqual([]);
  });

  it("rodada perdida: o boneco balança e ganha olhos de X; senão não", () => {
    const dead = render(0, true);
    expect(dead).toContain("forca-swing");
    expect(dead).toContain('data-forca-part="eyes"');
    expect(dead).toContain('data-dead="true"');
    const alive = render(0, false);
    expect(alive).not.toContain("forca-swing");
    expect(alive).not.toContain('data-forca-part="eyes"');
  });
});
