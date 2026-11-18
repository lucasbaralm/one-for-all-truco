// "Eu contra N bots": uma sala comum do room server (como no Uno). O dono manda, logo que ela nasce,
// as mesmas mensagens que mandaria na mão: bots, duração e começar.

import { BotLevel, LIMIT_OPTIONS, MAX_PLAYERS } from "./engine";
import type { MonoClientMessage } from "./protocol";

export interface BotsSetup {
  bots: number;
  level: BotLevel;
  /** Rodadas (0 = até a falência). */
  limit: number;
}

export const MAX_BOTS = MAX_PLAYERS - 1;

export function botsSetupMessages({ bots, level, limit }: BotsSetup): MonoClientMessage[] {
  return [
    ...Array.from({ length: bots }, (): MonoClientMessage => ({ type: "add_bot", level })),
    ...(limit > 0 ? [{ type: "set_limit", limit } as MonoClientMessage] : []),
    { type: "start" },
  ];
}

/** Lê ?bots=&level=&limit= da URL da sala; sem `bots` não é uma sala "contra bots". */
export function parseBotsSetup(params: { bots?: string; level?: string; limit?: string }): BotsSetup | undefined {
  if (params.bots === undefined) return undefined;
  const bots = Math.min(MAX_BOTS, Math.max(1, Number.parseInt(params.bots, 10) || 3));
  const level: BotLevel = params.level === "easy" || params.level === "hard" ? params.level : "medium";
  const asked = Number.parseInt(params.limit ?? "", 10);
  const limit = (LIMIT_OPTIONS as readonly number[]).includes(asked) ? asked : 0;
  return { bots, level, limit };
}
