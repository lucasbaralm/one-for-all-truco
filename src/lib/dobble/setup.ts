// "Eu contra N bots" no Dobble: uma sala comum do room server (como no Ludo e
// no Modo Teste da Fodinha). O dono manda, logo que ela nasce, as mesmas
// mensagens que mandaria na mão: modo, bots e começar.

import type { BotLevel, DobbleMode } from "./engine";
import { MAX_PLAYERS } from "./engine";
import type { DobbleClientMessage } from "./protocol";

export interface BotsSetup {
  bots: number;
  level: BotLevel;
  mode: DobbleMode;
}

export const MAX_BOTS = MAX_PLAYERS - 1;

export function botsSetupMessages({ bots, level, mode }: BotsSetup): DobbleClientMessage[] {
  return [
    { type: "set_mode", mode },
    ...Array.from({ length: bots }, (): DobbleClientMessage => ({ type: "add_bot", level })),
    { type: "start" },
  ];
}

/** Lê ?bots=&level=&mode= da URL da sala; sem `bots` não é uma sala "contra bots". */
export function parseBotsSetup(params: { bots?: string; level?: string; mode?: string }): BotsSetup | undefined {
  if (params.bots === undefined) return undefined;
  const bots = Math.min(MAX_BOTS, Math.max(1, Number.parseInt(params.bots, 10) || 3));
  const level: BotLevel = params.level === "easy" || params.level === "hard" ? params.level : "medium";
  const mode: DobbleMode = params.mode === "well" ? "well" : "tower";
  return { bots, level, mode };
}
