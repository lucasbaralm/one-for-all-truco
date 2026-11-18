// O que a TELA sabe de cada edição (as regras e os dados ficam em src/lib/monopoly/editions): o nome
// da rota, o servidor de sala e as cores do tabuleiro.

import type { EditionId } from "@/lib/monopoly/editions";

export interface EditionUI {
  id: EditionId;
  /** Segmento da URL do lobby/partida e nome do servidor de sala (/parties/<party>/<sala>). */
  slug: "monopoly" | "banco";
  party: "monopoly" | "banco";
  title: string;
  tagline: string;
  /** Cor de fundo das casas e do miolo do tabuleiro. */
  cell: string;
  /** Linhas do tabuleiro. */
  line: string;
  /** Miolo (centro) do tabuleiro. */
  center: string;
  /** Texto escuro por cima do papel do tabuleiro. */
  ink: string;
  /** Cor de destaque dos botões principais. */
  accent: string;
  accentHover: string;
  /** Cor da logo no miolo. */
  logo: string;
  /** Emoji do baralho de cartas por baralho (casa de carta no tabuleiro). */
  deckIcon: { chance: string; chest: string };
  /** Cor do verso de cada baralho. */
  deckColor: { chance: string; chest: string };
}

export const EDITION_UI: Record<EditionId, EditionUI> = {
  monopoly: {
    id: "monopoly",
    slug: "monopoly",
    party: "monopoly",
    title: "Monopoly",
    tagline: "Compre ruas, construa casas e hotéis e leve os amigos à falência.",
    cell: "#dcebd8",
    line: "#1f3b2b",
    center: "#c9e3cd",
    ink: "#12261b",
    accent: "bg-red-600 hover:bg-red-700",
    accentHover: "hover:bg-red-700",
    logo: "#d1242b",
    deckIcon: { chance: "❓", chest: "📦" },
    deckColor: { chance: "#f59e32", chest: "#3b82c4" },
  },
  banco: {
    id: "banco",
    slug: "banco",
    party: "banco",
    title: "Banco Imobiliário",
    tagline: "O clássico brasileiro: bairros, companhias e o Sorte ou Revés.",
    cell: "#f1f2cf",
    line: "#2b4a1f",
    center: "#d7e8b4",
    ink: "#1d2f12",
    accent: "bg-emerald-600 hover:bg-emerald-700",
    accentHover: "hover:bg-emerald-700",
    logo: "#0f7a3d",
    deckIcon: { chance: "🍀", chest: "🍀" },
    deckColor: { chance: "#16a34a", chest: "#16a34a" },
  },
};

export const lobbyHref = (e: EditionId) => `/lobby/${EDITION_UI[e].slug}`;
export const roomHref = (e: EditionId, code: string) => `/${EDITION_UI[e].slug}/${code}`;
