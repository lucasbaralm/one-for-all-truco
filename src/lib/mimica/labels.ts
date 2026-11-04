import type { SongKind } from "./catalog";

export const ROUNDS_LABEL = (n: number) => `${n} ${n === 1 ? "volta" : "voltas"}`;

/** De onde é a música (a carta tem 3 do Brasil e 1 do mundo). */
export const KIND_LABEL: Record<SongKind, string> = { br: "Nacional", world: "Internacional" };
export const KIND_ICON: Record<SongKind, string> = { br: "🇧🇷", world: "🌎" };
