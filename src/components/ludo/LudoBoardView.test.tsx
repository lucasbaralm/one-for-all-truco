import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IN_BASE, LudoColor } from "@/lib/ludo/board";
import { LudoState, createLobby, joinLobby, legalMoves, startGame } from "@/lib/ludo/engine";
import { LudoBoardView } from "./LudoBoardView";
import type { AnimatedView } from "./useLudoAnimator";

// O tabuleiro desenhado: quantas peças aparecem, quais delas são clicáveis (só
// as MINHAS que podem andar, e só quando não há animação rolando) e os efeitos.

function game(pieces: Partial<Record<LudoColor, number[]>>, dice: number): LudoState {
  let s = createLobby();
  for (const color of Object.keys(pieces) as LudoColor[]) {
    const r = joinLobby(s, { id: color, name: color }, color);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  const started = startGame(s, () => 0);
  if (!started.ok) throw new Error(started.error);
  const state = started.state;
  return {
    ...state,
    phase: "moving",
    dice,
    turn: state.players.findIndex((p) => p.color === "red"),
    players: state.players.map((p) => ({ ...p, pieces: pieces[p.color] ?? p.pieces })),
  };
}

const viewOf = (state: LudoState, over: Partial<AnimatedView> = {}): AnimatedView => ({
  state,
  pieces: Object.fromEntries(state.players.map((p) => [p.id, [...p.pieces]])),
  motion: {},
  hop: null,
  dice: state.dice,
  diceRolling: false,
  diceKey: 0,
  busy: false,
  effects: [],
  trail: null,
  ...over,
});

const FOUR = {
  red: [10, 20, IN_BASE, IN_BASE],
  green: [IN_BASE, IN_BASE, IN_BASE, IN_BASE],
  blue: [30, IN_BASE, IN_BASE, IN_BASE],
  yellow: [44, 5, IN_BASE, IN_BASE],
};

function render(over: { state?: LudoState; view?: Partial<AnimatedView>; myColor?: LudoColor | null; rotation?: number; activeColor?: LudoColor | null; withMoves?: boolean } = {}) {
  const state = over.state ?? game(FOUR, 3);
  return renderToStaticMarkup(
    <LudoBoardView
      view={viewOf(state, over.view)}
      players={state.players}
      rotation={over.rotation ?? 0}
      activeColor={over.activeColor ?? null}
      moves={over.withMoves === false ? [] : legalMoves(state)}
      myColor={over.myColor === undefined ? "red" : over.myColor}
      onMove={() => {}}
    />
  );
}
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
/** Peões de verdade no tabuleiro (os "fantasmas" dos destinos têm o mesmo desenho, mas não contam). */
const pawns = (html: string) => count(html, /viewBox="0 0 40 52"/g) - count(html, /data-ghost/g);
/** Índices (0..3) das peças clicáveis: o rótulo de acessibilidade é "Mover peça N" com N de 1 a 4. */
const movable = (html: string) => [...html.matchAll(/aria-label="Mover peça (\d)"/g)].map((m) => Number(m[1]) - 1);

describe("LudoBoardView", () => {
  it("desenha as 16 peças (4 jogadores × 4), mesmo as que ainda estão na base", () => {
    expect(pawns(render())).toBe(16);
  });

  it("só 2 jogadores? 8 peças", () => {
    const two = game({ red: [10, IN_BASE, IN_BASE, IN_BASE], blue: [IN_BASE, IN_BASE, IN_BASE, IN_BASE] }, 3);
    expect(pawns(render({ state: two }))).toBe(8);
  });

  it("minhas peças que podem andar viram botões, cada uma com seu destino marcado", () => {
    const html = render();
    expect(movable(html)).toEqual([0, 1]); // vermelho: duas peças no anel com dado 3 (as da base não saem sem 6)
    expect(count(html, /ludo-marker/g)).toBe(2);
  });

  it("com 6 no dado, as peças da base também podem sair", () => {
    const six = game(FOUR, 6);
    expect(movable(render({ state: six })).sort()).toEqual([0, 1, 2, 3]);
  });

  it("nada é clicável durante uma animação, nem pra quem só assiste, nem quando não é minha vez de escolher", () => {
    expect(movable(render({ view: { busy: true } }))).toEqual([]);
    expect(count(render({ view: { busy: true } }), /ludo-marker/g)).toBe(0);
    expect(movable(render({ myColor: null }))).toEqual([]);
    expect(movable(render({ withMoves: false }))).toEqual([]);
  });

  it("peças dos adversários nunca são botões, mesmo com o mesmo índice de uma peça minha", () => {
    // azul também tem a peça 0 no anel, mas só as peças do vermelho (myColor) aceitam clique
    const html = render();
    expect(movable(html)).toHaveLength(2);
    expect(count(html, /<button/g)).toBe(2);
  });

  it("efeitos: captura mostra 💥 e chegar em casa mostra ⭐", () => {
    const effect = (kind: "capture" | "home") => render({ view: { effects: [{ id: 1, kind, x: 7.5, y: 7.5, color: "red" }] } });
    expect(effect("capture")).toContain("💥");
    expect(effect("capture")).not.toContain("⭐");
    expect(effect("home")).toContain("⭐");
    expect(render()).not.toContain("💥");
  });

  it("o peão em si nunca recebe mouse (só o botão da peça movível) e a peça que posso mover fica acima das outras da casa", () => {
    const html = render();
    // um wrapper por peão (16), todos sem eventos de mouse; os botões (2 movíveis) é que aceitam clique
    expect(count(html, /class="pointer-events-none absolute left-0 top-0"/g)).toBe(16);
    expect(count(html, /pointer-events-auto/g)).toBe(2);
    // as peças movíveis (z 35) ficam acima das demais peças paradas (z 10 + linha)
    const z = [...html.matchAll(/class="pointer-events-none absolute left-0 top-0" style="[^"]*z-index:(\d+)/g)].map((m) => Number(m[1]));
    expect(z.filter((n) => n === 35)).toHaveLength(2);
    expect(Math.max(...z.filter((n) => n !== 35 && n !== 40))).toBeLessThan(35);
  });

  it("cada destino possível mostra a peça 'fantasma' que ficaria lá — e nada disso durante animação", () => {
    expect(count(render(), /data-ghost/g)).toBe(2);
    expect(count(render({ view: { busy: true } }), /data-ghost/g)).toBe(0);
    expect(count(render({ myColor: null }), /data-ghost/g)).toBe(0);
  });

  it("rastro da última jogada: desenhado quando existe, ausente quando não", () => {
    const trail = { id: 1, color: "red" as const, drawMs: 640, points: [{ x: 6.5, y: 13.5 }, { x: 6.5, y: 12.5 }, { x: 6.5, y: 11.5 }] };
    const html = render({ view: { trail } });
    expect(count(html, /<polyline/g)).toBe(2); // contorno branco + traço colorido
    expect(count(html, /<circle/g)).toBeGreaterThanOrEqual(2); // origem e destino
    expect(count(render(), /<polyline/g)).toBe(0);
    // com um ponto só não há o que desenhar
    expect(count(render({ view: { trail: { ...trail, points: [trail.points[0]] } } }), /<polyline/g)).toBe(0);
  });

  it("realça a base de quem tem a vez (e só ela)", () => {
    expect(count(render({ activeColor: "red" }), /ludo-base-pulse/g)).toBe(1);
    expect(count(render({ activeColor: null }), /ludo-base-pulse/g)).toBe(0);
  });

  it("a rotação de exibição muda a posição das peças mas nunca o que aparece", () => {
    const base = render({ rotation: 0 });
    for (const rotation of [1, 2, 3]) {
      const turned = render({ rotation });
      expect(turned).not.toBe(base);
      expect(pawns(turned)).toBe(16);
      expect(movable(turned)).toEqual(movable(base));
    }
  });
});
