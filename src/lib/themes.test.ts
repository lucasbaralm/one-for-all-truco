import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  ALL_THEMES,
  DEFAULT_THEME,
  THEMES,
  THEME_BG,
  THEME_GROUPS,
  groupedThemes,
  isTheme,
  resolveTheme,
  themeById,
  themesInGroup,
  type Theme,
} from "./themes";
import { PlayingCard, TABLE_BG } from "@/components/game/PlayingCard";
import { ThemeGrid } from "@/components/ThemeSelector";

// O registro de temas é a fonte única de tudo que um tema define (seletor, fundo,
// camada escura, versos e bordas de carta). Estes testes seguram duas coisas:
// os 11 temas antigos continuam IDÊNTICOS (quem tem um tema salvo reabre igual) e
// os temas novos têm arte válida, segura e leve.

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
const onDisk = (url: string) => join(PUBLIC_DIR, url.replace(/^\//, ""));

// Os 11 temas de antes do registro, exatamente como estavam espalhados em
// ThemeProvider / ThemeSelector / PlayingCard.
const LEGACY: Record<string, { label: string; icon: string; activeClass: string; bg: string; overlay: string; cardBacks: string[]; cardBorders: [string, string] }> = {
  aquarium: { label: "Aquário", icon: "🐠", activeClass: "bg-cyan-600 hover:bg-cyan-700", bg: "/themes/bg_aquarium.jpg", overlay: "bg-black/60", cardBacks: ["/themes/card_back_aquarium.jpg"], cardBorders: ["border-red-400", "border-cyan-400"] },
  candy: { label: "Doces", icon: "🍬", activeClass: "bg-pink-600 hover:bg-pink-700", bg: "/themes/bg_candy.jpg", overlay: "bg-black/50", cardBacks: ["/themes/card_back_candy.jpg"], cardBorders: ["border-pink-400", "border-purple-400"] },
  adventure: { label: "Aventura", icon: "⚔️", activeClass: "bg-green-600 hover:bg-green-700", bg: "/themes/bg_adventure.jpg", overlay: "bg-black/65", cardBacks: ["/themes/card_back_adventure.jpg"], cardBorders: ["border-orange-400", "border-green-500"] },
  pedro: { label: "Pedro", icon: "🎭", activeClass: "bg-yellow-600 hover:bg-yellow-700", bg: "/themes/bg_pedro.jpg", overlay: "bg-black/55", cardBacks: ["/themes/card_back_pedro.png"], cardBorders: ["border-yellow-400", "border-zinc-400"] },
  lotr: { label: "Anéis", icon: "💍", activeClass: "bg-amber-700 hover:bg-amber-800", bg: "/themes/bg_lotr.jpg", overlay: "bg-black/60", cardBacks: ["/themes/card_back_lotr.jpg"], cardBorders: ["border-amber-500", "border-stone-400"] },
  mpb: { label: "MPB", icon: "🎸", activeClass: "bg-emerald-700 hover:bg-emerald-800", bg: "/themes/bg_mpb.jpg", overlay: "bg-black/50", cardBacks: ["/themes/card_back_mpb.jpg"], cardBorders: ["border-orange-600", "border-teal-600"] },
  lgbt: { label: "Orgulho", icon: "🏳️‍🌈", activeClass: "bg-fuchsia-600 hover:bg-fuchsia-700", bg: "/themes/bg_lgbt.jpg", overlay: "bg-black/55", cardBacks: ["/themes/card_back_lgbt.jpg"], cardBorders: ["border-rose-500", "border-indigo-500"] },
  olivia: { label: "Olivia", icon: "🐕", activeClass: "bg-orange-600 hover:bg-orange-700", bg: "/themes/bg_olivia.png", overlay: "bg-black/60", cardBacks: ["/themes/card_back_olivia_1.png", "/themes/card_back_olivia_2.png", "/themes/card_back_olivia_3.jpg"], cardBorders: ["border-orange-400", "border-amber-700"] },
  gatos: { label: "Gatos", icon: "🐈", activeClass: "bg-purple-600 hover:bg-purple-700", bg: "/themes/bg_gatos.jpg", overlay: "bg-black/55", cardBacks: ["/themes/card_back_gatos_1.jpg", "/themes/card_back_gatos_2.jpg"], cardBorders: ["border-purple-400", "border-slate-500"] },
  mamadores: { label: "Mamadores", icon: "🎉", activeClass: "bg-red-600 hover:bg-red-700", bg: "/themes/bg_mamadores.jpg", overlay: "bg-black/55", cardBacks: ["/themes/card_back_mamadores_1.jpg", "/themes/card_back_mamadores_2.jpg"], cardBorders: ["border-red-400", "border-yellow-500"] },
  jessie: { label: "Jessie", icon: "🌸", activeClass: "bg-rose-500 hover:bg-rose-600", bg: "/themes/bg_jessie.jpg", overlay: "bg-black/60", cardBacks: ["/themes/card_back_jessie_1.jpg"], cardBorders: ["border-rose-400", "border-pink-600"] },
};
const LEGACY_IDS = Object.keys(LEGACY);

const HORA_DE_AVENTURA = ["bubbline", "finnjake", "bmo", "reinogelo", "marceline", "reinofogo"];
const MAIS = ["espaco", "neon", "floresta", "praia", "halloween", "arcade"];
const NEW_IDS = [...HORA_DE_AVENTURA, ...MAIS];

describe("registro de temas", () => {
  it("ids únicos, e ALL_THEMES é exatamente a lista dos ids do registro", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ALL_THEMES]).toEqual(ids);
    expect(ids).toHaveLength(LEGACY_IDS.length + NEW_IDS.length); // 11 antigos + 12 novos
  });

  it("todo tema tem rótulo, ícone, classe do botão ativo, camada escura e ao menos um verso", () => {
    for (const t of THEMES) {
      expect(t.label.trim(), t.id).not.toBe("");
      expect(t.icon.trim(), t.id).not.toBe("");
      expect(t.activeClass, t.id).toMatch(/^bg-[a-z]+-\d{2,3} hover:bg-[a-z]+-\d{2,3}$/);
      expect(t.overlay, t.id).toMatch(/^bg-black\/\d{2}$/);
      const pct = Number(t.overlay.split("/")[1]);
      expect(pct, t.id).toBeGreaterThanOrEqual(50);
      expect(pct, t.id).toBeLessThanOrEqual(65);
      expect(t.cardBacks.length, t.id).toBeGreaterThanOrEqual(1);
      expect(t.cardBorders, t.id).toHaveLength(2);
      for (const c of t.cardBorders) expect(c, t.id).toMatch(/^border-[a-z]+-\d{2,3}$/);
    }
  });

  it("rótulos e ícones são únicos (senão o seletor fica ambíguo)", () => {
    const labels = THEMES.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("todo arquivo referenciado (fundo e versos) existe em public/", () => {
    for (const t of THEMES) {
      for (const url of [t.bg, ...t.cardBacks]) {
        expect(url.startsWith("/themes/"), `${t.id}: ${url}`).toBe(true);
        expect(existsSync(onDisk(url)), `${t.id}: falta ${url}`).toBe(true);
      }
    }
  });

  it("os 11 temas antigos continuam com os mesmos ids, arquivos e valores de antes", () => {
    for (const [id, legacy] of Object.entries(LEGACY)) {
      const t = themeById(id);
      expect(t.id).toBe(id);
      expect(t.label).toBe(legacy.label);
      expect(t.icon).toBe(legacy.icon);
      expect(t.activeClass).toBe(legacy.activeClass);
      expect(t.bg).toBe(legacy.bg);
      expect(t.overlay).toBe(legacy.overlay);
      expect([...t.cardBacks]).toEqual(legacy.cardBacks);
      expect([...t.cardBorders]).toEqual(legacy.cardBorders);
      expect(t.group).toBe("classico");
    }
    // e na mesma ordem em que o seletor sempre mostrou
    expect(ALL_THEMES.slice(0, LEGACY_IDS.length)).toEqual(LEGACY_IDS);
  });

  it("os temas novos pedidos existem, nos grupos certos", () => {
    expect(themesInGroup("hora-de-aventura").map((t) => t.id)).toEqual(HORA_DE_AVENTURA);
    expect(themesInGroup("mais").map((t) => t.id)).toEqual(MAIS);
    expect(themesInGroup("classico").map((t) => t.id)).toEqual(LEGACY_IDS);
    expect(themeById("bubbline").icon).toBe("💗");
  });

  it("cada grupo tem ao menos um tema e todo tema pertence a um grupo conhecido", () => {
    for (const g of THEME_GROUPS) expect(themesInGroup(g.id).length, g.id).toBeGreaterThanOrEqual(1);
    const known = new Set(THEME_GROUPS.map((g) => g.id));
    for (const t of THEMES) expect(known.has(t.group), t.id).toBe(true);
    expect(THEME_GROUPS.map((g) => g.label)).toEqual(["Clássicos", "Hora de Aventura", "Mais temas"]);
    const total = groupedThemes().reduce((n, g) => n + g.themes.length, 0);
    expect(total).toBe(THEMES.length);
  });

  it("tema salvo inválido cai no tema padrão (aquarium); válido é mantido", () => {
    expect(DEFAULT_THEME).toBe("aquarium");
    expect(isTheme(DEFAULT_THEME)).toBe(true);
    for (const id of ALL_THEMES) expect(resolveTheme(id)).toBe(id);
    for (const lixo of [null, undefined, "", "Aquarium", "nao-existe", "toString", "__proto__", 42, {}, []]) {
      expect(resolveTheme(lixo), String(lixo)).toBe(DEFAULT_THEME);
    }
  });

  it("themeById de id desconhecido devolve o tema padrão", () => {
    expect(themeById("nao-existe").id).toBe(DEFAULT_THEME);
    expect(themeById(null).id).toBe(DEFAULT_THEME);
    expect(themeById(undefined).id).toBe(DEFAULT_THEME);
  });

  it("THEME_BG / TABLE_BG (PlayingCard) saem do registro", () => {
    for (const t of THEMES) {
      expect(THEME_BG[t.id]).toBe(t.bg);
      expect(TABLE_BG[t.id]).toBe(t.bg);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Arte nova: SVGs feitos à mão. Bem formados, sem nada externo e leves.
// ─────────────────────────────────────────────────────────────────────────────

function readSvg(url: string) {
  const file = onDisk(url);
  return { text: readFileSync(file, "utf8"), bytes: statSync(file).size };
}

// Confere que as tags abrem e fecham na ordem (o parser do cheerio é tolerante
// e não reclamaria de um </g> faltando).
function assertBalanced(xml: string, label: string) {
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  const body = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  for (const m of body.matchAll(tag)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      expect(stack.pop(), `${label}: </${name}> sem abertura correspondente`).toBe(name);
    } else {
      stack.push(name);
    }
  }
  expect(stack, `${label}: tags sem fechar`).toEqual([]);
}

describe.each(NEW_IDS)("arte do tema %s", (id) => {
  const t = themeById(id);
  const files = [
    { kind: "fundo", url: t.bg, viewBox: "0 0 1920 1080" },
    ...t.cardBacks.map((url) => ({ kind: "verso", url, viewBox: "0 0 500 700" })),
  ];

  it("fundo e verso são SVG com o nome combinado", () => {
    expect(t.bg).toBe(`/themes/bg_${id}.svg`);
    expect([...t.cardBacks]).toEqual([`/themes/card_back_${id}.svg`]);
  });

  for (const f of files) {
    describe(`${f.kind} ${f.url}`, () => {
      const { text, bytes } = readSvg(f.url);

      it("é XML bem formado, com <svg> na raiz, namespace e viewBox", () => {
        const $ = cheerio.load(text, { xmlMode: true });
        const roots = $.root().children();
        expect(roots).toHaveLength(1);
        const svg = roots.first();
        expect((svg.get(0) as unknown as { name: string }).name).toBe("svg");
        expect(svg.attr("xmlns")).toBe("http://www.w3.org/2000/svg");
        expect(svg.attr("viewBox")).toBe(f.viewBox);
        expect(svg.attr("preserveAspectRatio")).toBe("xMidYMid slice");
        assertBalanced(text, f.url);
        expect(text, "& solto").not.toMatch(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/);
      });

      it("não tem script, foreignObject nem recurso externo", () => {
        const $ = cheerio.load(text, { xmlMode: true });
        expect($("script").length).toBe(0);
        expect($("foreignObject").length).toBe(0);
        expect($("image").length).toBe(0);
        expect($("style").length).toBe(0);
        expect(text).not.toMatch(/<script|foreignObject|@import|javascript:|\son[a-z]+\s*=/i);
        // href/xlink:href só apontam para ids do próprio arquivo
        $("*").each((_, el) => {
          for (const attr of ["href", "xlink:href"]) {
            const v = $(el).attr(attr);
            if (v !== undefined) expect(v, `${attr} externo em ${f.url}`).toMatch(/^#[\w-]+$/);
          }
        });
        // url(...) só para ids internos
        for (const m of text.matchAll(/url\(\s*([^)]*)\)/g)) expect(m[1], `url() externo em ${f.url}`).toMatch(/^['"]?#[\w-]+['"]?$/);
        // o único "http" permitido é o namespace do <svg>
        expect(text.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:/i);
      });

      it("toda referência (#id) aponta para um id que existe", () => {
        const ids = new Set([...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
        const refs = [...text.matchAll(/url\(#([\w-]+)\)/g), ...text.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
        expect(refs.length).toBeGreaterThan(0);
        for (const r of refs) expect(ids.has(r), `${f.url}: #${r} não existe`).toBe(true);
      });

      it("pesa menos de 100 KB", () => {
        expect(bytes).toBeLessThan(100 * 1024);
      });
    });
  }
});

describe("proporção dos versos novos", () => {
  it("a carta é 5:7, como o PlayingCard (7.2rem x 10.08rem)", () => {
    for (const id of NEW_IDS) {
      const svg = readSvg(`/themes/card_back_${id}.svg`).text;
      const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
      expect(Number(w) / Number(h)).toBeCloseTo(7.2 / 10.08, 3);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Componentes (SSR): a carta lê do registro e o seletor mostra tudo agrupado.
// ─────────────────────────────────────────────────────────────────────────────

describe("PlayingCard lendo do registro", () => {
  const card = { suit: "hearts", value: "A" } as const;
  const black = { suit: "spades", value: "K" } as const;
  const back = (theme: string, backIndex = 0) => renderToStaticMarkup(createElement(PlayingCard, { card, hidden: true, theme, backIndex }));

  it("verso: cada tema usa o seu (inclusive os novos)", () => {
    for (const t of THEMES) expect(back(t.id)).toContain(`url(${t.cardBacks[0]})`);
  });

  it("verso: com várias imagens, alterna pela posição na mão", () => {
    const olivia = themeById("olivia").cardBacks;
    for (let i = 0; i < 7; i++) expect(back("olivia", i)).toContain(`url(${olivia[i % olivia.length]})`);
  });

  it("tema desconhecido cai no verso e na borda do Aquário", () => {
    expect(back("nao-existe")).toContain("card_back_aquarium.jpg");
    const html = renderToStaticMarkup(createElement(PlayingCard, { card, theme: "nao-existe" }));
    expect(html).toContain("border-red-400");
  });

  it("carta aberta: borda do naipe vermelho / preto do tema", () => {
    for (const t of THEMES) {
      const [red, blk] = t.cardBorders;
      expect(renderToStaticMarkup(createElement(PlayingCard, { card, theme: t.id })), `${t.id} vermelha`).toContain(red);
      expect(renderToStaticMarkup(createElement(PlayingCard, { card: black, theme: t.id })), `${t.id} preta`).toContain(blk);
    }
  });
});

describe("seletor de temas (ThemeGrid)", () => {
  const render = (theme: Theme = DEFAULT_THEME) => renderToStaticMarkup(createElement(ThemeGrid, { theme, onSelect: () => {} }));
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
  // o React escapa o & do rótulo ("Finn & Jake") no atributo
  const esc = (s: string) => s.replace(/&/g, "&amp;");

  it("lista os 23 temas, um botão por tema", () => {
    const html = render();
    expect(THEMES).toHaveLength(23);
    expect(count(html, /<button\b/g)).toBe(23);
    for (const t of THEMES) {
      expect(html, t.id).toContain(`title="${esc(t.label)}"`);
      expect(html, t.id).toContain(t.icon);
    }
  });

  it("agrupa com um título pequeno por grupo, na ordem Clássicos → Hora de Aventura → Mais temas", () => {
    const html = render();
    expect(count(html, /<h3\b/g)).toBe(3);
    const at = (label: string) => html.indexOf(`>${label}</h3>`);
    expect(at("Clássicos")).toBeGreaterThan(-1);
    expect(at("Clássicos")).toBeLessThan(at("Hora de Aventura"));
    expect(at("Hora de Aventura")).toBeLessThan(at("Mais temas"));
    // cada tema cai dentro da seção do seu grupo
    for (const g of groupedThemes()) {
      const start = html.indexOf(`data-theme-group="${g.id}"`);
      const end = html.indexOf("</section>", start);
      const section = html.slice(start, end);
      expect(count(section, /<button\b/g), g.id).toBe(g.themes.length);
      for (const t of g.themes) expect(section, `${t.id} em ${g.id}`).toContain(`title="${esc(t.label)}"`);
    }
  });

  it("só o tema atual fica marcado como ativo, com a cor do próprio tema", () => {
    for (const id of ["aquarium", "bubbline", "arcade"] as const) {
      const html = render(id);
      expect(count(html, /aria-pressed="true"/g), id).toBe(1);
      const active = themeById(id);
      const btn = html.slice(html.lastIndexOf("<button", html.indexOf('aria-pressed="true"')), html.indexOf("</button>", html.indexOf('aria-pressed="true"')));
      expect(btn).toContain(active.activeClass);
      expect(btn).toContain(`title="${esc(active.label)}"`);
    }
  });
});
