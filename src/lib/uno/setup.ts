// "Eu contra N bots" no Uno: uma sala comum do room server (como no Ludo e no
// Dobble). O dono manda, logo que ela nasce, as mesmas mensagens que mandaria
// na mão: bots e começar.

import type { BotLevel } from "./engine";
import { MAX_PLAYERS } from "./engine";
import type { UnoClientMessage } from "./protocol";

export interface BotsSetup {
  bots: number;
  level: BotLevel;
}

export const MAX_BOTS = MAX_PLAYERS - 1;

export function botsSetupMessages({ bots, level }: BotsSetup): UnoClientMessage[] {
  return [...Array.from({ length: bots }, (): UnoClientMessage => ({ type: "add_bot", level })), { type: "start" }];
}

/** Lê ?bots=&level= da URL da sala; sem `bots` não é uma sala "contra bots". */
export function parseBotsSetup(params: { bots?: string; level?: string }): BotsSetup | undefined {
  if (params.bots === undefined) return undefined;
  const bots = Math.min(MAX_BOTS, Math.max(1, Number.parseInt(params.bots, 10) || 3));
  const level: BotLevel = params.level === "easy" || params.level === "hard" ? params.level : "medium";
  return { bots, level };
}
