import { describe, expect, it } from "vitest";
import { isOfferer, parseRtcMessage, parseSignal } from "./signaling";

describe("isOfferer", () => {
  it("num par, só UM lado oferece (o de menor id), igual nos dois pontos de vista", () => {
    expect(isOfferer("Ana", "Bia")).toBe(true);
    expect(isOfferer("Bia", "Ana")).toBe(false);
    for (const [a, b] of [["a", "b"], ["Zé", "Ana"], ["x1", "x10"], ["Maria", "maria"]]) expect(isOfferer(a, b)).not.toBe(isOfferer(b, a));
  });
  it("ninguém oferece pra si mesmo", () => {
    expect(isOfferer("Ana", "Ana")).toBe(false);
  });
});

describe("parseSignal", () => {
  it("hello, com e sem resposta", () => {
    expect(parseSignal({ kind: "hello" })).toEqual({ kind: "hello" });
    expect(parseSignal({ kind: "hello", reply: true })).toEqual({ kind: "hello", reply: true });
    expect(parseSignal({ kind: "hello", reply: "sim" })).toEqual({ kind: "hello" });
    expect(parseSignal({ kind: "bye", lixo: 1 })).toEqual({ kind: "bye" });
  });

  it("offer e answer exigem SDP de texto, não vazio e de tamanho razoável", () => {
    expect(parseSignal({ kind: "offer", sdp: "v=0" })).toEqual({ kind: "offer", sdp: "v=0" });
    expect(parseSignal({ kind: "answer", sdp: "v=0", extra: true })).toEqual({ kind: "answer", sdp: "v=0" });
    expect(parseSignal({ kind: "offer", sdp: "" })).toBeNull();
    expect(parseSignal({ kind: "offer", sdp: 3 })).toBeNull();
    expect(parseSignal({ kind: "offer" })).toBeNull();
    expect(parseSignal({ kind: "offer", sdp: "x".repeat(20_001) })).toBeNull();
  });

  it("media exige dois booleanos", () => {
    expect(parseSignal({ kind: "media", mic: true, cam: false })).toEqual({ kind: "media", mic: true, cam: false });
    expect(parseSignal({ kind: "media", mic: "sim", cam: false })).toBeNull();
    expect(parseSignal({ kind: "media", mic: true })).toBeNull();
  });

  it("ice guarda só os campos conhecidos do candidato", () => {
    const raw = { kind: "ice", candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "abc", perigo: "x" } };
    expect(parseSignal(raw)).toEqual({
      kind: "ice",
      candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "abc" },
    });
    expect(parseSignal({ kind: "ice", candidate: { candidate: "c", sdpMid: null, sdpMLineIndex: null } })).toEqual({ kind: "ice", candidate: { candidate: "c", sdpMid: null, sdpMLineIndex: null } });
    expect(parseSignal({ kind: "ice", candidate: { candidate: "c", sdpMid: 5 } })).toEqual({ kind: "ice", candidate: { candidate: "c" } });
    expect(parseSignal({ kind: "ice", candidate: "c" })).toBeNull();
    expect(parseSignal({ kind: "ice", candidate: { candidate: "x".repeat(2001) } })).toBeNull();
    expect(parseSignal({ kind: "ice" })).toBeNull();
  });

  it("rejeita o que não é sinal", () => {
    for (const bad of [null, undefined, 7, "hello", [], {}, { kind: 3 }, { kind: "formatar" }]) expect(parseSignal(bad)).toBeNull();
  });
});

describe("parseRtcMessage", () => {
  it("lê a mensagem inteira do servidor", () => {
    expect(parseRtcMessage({ type: "rtc", from: "Ana", signal: { kind: "hello" } })).toEqual({ type: "rtc", from: "Ana", signal: { kind: "hello" } });
  });
  it("sem remetente, com outro tipo ou com sinal ruim, não vale", () => {
    expect(parseRtcMessage({ type: "rtc", signal: { kind: "hello" } })).toBeNull();
    expect(parseRtcMessage({ type: "rtc", from: "", signal: { kind: "hello" } })).toBeNull();
    expect(parseRtcMessage({ type: "state", from: "Ana", signal: { kind: "hello" } })).toBeNull();
    expect(parseRtcMessage({ type: "rtc", from: "Ana", signal: { kind: "ice" } })).toBeNull();
    expect(parseRtcMessage(null)).toBeNull();
  });
});
