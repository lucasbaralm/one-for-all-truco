import type { BotLevel } from "./engine";

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

export const MODE_LABEL = { tower: "Torre", well: "Poço" } as const;

export const MODE_BLURB = {
  tower: "O vencedor leva a carta do centro. Acabou o centro: vence quem tem a maior pilha.",
  well: "O vencedor joga a própria carta no centro. Quem esvaziar o monte primeiro vence.",
} as const;

/** "1 carta" / "7 cartas" (Torre) · "falta 1" / "faltam 7" (Poço). */
export const cardsLabel = (n: number, mode: "tower" | "well") =>
  mode === "tower" ? `${n} ${n === 1 ? "carta" : "cartas"}` : `${n === 1 ? "falta" : "faltam"} ${n}`;
