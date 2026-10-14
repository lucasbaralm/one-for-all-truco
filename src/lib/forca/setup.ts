// "Eu contra N bots" na Forca: uma sala comum do room server. O dono manda, logo
// que ela nasce, as mesmas mensagens que mandaria na mão: palavras, bots e começar.

import { DEFAULT_ROUNDS, MAX_PLAYERS, ROUND_CHOICES } from "./engine";
import type { BotLevel } from "./engine";
import type { ForcaClientMessage } from "./protocol";

export interface BotsSetup {
  bots: number;
  level: BotLevel;
  rounds: number;
}

export const MAX_BOTS = MAX_PLAYERS - 1;

export function botsSetupMessages({ bots, level, rounds }: BotsSetup): ForcaClientMessage[] {
  return [{ type: "set_rounds", rounds }, ...Array.from({ length: bots }, (): ForcaClientMessage => ({ type: "add_bot", level })), { type: "start" }];
}

/** Lê ?bots=&level=&rounds= da URL da sala; sem `bots` não é uma sala "contra bots". */
export function parseBotsSetup(params: { bots?: string; level?: string; rounds?: string }): BotsSetup | undefined {
  if (params.bots === undefined) return undefined;
  const bots = Math.min(MAX_BOTS, Math.max(1, Number.parseInt(params.bots, 10) || 3));
  const level: BotLevel = params.level === "easy" || params.level === "hard" ? params.level : "medium";
  const asked = Number.parseInt(params.rounds ?? "", 10);
  const rounds = (ROUND_CHOICES as readonly number[]).includes(asked) ? asked : DEFAULT_ROUNDS;
  return { bots, level, rounds };
}
