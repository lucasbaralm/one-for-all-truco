import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LUDO_COLORS } from "./colors";
import { LudoDice } from "./LudoDice";

const render = (props: Partial<React.ComponentProps<typeof LudoDice>> = {}) =>
  renderToStaticMarkup(<LudoDice value={null} rolling={false} rollKey={0} canRoll={false} color={LUDO_COLORS.red} {...props} />);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

/** Rotação do cubo (graus em X e Y) como sai no HTML; o framer omite o que é zero. */
function cubeRotation(html: string): { x: number; y: number } {
  const style = /transform-style:preserve-3d;transform:([^;"]*)/.exec(html)?.[1] ?? "";
  const num = (axis: "X" | "Y") => Number(new RegExp(`rotate${axis}\\((-?\\d+(?:\\.\\d+)?)deg\\)`).exec(style)?.[1] ?? 0);
  return { x: num("X"), y: num("Y") };
}
const mod360 = (n: number) => ((n % 360) + 360) % 360;

describe("LudoDice", () => {
  it("é um cubo de verdade: 6 faces e 21 pontinhos (1+2+3+4+5+6)", () => {
    expect(count(render(), /m-auto rounded-full/g)).toBe(21);
  });

  it("só dá pra rolar na minha vez: botão habilitado com o aviso 'Rolar!'; fora dela, desabilitado", () => {
    const disabledAttr = /<button[^>]*\sdisabled=""/;
    const mine = render({ canRoll: true });
    expect(mine).toContain('aria-label="Rolar o dado"');
    expect(mine).toContain("Rolar!");
    expect(mine).not.toMatch(disabledAttr);

    const theirs = render({ canRoll: false });
    expect(theirs).toMatch(disabledAttr);
    expect(theirs).not.toContain("Rolar!");
  });

  it("descreve o resultado pra leitores de tela e esmaece quando ainda não há valor", () => {
    expect(render({ value: 4 })).toContain('aria-label="Dado: 4"');
    expect(render({ value: null })).toContain("opacity:0.55");
    expect(render({ value: 4 })).not.toContain("opacity:0.55");
  });

  it("cada resultado deixa a face certa virada pra frente", () => {
    const expected: Record<number, { x: number; y: number }> = {
      1: { x: 0, y: 0 },
      2: { x: 0, y: -90 },
      3: { x: -90, y: 0 },
      4: { x: 90, y: 0 },
      5: { x: 0, y: 90 },
      6: { x: 0, y: 180 },
    };
    for (let value = 1; value <= 6; value++) {
      expect(cubeRotation(render({ value })), `valor ${value}`).toEqual(expected[value]);
    }
  });

  it("faces opostas somam 7: os cubos dos valores v e 7-v ficam 180° um do outro", () => {
    for (const v of [1, 2, 3]) {
      const a = cubeRotation(render({ value: v }));
      const b = cubeRotation(render({ value: 7 - v }));
      expect(mod360(Math.abs(a.x - b.x) + Math.abs(a.y - b.y))).toBe(180);
    }
  });

  it("a cada rolada o cubo dá voltas completas A MAIS e cai na mesma face (sempre girando pra frente)", () => {
    for (let value = 1; value <= 6; value++) {
      const base = cubeRotation(render({ value, rollKey: 0 }));
      let previousSpin = 0;
      for (let rollKey = 1; rollKey <= 6; rollKey++) {
        const r = cubeRotation(render({ value, rollKey }));
        expect(mod360(r.x - base.x), `valor ${value}, rolada ${rollKey}`).toBe(0);
        expect(mod360(r.y - base.y), `valor ${value}, rolada ${rollKey}`).toBe(0);
        const spin = Math.abs(r.x - base.x) + Math.abs(r.y - base.y);
        expect(spin).toBeGreaterThan(previousSpin);
        previousSpin = spin;
      }
    }
  });
});
