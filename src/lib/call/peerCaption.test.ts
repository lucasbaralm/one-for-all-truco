import { describe, expect, it } from "vitest";
import type { CallPeer } from "./engine";
import { peerCaption } from "./peerCaption";

const peer = (over: Partial<CallPeer> = {}): CallPeer => ({ id: "x", stream: null, mic: true, cam: true, link: "connecting", ...over });
const stream = {} as MediaStream;

describe("peerCaption", () => {
  it("quem não está na chamada", () => expect(peerCaption(undefined)).toBe("fora da chamada"));
  it("conexão que caiu vem antes de tudo", () => expect(peerCaption(peer({ link: "failed", stream, cam: false }))).toBe("sem conexão"));
  it("câmera desligada (ou ausente, avisada pelo próprio) vira legenda mesmo com o stream", () => expect(peerCaption(peer({ cam: false, stream, link: "connected" }))).toBe("câmera desligada"));
  it("com vídeo chegando não tem legenda", () => expect(peerCaption(peer({ stream, link: "connected" }))).toBeUndefined());
  it("ainda negociando: conectando; já conectada e sem vídeo: só assiste", () => {
    expect(peerCaption(peer())).toBe("conectando…");
    expect(peerCaption(peer({ link: "connected" }))).toBe("só assiste");
  });
});
