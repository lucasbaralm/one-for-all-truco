// O que escrever embaixo do avatar de uma pessoa da chamada enquanto não há vídeo dela na tela.

import type { CallPeer } from "./engine";

/** undefined = tem vídeo, não precisa de legenda. `peer` undefined = a pessoa não está na chamada. */
export function peerCaption(peer: CallPeer | undefined): string | undefined {
  if (!peer) return "fora da chamada";
  if (peer.link === "failed") return "sem conexão";
  if (peer.cam === false) return "câmera desligada";
  if (peer.stream) return undefined;
  // Conectou mas nada de vídeo chegou: quem entrou só assistindo (sem câmera ou com ela bloqueada).
  return peer.link === "connected" ? "só assiste" : "conectando…";
}
