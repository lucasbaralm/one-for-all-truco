import { beforeEach, describe, expect, it, vi } from "vitest";
import { CallEngine, CallPeer } from "./engine";
import type { CallSignal } from "./signaling";

// O aperto de mão da videochamada entre motores de verdade, ligados por uma "sala" de mentira (as mensagens
// chegam na ordem, como no WebSocket) e conexões WebRTC de mentira que só anotam o que receberam.

class FakeStream {
  constructor(private tracks: FakeTrack[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
}
class FakeTrack {
  contentHint = "";
  constructor(public kind: "audio" | "video", public id = `${kind}-${Math.random()}`) {}
}

let pcCount = 0;
class FakePC {
  static all: FakePC[] = [];
  id = ++pcCount;
  signalingState = "stable";
  connectionState = "new";
  remoteDescription: { type: string; sdp: string } | null = null;
  localDescription: { type: string; sdp: string } | null = null;
  senders: { track: FakeTrack; params: { encodings?: { maxBitrate?: number }[] }; getParameters: () => unknown; setParameters: (p: unknown) => Promise<void> }[] = [];
  transceivers: { kind: string; direction: string }[] = [];
  addedIce: unknown[] = [];
  closed = false;
  onicecandidate: ((e: { candidate: { toJSON: () => unknown } | null }) => void) | null = null;
  ontrack: ((e: { streams: FakeStream[]; track: FakeTrack }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  failNextOffer = false;
  constructor(public config: unknown) {
    FakePC.all.push(this);
  }
  addTrack(track: FakeTrack) {
    const params: { encodings?: { maxBitrate?: number }[] } = {};
    const sender = { track, params, getParameters: () => params, setParameters: async (p: unknown) => void Object.assign(params, p) };
    this.senders.push(sender);
    return sender;
  }
  addTransceiver(kind: string, init: { direction: string }) {
    this.transceivers.push({ kind, direction: init.direction });
  }
  getSenders() {
    return this.senders;
  }
  async createOffer(opts?: { iceRestart?: boolean }) {
    if (this.failNextOffer) throw new Error("sem oferta");
    return { type: "offer", sdp: `offer#${this.id}${opts?.iceRestart ? "-restart" : ""}` };
  }
  async createAnswer() {
    return { type: "answer", sdp: `answer#${this.id}` };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d;
    this.signalingState = d.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
    this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable";
  }
  async addIceCandidate(c: unknown) {
    if (!this.remoteDescription) throw new Error("sem descrição remota");
    this.addedIce.push(c);
  }
  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
  setState(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

interface Sent {
  from: string;
  to: string;
  signal: CallSignal;
}

function makeRoom(ids: string[]) {
  const sent: Sent[] = [];
  const queue: Sent[] = [];
  const peers: Record<string, Record<string, CallPeer>> = {};
  const engines: Record<string, CallEngine> = {};
  for (const id of ids) {
    engines[id] = new CallEngine({
      me: () => id,
      send: (to, signal) => {
        sent.push({ from: id, to, signal });
        queue.push({ from: id, to, signal });
      },
      onPeers: (p) => (peers[id] = p),
      connect: (config) => new FakePC(config) as unknown as RTCPeerConnection,
    });
    peers[id] = {};
  }
  const flush = async () => {
    for (let guard = 0; queue.length > 0 && guard < 500; guard++) {
      const m = queue.shift()!;
      await engines[m.to]?.handle(m.from, m.signal);
    }
  };
  const kinds = (from?: string, to?: string) => sent.filter((m) => (!from || m.from === from) && (!to || m.to === to)).map((m) => m.signal.kind);
  const pcsOf = (id: string) => FakePC.all.filter((pc) => (pc.config as { owner?: string }).owner === id);
  return { engines, sent, peers, flush, kinds, pcsOf };
}

/** Os PCs de cada motor, na ordem em que foram criados (o motor `id` é o dono de `pcs[id]`). */
function owned(engine: CallEngine) {
  return (engine as unknown as { pcs: Map<string, FakePC> }).pcs;
}

const media = () => new FakeStream([new FakeTrack("audio"), new FakeTrack("video")]) as unknown as MediaStream;

beforeEach(() => {
  FakePC.all = [];
  pcCount = 0;
  vi.stubGlobal("MediaStream", FakeStream);
});

describe("quem entra primeiro, quem entra depois", () => {
  it("o de menor id oferece (A entra primeiro): uma oferta, uma resposta, tudo estável", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]); // B ainda não está na chamada: o hello se perde
    await r.flush();
    expect(r.engines.A.joined).toBe(true);
    r.engines.B.join(["A"]);
    await r.flush();

    expect(r.kinds("B", "A")).toContain("hello");
    expect(r.sent.filter((m) => m.signal.kind === "offer")).toHaveLength(1);
    expect(r.sent.find((m) => m.signal.kind === "offer")!.from).toBe("A");
    expect(r.sent.filter((m) => m.signal.kind === "answer")).toHaveLength(1);
    const pcA = owned(r.engines.A).get("B")!;
    const pcB = owned(r.engines.B).get("A")!;
    expect(pcA.signalingState).toBe("stable");
    expect(pcB.signalingState).toBe("stable");
    expect(pcA.remoteDescription?.type).toBe("answer");
    expect(pcB.remoteDescription?.type).toBe("offer");
    expect(r.peers.A.B.link).toBe("connecting");
    expect(r.peers.B.A.link).toBe("connecting");
  });

  it("o de menor id oferece também quando ele entra DEPOIS", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    r.engines.A.join(["B"]);
    await r.flush();
    const offers = r.sent.filter((m) => m.signal.kind === "offer");
    expect(offers).toHaveLength(1);
    expect(offers[0].from).toBe("A");
    expect(owned(r.engines.B).get("A")!.signalingState).toBe("stable");
  });

  it("os dois entram ao mesmo tempo: ainda é UMA oferta e uma conexão de cada lado", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    expect(r.sent.filter((m) => m.signal.kind === "offer")).toHaveLength(1);
    expect(r.sent.filter((m) => m.signal.kind === "answer")).toHaveLength(1);
    expect(FakePC.all).toHaveLength(2);
    expect(FakePC.all.every((pc) => !pc.closed)).toBe(true);
  });

  it("três pessoas: uma conexão por par (3 no total), cada uma com UMA oferta", async () => {
    const r = makeRoom(["A", "B", "C"]);
    r.engines.A.join(["B", "C"]);
    r.engines.B.join(["A", "C"]);
    r.engines.C.join(["A", "B"]);
    await r.flush();
    expect(FakePC.all).toHaveLength(6); // 2 pontas × 3 pares
    expect(r.sent.filter((m) => m.signal.kind === "offer")).toHaveLength(3);
    expect(new Set(r.sent.filter((m) => m.signal.kind === "offer").map((m) => `${m.from}>${m.to}`))).toEqual(new Set(["A>B", "A>C", "B>C"]));
    for (const id of ["A", "B", "C"]) expect([...owned(r.engines[id]).values()].every((pc) => pc.signalingState === "stable")).toBe(true);
  });

  it("não responde a quem ainda não entrou na chamada", async () => {
    const r = makeRoom(["A", "B"]);
    await r.engines.A.handle("B", { kind: "hello" });
    await r.engines.A.handle("B", { kind: "offer", sdp: "x" });
    expect(r.sent).toEqual([]);
    expect(FakePC.all).toEqual([]);
  });

  it("ignora sinal que diz ser de si mesmo", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join([]);
    await r.engines.A.handle("A", { kind: "hello" });
    expect(FakePC.all).toEqual([]);
  });
});

describe("candidatos ICE", () => {
  it("o que chega antes da descrição remota espera e entra depois", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.B.join([]);
    const cand = { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0 };
    await r.engines.B.handle("A", { kind: "ice", candidate: cand }); // antes da oferta
    expect(FakePC.all).toHaveLength(0);
    await r.engines.B.handle("A", { kind: "hello", reply: true }); // cria a conexão
    expect(owned(r.engines.B).get("A")!.addedIce).toEqual([]);
    await r.engines.B.handle("A", { kind: "offer", sdp: "v=0" });
    expect(owned(r.engines.B).get("A")!.addedIce).toEqual([cand]);
    await r.engines.B.handle("A", { kind: "ice", candidate: { candidate: "candidate:2" } }); // depois: entra direto
    expect(owned(r.engines.B).get("A")!.addedIce).toHaveLength(2);
  });

  it("os candidatos locais saem pela sinalização, para a pessoa certa", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const pc = owned(r.engines.A).get("B")!;
    pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "candidate:9" }) } });
    pc.onicecandidate?.({ candidate: null }); // fim dos candidatos: não vai pra rede
    expect(r.sent.filter((m) => m.signal.kind === "ice")).toEqual([{ from: "A", to: "B", signal: { kind: "ice", candidate: { candidate: "candidate:9" } } }]);
  });
});

describe("reentrar, sair e sumir", () => {
  it("quem recarrega a página manda hello de novo: a conexão velha é fechada e refeita", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const oldPc = owned(r.engines.A).get("B")!;
    // B recarregou: motor novo, mesma identidade
    const sentBefore = r.sent.length;
    const fresh = new CallEngine({ me: () => "B", send: (to, signal) => (r.sent.push({ from: "B", to, signal }), void 0), onPeers: () => undefined, connect: (c) => new FakePC(c) as unknown as RTCPeerConnection });
    fresh.join(["A"]);
    const hello = r.sent.slice(sentBefore).find((m) => m.signal.kind === "hello")!;
    await r.engines.A.handle("B", hello.signal);
    expect(oldPc.closed).toBe(true);
    const newPc = owned(r.engines.A).get("B")!;
    expect(newPc).not.toBe(oldPc);
    expect(newPc.closed).toBe(false);
    // A (menor id) oferece de novo, e o motor novo de B aceita
    const again = r.sent.slice(sentBefore).filter((m) => m.from === "A" && m.signal.kind === "offer");
    expect(again).toHaveLength(1);
    await fresh.handle("A", { kind: "hello", reply: true });
    await fresh.handle("A", again[0].signal);
    expect(owned(fresh).get("A")!.signalingState).toBe("stable");
  });

  it("bye fecha a conexão e tira a pessoa da lista", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const pcA = owned(r.engines.A).get("B")!;
    r.engines.B.leave(["A"]);
    await r.flush();
    expect(r.engines.B.joined).toBe(false);
    expect(owned(r.engines.B).size).toBe(0);
    expect(pcA.closed).toBe(true);
    expect(owned(r.engines.A).size).toBe(0);
    expect(r.peers.A).toEqual({});
    expect(r.peers.B).toEqual({});
  });

  it("sair avisa também quem não chegou a ter conexão, e sair sem ter entrado não faz nada", async () => {
    const r = makeRoom(["A", "B", "C"]);
    r.engines.A.leave(["B"]);
    expect(r.sent).toEqual([]);
    r.engines.A.join(["B", "C"]);
    r.sent.length = 0;
    r.engines.A.leave(["B", "C"]);
    expect(r.sent.map((m) => `${m.to}:${m.signal.kind}`).sort()).toEqual(["B:bye", "C:bye"]);
  });

  it("quem sai da mesa perde a conexão (syncPeers)", async () => {
    const r = makeRoom(["A", "B", "C"]);
    r.engines.A.join(["B", "C"]);
    r.engines.B.join(["A", "C"]);
    r.engines.C.join(["A", "B"]);
    await r.flush();
    const toC = owned(r.engines.A).get("C")!;
    r.engines.A.syncPeers(["B"]);
    expect(toC.closed).toBe(true);
    expect([...owned(r.engines.A).keys()]).toEqual(["B"]);
    expect(Object.keys(r.peers.A)).toEqual(["B"]);
    r.engines.A.syncPeers(["B"]); // repetir não muda nada
    expect(Object.keys(r.peers.A)).toEqual(["B"]);
  });
});

describe("o que cada um manda e recebe", () => {
  it("sem câmera: só recebe (duas pontas recvonly); com câmera: manda áudio e vídeo", async () => {
    const viewer = makeRoom(["A", "B"]);
    viewer.engines.B.join(["A"]);
    await viewer.engines.B.handle("A", { kind: "hello" });
    const lone = owned(viewer.engines.B).get("A")!;
    expect(lone.senders).toHaveLength(0);
    expect(lone.transceivers).toEqual([{ kind: "audio", direction: "recvonly" }, { kind: "video", direction: "recvonly" }]);

    const caster = makeRoom(["A", "B"]);
    const stream = media();
    caster.engines.B.setLocal(stream);
    caster.engines.B.join(["A"]);
    await caster.engines.B.handle("A", { kind: "hello" });
    const pc = owned(caster.engines.B).get("A")!;
    expect(pc.senders.map((s) => s.track.kind)).toEqual(["audio", "video"]);
    expect(pc.transceivers).toEqual([]);
    expect((stream.getVideoTracks()[0] as unknown as FakeTrack).contentHint).toBe("motion");
  });

  it("o vídeo que chega vira o `stream` da pessoa; evento de conexão velha é ignorado", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const pc = owned(r.engines.A).get("B")!;
    const remote = new FakeStream();
    const video = new FakeTrack("video", "v1");
    pc.ontrack?.({ streams: [remote], track: video });
    expect(r.peers.A.B.stream).toBe(remote);
    expect(remote.getTracks()).toContain(video);
    // sem stream no evento: o motor junta as trilhas num stream só
    const bare = new FakeTrack("audio", "a1");
    pc.ontrack?.({ streams: [], track: bare });
    pc.ontrack?.({ streams: [], track: new FakeTrack("video", "v2") });
    expect(r.peers.A.B.stream!.getTracks().length).toBeGreaterThanOrEqual(2);
    // depois de fechada, a conexão não mexe mais no estado
    r.engines.A.syncPeers([]);
    const peersAfter = r.peers.A;
    pc.ontrack?.({ streams: [new FakeStream()], track: new FakeTrack("video", "v3") });
    expect(r.peers.A).toBe(peersAfter);
  });

  it("microfone e câmera: o aviso chega no hello e a cada mudança", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    r.engines.A.setMedia(false, true);
    await r.flush();
    expect(r.peers.B.A.mic).toBe(false);
    expect(r.peers.B.A.cam).toBe(true);
    r.engines.A.setMedia(false, false);
    await r.flush();
    expect(r.peers.B.A.cam).toBe(false);
    const n = r.sent.length;
    r.engines.A.setMedia(false, false); // sem mudança: não repete
    expect(r.sent.length).toBe(n);
  });
});

describe("qualidade e queda", () => {
  it("ao conectar, o vídeo sai com o teto do papel; o mimer sobe a qualidade", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.setLocal(media());
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const pc = owned(r.engines.A).get("B")!;
    pc.setState("connected");
    expect(r.peers.A.B.link).toBe("connected");
    const video = pc.senders.find((s) => s.track.kind === "video")!;
    expect(video.params.encodings![0].maxBitrate).toBe(300_000);
    r.engines.A.setQuality(true);
    expect(video.params.encodings![0].maxBitrate).toBe(1_200_000);
    r.engines.A.setQuality(false);
    expect(video.params.encodings![0].maxBitrate).toBe(300_000);
    expect(pc.senders.find((s) => s.track.kind === "audio")!.params.encodings).toBeUndefined();
  });

  it("o orçamento de upload é repartido de novo quando a mesa enche ou esvazia (não só quando cada conexão nasce)", async () => {
    const ids = ["A", "B", "C", "D", "E", "F"];
    const r = makeRoom(ids);
    r.engines.A.setLocal(media());
    for (const id of ids) r.engines[id].join(ids.filter((x) => x !== id));
    await r.flush();
    const maxOf = (peer: string) => owned(r.engines.A).get(peer)!.senders.find((s) => s.track.kind === "video")!.params.encodings?.[0].maxBitrate;
    const peers = ids.slice(1);
    // as conexões ficam prontas uma a uma: a cada nova, TODAS passam a usar o teto da divisão atual
    // (900 kbps ÷ nº de conexões prontas é o que vale quando só as prontas contam; com 5 conexões de pé a divisão é por 5)
    for (const p of peers) owned(r.engines.A).get(p)!.setState("connected");
    expect(peers.map(maxOf)).toEqual(peers.map(() => 180_000));
    // alguém sai: as 4 que sobraram sobem pra 225 kbps
    r.engines.A.syncPeers(["B", "C", "D", "E"]);
    expect(["B", "C", "D", "E"].map(maxOf)).toEqual([225_000, 225_000, 225_000, 225_000]);
    // e quem faz a mímica (qualidade alta) divide 4 Mbps
    r.engines.A.setQuality(true);
    expect(["B", "C", "D", "E"].map(maxOf)).toEqual([1_000_000, 1_000_000, 1_000_000, 1_000_000]);
  });

  it("conexão que falha: o lado que oferece tenta outro caminho, o outro só espera", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const before = r.sent.filter((m) => m.signal.kind === "offer").length;
    owned(r.engines.B).get("A")!.setState("failed");
    await r.flush();
    expect(r.peers.B.A.link).toBe("failed");
    expect(r.sent.filter((m) => m.signal.kind === "offer")).toHaveLength(before); // B não oferece
    owned(r.engines.A).get("B")!.setState("failed");
    await new Promise((resolve) => setTimeout(resolve, 0)); // a oferta de reinício é assíncrona
    await r.flush();
    const offers = r.sent.filter((m) => m.signal.kind === "offer");
    expect(offers).toHaveLength(before + 1);
    expect((offers.at(-1)!.signal as { sdp: string }).sdp).toMatch(/restart/);
  });

  it("oferta que não sai marca a pessoa como com problema", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    const orig = FakePC.prototype.createOffer;
    FakePC.prototype.createOffer = async () => {
      throw new Error("boom");
    };
    try {
      r.engines.B.join(["A"]);
      await r.flush();
    } finally {
      FakePC.prototype.createOffer = orig;
    }
    expect(r.peers.A.B.link).toBe("failed");
  });

  it("duas ofertas cruzadas: quem oferece por regra mantém a sua e não responde", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const pcA = owned(r.engines.A).get("B")!;
    pcA.signalingState = "have-local-offer"; // A acabou de oferecer de novo
    const answersBefore = r.sent.filter((m) => m.from === "A" && m.signal.kind === "answer").length;
    await r.engines.A.handle("B", { kind: "offer", sdp: "oferta-do-B" });
    expect(r.sent.filter((m) => m.from === "A" && m.signal.kind === "answer")).toHaveLength(answersBefore);
    expect(pcA.remoteDescription?.sdp).not.toBe("oferta-do-B");
  });

  it("dispose fecha tudo sem avisar", async () => {
    const r = makeRoom(["A", "B"]);
    r.engines.A.join(["B"]);
    r.engines.B.join(["A"]);
    await r.flush();
    const n = r.sent.length;
    r.engines.A.dispose();
    expect(r.sent.length).toBe(n);
    expect(FakePC.all.filter((pc) => !pc.closed)).toHaveLength(1); // só a ponta do B segue aberta
    expect(r.engines.A.joined).toBe(false);
  });
});
