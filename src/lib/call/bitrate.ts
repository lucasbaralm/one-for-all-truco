// Quanto vídeo cada pessoa manda. A chamada é uma malha (cada um manda o seu vídeo pra TODOS os outros), então
// o upload de quem manda cresce com o tamanho da mesa. O que importa pro jogo é ver a mímica: quem faz a mímica
// manda em qualidade maior, os outros mandam só um "retratinho" pra galera se ver.

/** Quanto de upload (bits/s, no total) cada papel reparte entre as conexões. */
const BUDGET = { mimer: 4_000_000, other: 900_000 } as const;
/** Limites por conexão (bits/s). */
const LIMITS = { mimer: { min: 250_000, max: 1_200_000 }, other: { min: 60_000, max: 300_000 } } as const;

/** Teto do vídeo (bits/s) pra cada uma das `outgoing` conexões que EU mantenho. */
export function videoBitrate(highQuality: boolean, outgoing: number): number {
  const role = highQuality ? "mimer" : "other";
  const per = Math.floor(BUDGET[role] / Math.max(1, outgoing));
  return Math.min(LIMITS[role].max, Math.max(LIMITS[role].min, per));
}

/** Resolução e quadros por segundo pedidos à câmera (a mímica pede movimento, não nitidez). */
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: "user",
};

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
