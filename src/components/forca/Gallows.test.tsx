import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MAX_LIVES } from "@/lib/forca/engine";
import { Gallows, PARTS } from "./Gallows";

const render = (lives: number, lost = false) => renderToStaticMarkup(<Gallows lives={lives} lost={lost} />);
const parts = (html: string) => [...html.matchAll(/data-forca-part="([a-z-]+)"/g)].map((m) => m[1]);

const ORDER = ["head", "body", "left-arm", "right-arm", "left-leg", "right-leg", "eyes", "nose", "mouth", "hat"];

describe("Gallows (o boneco que a mesa divide)", () => {
  it("tem uma parte pra cada erro: 10 partes, com o chapéu por último", () => {
    expect(MAX_LIVES).toBe(10);
    expect(PARTS.map((p) => p.key)).toEqual(ORDER);
    expect(PARTS[PARTS.length - 1].key).toBe("hat");
  });

  it("com todas as partes por desenhar só a estrutura aparece; cada erro desenha a próxima, na ordem", () => {
    expect(parts(render(MAX_LIVES))).toEqual([]);
    expect(parts(render(MAX_LIVES - 1))).toEqual(["head"]);
    expect(parts(render(MAX_LIVES - 3))).toEqual(["head", "body", "left-arm"]);
    // todos os membros vêm antes do rosto; o rosto antes do chapéu
    expect(parts(render(MAX_LIVES - 6))).toEqual(["head", "body", "left-arm", "right-arm", "left-leg", "right-leg"]);
    expect(parts(render(MAX_LIVES - 9))).toEqual(ORDER.slice(0, 9));
    expect(parts(render(0))).toEqual(ORDER);
  });

  it("o chapéu só aparece no último erro (é ele que fecha a forca)", () => {
    expect(parts(render(1))).not.toContain("hat");
    expect(parts(render(0))).toContain("hat");
  });

  it("marca quantas partes foram desenhadas e fala as partes restantes pra leitores de tela", () => {
    const html = render(4);
    expect(html).toContain('data-lost="6"');
    expect(html).toContain("4 partes restantes");
    expect(render(1)).toContain("1 parte restante");
  });

  it("valores fora do intervalo não quebram o desenho", () => {
    expect(parts(render(-3))).toHaveLength(MAX_LIVES);
    expect(parts(render(99))).toEqual([]);
  });

  it("rodada perdida: o boneco balança, os olhos viram X e a boca fica triste; senão não", () => {
    const dead = render(0, true);
    expect(dead).toContain("forca-swing");
    expect(dead).toContain('data-eyes="x"');
    expect(dead).toContain('data-mouth="frown"');
    expect(dead).toContain('data-dead="true"');
    const alive = render(0, false);
    expect(alive).not.toContain("forca-swing");
    expect(alive).toContain('data-eyes="dots"');
    expect(alive).toContain('data-mouth="smile"');
    // as partes continuam as mesmas 10, perdendo ou não
    expect(parts(dead)).toEqual(parts(alive));
  });
});
