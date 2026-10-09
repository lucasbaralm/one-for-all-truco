import type { LudoColor } from "@/lib/ludo/board";

export interface ColorTokens {
  main: string;
  light: string;
  dark: string;
  soft: string;
  /** Texto legível em cima de `main`. */
  ink: string;
}

export const LUDO_COLORS: Record<LudoColor, ColorTokens> = {
  red: { main: "#ef4444", light: "#fca5a5", dark: "#991b1b", soft: "#fee2e2", ink: "#ffffff" },
  green: { main: "#22c55e", light: "#86efac", dark: "#15803d", soft: "#dcfce7", ink: "#052e16" },
  blue: { main: "#3b82f6", light: "#93c5fd", dark: "#1d4ed8", soft: "#dbeafe", ink: "#ffffff" },
  yellow: { main: "#facc15", light: "#fde68a", dark: "#a16207", soft: "#fef9c3", ink: "#422006" },
};

/**
 * Canto da tela onde cada cor fica por padrão: 0 = cima-esquerda, 1 = cima-direita,
 * 2 = baixo-direita, 3 = baixo-esquerda (mesma ordem das cores no sentido horário).
 */
export const CORNER_AREA = ["tl", "tr", "br", "bl"] as const;
