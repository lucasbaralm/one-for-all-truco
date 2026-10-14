import type { BotLevel } from "./engine";

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = { easy: "Fácil", medium: "Médio", hard: "Difícil" };

export const ROUNDS_LABEL = (n: number) => `${n} palavras`;
