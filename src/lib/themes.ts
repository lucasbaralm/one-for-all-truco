// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO DE TEMAS
// ─────────────────────────────────────────────────────────────────────────────
// Fonte única de tudo que um tema define: ícone/rótulo/cor do botão (seletor),
// fundo da página e da mesa, camada escura por cima, versos das cartas e as
// bordas das cartas abertas. ThemeProvider, ThemeSelector e PlayingCard só leem
// daqui — para criar um tema novo basta soltar os arquivos em public/themes/ e
// acrescentar UMA entrada em DEFS.
//
// Os ids dos temas antigos e a chave do localStorage ("fodinha_theme") não podem
// mudar: quem já tem um tema salvo precisa reabri-lo igual.

export type ThemeGroup = "classico" | "hora-de-aventura" | "mais";

interface ThemeShape {
  readonly id: string;
  /** Nome em pt-BR (tooltip e leitores de tela). */
  readonly label: string;
  /** Emoji do botão no seletor. */
  readonly icon: string;
  /** Classes Tailwind do botão quando o tema está ativo (literais, para o Tailwind enxergá-las). */
  readonly activeClass: string;
  /** Imagem de fundo da página — e da mesa, recortada em círculo. */
  readonly bg: string;
  /** Camada escura por cima do fundo, para o jogo continuar legível. */
  readonly overlay: `bg-black/${number}`;
  /** Versos de carta; a carta N da mão usa cardBacks[N % cardBacks.length]. */
  readonly cardBacks: readonly string[];
  /** Bordas da carta aberta: [naipe vermelho, naipe preto]. */
  readonly cardBorders: readonly [string, string];
  readonly group: ThemeGroup;
}

const DEFS = [
  // ── Clássicos ──────────────────────────────────────────────────────────────
  {
    id: "aquarium",
    label: "Aquário",
    icon: "🐠",
    activeClass: "bg-cyan-600 hover:bg-cyan-700",
    bg: "/themes/bg_aquarium.jpg",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_aquarium.jpg"],
    cardBorders: ["border-red-400", "border-cyan-400"],
    group: "classico",
  },
  {
    id: "candy",
    label: "Doces",
    icon: "🍬",
    activeClass: "bg-pink-600 hover:bg-pink-700",
    bg: "/themes/bg_candy.jpg",
    overlay: "bg-black/50",
    cardBacks: ["/themes/card_back_candy.jpg"],
    cardBorders: ["border-pink-400", "border-purple-400"],
    group: "classico",
  },
  {
    id: "adventure",
    label: "Aventura",
    icon: "⚔️",
    activeClass: "bg-green-600 hover:bg-green-700",
    bg: "/themes/bg_adventure.jpg",
    overlay: "bg-black/65",
    cardBacks: ["/themes/card_back_adventure.jpg"],
    cardBorders: ["border-orange-400", "border-green-500"],
    group: "classico",
  },
  {
    id: "pedro",
    label: "Pedro",
    icon: "🎭",
    activeClass: "bg-yellow-600 hover:bg-yellow-700",
    bg: "/themes/bg_pedro.jpg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_pedro.png"],
    cardBorders: ["border-yellow-400", "border-zinc-400"],
    group: "classico",
  },
  {
    id: "lotr",
    label: "Anéis",
    icon: "💍",
    activeClass: "bg-amber-700 hover:bg-amber-800",
    bg: "/themes/bg_lotr.jpg",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_lotr.jpg"],
    cardBorders: ["border-amber-500", "border-stone-400"],
    group: "classico",
  },
  {
    id: "mpb",
    label: "MPB",
    icon: "🎸",
    activeClass: "bg-emerald-700 hover:bg-emerald-800",
    bg: "/themes/bg_mpb.jpg",
    overlay: "bg-black/50",
    cardBacks: ["/themes/card_back_mpb.jpg"],
    cardBorders: ["border-orange-600", "border-teal-600"],
    group: "classico",
  },
  {
    id: "lgbt",
    label: "Orgulho",
    icon: "🏳️‍🌈",
    activeClass: "bg-fuchsia-600 hover:bg-fuchsia-700",
    bg: "/themes/bg_lgbt.jpg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_lgbt.jpg"],
    cardBorders: ["border-rose-500", "border-indigo-500"],
    group: "classico",
  },
  {
    id: "olivia",
    label: "Olivia",
    icon: "🐕",
    activeClass: "bg-orange-600 hover:bg-orange-700",
    bg: "/themes/bg_olivia.png",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_olivia_1.png", "/themes/card_back_olivia_2.png", "/themes/card_back_olivia_3.jpg"],
    cardBorders: ["border-orange-400", "border-amber-700"],
    group: "classico",
  },
  {
    id: "gatos",
    label: "Gatos",
    icon: "🐈",
    activeClass: "bg-purple-600 hover:bg-purple-700",
    bg: "/themes/bg_gatos.jpg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_gatos_1.jpg", "/themes/card_back_gatos_2.jpg"],
    cardBorders: ["border-purple-400", "border-slate-500"],
    group: "classico",
  },
  {
    id: "mamadores",
    label: "Mamadores",
    icon: "🎉",
    activeClass: "bg-red-600 hover:bg-red-700",
    bg: "/themes/bg_mamadores.jpg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_mamadores_1.jpg", "/themes/card_back_mamadores_2.jpg"],
    cardBorders: ["border-red-400", "border-yellow-500"],
    group: "classico",
  },
  {
    id: "jessie",
    label: "Jessie",
    icon: "🌸",
    activeClass: "bg-rose-500 hover:bg-rose-600",
    bg: "/themes/bg_jessie.jpg",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_jessie_1.jpg"],
    cardBorders: ["border-rose-400", "border-pink-600"],
    group: "classico",
  },

  // ── Hora de Aventura ───────────────────────────────────────────────────────
  // (o "Doces" = Reino Doce e o "Aventura" = Huntress Wizard continuam nos clássicos)
  {
    id: "bubbline",
    label: "Bubbline",
    icon: "💗",
    activeClass: "bg-pink-500 hover:bg-pink-600",
    bg: "/themes/bg_bubbline.svg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_bubbline.svg"],
    cardBorders: ["border-pink-400", "border-purple-500"],
    group: "hora-de-aventura",
  },
  {
    id: "finnjake",
    label: "Finn & Jake",
    icon: "🐕",
    activeClass: "bg-sky-500 hover:bg-sky-600",
    bg: "/themes/bg_finnjake.svg",
    overlay: "bg-black/50",
    cardBacks: ["/themes/card_back_finnjake.svg"],
    cardBorders: ["border-yellow-400", "border-sky-500"],
    group: "hora-de-aventura",
  },
  {
    id: "bmo",
    label: "BMO",
    icon: "🎮",
    activeClass: "bg-teal-500 hover:bg-teal-600",
    bg: "/themes/bg_bmo.svg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_bmo.svg"],
    cardBorders: ["border-red-400", "border-teal-500"],
    group: "hora-de-aventura",
  },
  {
    id: "reinogelo",
    label: "Reino de Gelo",
    icon: "❄️",
    activeClass: "bg-blue-400 hover:bg-blue-500",
    bg: "/themes/bg_reinogelo.svg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_reinogelo.svg"],
    cardBorders: ["border-cyan-300", "border-blue-500"],
    group: "hora-de-aventura",
  },
  {
    id: "marceline",
    label: "Marceline",
    icon: "🎸",
    activeClass: "bg-red-800 hover:bg-red-900",
    bg: "/themes/bg_marceline.svg",
    overlay: "bg-black/50",
    cardBacks: ["/themes/card_back_marceline.svg"],
    cardBorders: ["border-red-500", "border-zinc-500"],
    group: "hora-de-aventura",
  },
  {
    id: "reinofogo",
    label: "Reino do Fogo",
    icon: "🔥",
    activeClass: "bg-orange-500 hover:bg-orange-600",
    bg: "/themes/bg_reinofogo.svg",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_reinofogo.svg"],
    cardBorders: ["border-orange-500", "border-red-700"],
    group: "hora-de-aventura",
  },

  // ── Mais temas ─────────────────────────────────────────────────────────────
  {
    id: "espaco",
    label: "Espaço",
    icon: "🚀",
    activeClass: "bg-indigo-600 hover:bg-indigo-700",
    bg: "/themes/bg_espaco.svg",
    overlay: "bg-black/50",
    cardBacks: ["/themes/card_back_espaco.svg"],
    cardBorders: ["border-fuchsia-400", "border-indigo-400"],
    group: "mais",
  },
  {
    id: "neon",
    label: "Neon",
    icon: "🌆",
    activeClass: "bg-violet-500 hover:bg-violet-600",
    bg: "/themes/bg_neon.svg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_neon.svg"],
    cardBorders: ["border-pink-500", "border-cyan-400"],
    group: "mais",
  },
  {
    id: "floresta",
    label: "Floresta",
    icon: "🌲",
    activeClass: "bg-lime-700 hover:bg-lime-800",
    bg: "/themes/bg_floresta.svg",
    overlay: "bg-black/55",
    cardBacks: ["/themes/card_back_floresta.svg"],
    cardBorders: ["border-lime-400", "border-emerald-600"],
    group: "mais",
  },
  {
    id: "praia",
    label: "Praia",
    icon: "🏖️",
    activeClass: "bg-amber-500 hover:bg-amber-600",
    bg: "/themes/bg_praia.svg",
    overlay: "bg-black/50",
    cardBacks: ["/themes/card_back_praia.svg"],
    cardBorders: ["border-orange-400", "border-sky-500"],
    group: "mais",
  },
  {
    id: "halloween",
    label: "Halloween",
    icon: "🎃",
    activeClass: "bg-orange-700 hover:bg-orange-800",
    bg: "/themes/bg_halloween.svg",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_halloween.svg"],
    cardBorders: ["border-orange-500", "border-purple-500"],
    group: "mais",
  },
  {
    id: "arcade",
    label: "Arcade",
    icon: "🕹️",
    activeClass: "bg-yellow-500 hover:bg-yellow-600",
    bg: "/themes/bg_arcade.svg",
    overlay: "bg-black/60",
    cardBacks: ["/themes/card_back_arcade.svg"],
    cardBorders: ["border-pink-500", "border-yellow-400"],
    group: "mais",
  },
] as const satisfies readonly ThemeShape[];

export type Theme = (typeof DEFS)[number]["id"];

export interface ThemeDef extends ThemeShape {
  readonly id: Theme;
}

/** Todos os temas, na ordem em que aparecem no seletor (grupo a grupo). */
export const THEMES: readonly ThemeDef[] = DEFS;

export const ALL_THEMES: readonly Theme[] = THEMES.map((t) => t.id);

export const DEFAULT_THEME: Theme = "aquarium";

/** Os grupos do seletor, na ordem de exibição. */
export const THEME_GROUPS: readonly { id: ThemeGroup; label: string }[] = [
  { id: "classico", label: "Clássicos" },
  { id: "hora-de-aventura", label: "Hora de Aventura" },
  { id: "mais", label: "Mais temas" },
];

/** O valor é o id de um tema que existe? */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && ALL_THEMES.some((id) => id === value);
}

/**
 * Tema salvo (localStorage) → tema a usar. Ausente, de um tema que não existe
 * mais ou de qualquer outro lixo: volta para o tema padrão.
 */
export function resolveTheme(saved: unknown): Theme {
  return isTheme(saved) ? saved : DEFAULT_THEME;
}

/** Definição de um tema pelo id; id desconhecido cai no tema padrão. */
export function themeById(id: string | null | undefined): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}

/** Os temas de um grupo, na ordem do registro. */
export function themesInGroup(group: ThemeGroup): ThemeDef[] {
  return THEMES.filter((t) => t.group === group);
}

/** Grupos já com seus temas, na ordem de exibição (só os que têm algum tema). */
export function groupedThemes(): { id: ThemeGroup; label: string; themes: ThemeDef[] }[] {
  return THEME_GROUPS.map((g) => ({ ...g, themes: themesInGroup(g.id) })).filter((g) => g.themes.length > 0);
}

/** Fundo de cada tema (a mesa de jogo usa a mesma imagem, recortada em círculo). */
export const THEME_BG: Record<string, string> = Object.fromEntries(THEMES.map((t) => [t.id, t.bg]));
