// "Eu contra N bots": em vez de rodar no navegador, é uma sala comum do room
// server (como o Modo Teste da Fodinha) — o dono da sala só manda, logo que
// ela nasce, as mesmas mensagens que mandaria na mão: escolher a cor, trazer
// os bots e começar. Assim o servidor joga pelos bots e, se o servidor de jogo cair,
// a pessoa percebe na hora (a sala não conecta).

import { COLORS, LudoColor } from "./board";
import type { BotLevel } from "./engine";
import type { LudoClientMessage } from "./protocol";

export interface BotsSetup {
  bots: number;
  level: BotLevel;
  color: LudoColor;
}

/** Cores dos bots: a oposta à do jogador primeiro (como no tabuleiro físico), depois as vizinhas. */
export function botColors(mine: LudoColor, count: number): LudoColor[] {
  const i = COLORS.indexOf(mine);
  return [COLORS[(i + 2) % 4], COLORS[(i + 1) % 4], COLORS[(i + 3) % 4]].slice(0, count);
}

export function botsSetupMessages({ bots, level, color }: BotsSetup): LudoClientMessage[] {
  return [
    { type: "set_color", color },
    ...botColors(color, bots).map((c): LudoClientMessage => ({ type: "add_bot", level, color: c })),
    { type: "start" },
  ];
}

/** Lê ?bots=&level=&color= da URL da sala; sem `bots` não é uma sala "contra bots". */
export function parseBotsSetup(params: { bots?: string; level?: string; color?: string }): BotsSetup | undefined {
  if (params.bots === undefined) return undefined;
  const bots = Math.min(3, Math.max(1, Number.parseInt(params.bots, 10) || 3));
  const level: BotLevel = params.level === "easy" || params.level === "hard" ? params.level : "medium";
  const color: LudoColor = COLORS.includes(params.color as LudoColor) ? (params.color as LudoColor) : "red";
  return { bots, level, color };
}
