// O motor da videochamada: uma conexão WebRTC por par de pessoas (malha), montada pelas mensagens de
// sinalização (signaling.ts). É TypeScript puro — sem React — pra dar pra testar o aperto de mão com
// conexões de mentira; o hook (useCall.ts) cuida da câmera, do estado e da tela.
//
// Aperto de mão de um par (eu = A, o outro = B, A tem o menor id e por isso é quem oferece):
//   quem ENTRA na chamada manda "hello" pra todos; quem já estava nela responde "hello (reply)", cria a conexão
//   com a pessoa e, se for o lado que oferece, manda a oferta. A resposta ao "hello" de resposta não existe (sem
//   ping-pong). Se os dois entram ao mesmo tempo, cada um recebe o "hello" do outro, cria a conexão UMA vez e só
//   o lado de menor id oferece (`created` garante que ninguém oferece duas vezes).
//   Quem recarrega a página manda "hello" de novo: o outro lado joga fora a conexão velha e refaz.

import { videoBitrate } from "./bitrate";
import { CallSignal, IceCandidate, isOfferer } from "./signaling";

export type PeerLink = "connecting" | "connected" | "failed";

export interface CallPeer {
  id: string;
  /** O que a pessoa está mandando (vídeo + áudio); null até chegar o primeiro pedaço. */
  stream: MediaStream | null;
  /** Ela disse que o microfone / a câmera estão ligados (o vídeo desligado vira avatar, não tela preta). */
  mic: boolean;
  cam: boolean;
  link: PeerLink;
}

export interface EngineOptions {
  /** Meu id (lido a cada uso: a identidade pode chegar depois). */
  me: () => string;
  send: (to: string, signal: CallSignal) => void;
  /** Chamado a cada mudança, com uma cópia do estado de todos os pares. */
  onPeers: (peers: Record<string, CallPeer>) => void;
  /** Fábrica de conexões (os testes trocam por uma de mentira). */
  connect?: (config: RTCConfiguration) => RTCPeerConnection;
}

const blank = (id: string): CallPeer => ({ id, stream: null, mic: true, cam: true, link: "connecting" });

export class CallEngine {
  joined = false;
  private readonly pcs = new Map<string, RTCPeerConnection>();
  private readonly pendingIce = new Map<string, IceCandidate[]>();
  private readonly streams = new Map<string, MediaStream>();
  private peers: Record<string, CallPeer> = {};
  private local: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [];
  private highQuality = false;
  private media = { mic: true, cam: true };

  private opts: EngineOptions;

  constructor(opts: EngineOptions) {
    this.opts = opts;
  }

  /** Troca quem sou eu e como se manda um sinal (o hook liga isso a cada render, depois que as props existem). */
  bind(me: () => string, send: EngineOptions["send"]) {
    this.opts = { ...this.opts, me, send };
  }

  // ── o que a tela configura ───────────────────────────────────────────────

  setIceServers(servers: RTCIceServer[]) {
    this.iceServers = servers;
  }

  /** O que eu mando (null = só assisto). Vale pras conexões criadas daqui pra frente. */
  setLocal(stream: MediaStream | null) {
    this.local = stream;
    for (const track of stream?.getVideoTracks() ?? []) (track as MediaStreamTrack & { contentHint?: string }).contentHint = "motion";
  }

  /** Sou quem faz a mímica agora: o vídeo sai em qualidade maior. */
  setQuality(highQuality: boolean) {
    if (this.highQuality === highQuality) return;
    this.highQuality = highQuality;
    this.applyAll();
  }

  /** Meu microfone / minha câmera estão (de fato) ligados: avisa os outros. */
  setMedia(mic: boolean, cam: boolean) {
    if (this.media.mic === mic && this.media.cam === cam) return;
    this.media = { mic, cam };
    if (this.joined) for (const id of this.pcs.keys()) this.sendMedia(id);
  }

  // ── entrar e sair ────────────────────────────────────────────────────────

  /** Entrei na chamada (a câmera já está pronta): chama todo mundo da mesa. */
  join(peers: string[]) {
    this.joined = true;
    for (const id of peers) this.opts.send(id, { kind: "hello" });
  }

  /** Saí da chamada: avisa a mesa (quem não tem conexão comigo também, que pode ter começado uma) e fecha tudo. */
  leave(peers: string[]) {
    if (!this.joined) return;
    for (const id of new Set([...peers, ...this.pcs.keys()])) this.opts.send(id, { kind: "bye" });
    this.joined = false;
    for (const id of [...this.pcs.keys()]) this.drop(id);
    this.peers = {};
    this.emit();
  }

  /** Quem saiu da mesa perde a conexão. */
  syncPeers(ids: string[]) {
    const present = new Set(ids);
    let changed = false;
    for (const id of [...this.pcs.keys()]) {
      if (present.has(id)) continue;
      this.drop(id);
      delete this.peers[id];
      changed = true;
    }
    if (changed) this.emit();
  }

  // ── o que chega ──────────────────────────────────────────────────────────

  async handle(from: string, signal: CallSignal): Promise<void> {
    if (!this.joined || from === this.opts.me()) return;
    try {
      switch (signal.kind) {
        case "hello": {
          if (!signal.reply) {
            // A pessoa (re)entrou: a conexão velha com ela não vale mais.
            this.drop(from);
            this.ensure(from);
            this.opts.send(from, { kind: "hello", reply: true });
            this.sendMedia(from);
            await this.offerIfOfferer(from);
          } else {
            const { created } = this.ensure(from);
            this.sendMedia(from);
            if (created) await this.offerIfOfferer(from);
          }
          return;
        }
        case "offer": {
          const { pc } = this.ensure(from);
          // As duas pontas ofereceram ao mesmo tempo (não devia acontecer): quem oferece por regra mantém a sua.
          if (pc.signalingState !== "stable" && isOfferer(this.opts.me(), from)) return;
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          if (this.pcs.get(from) !== pc) return;
          await this.flushIce(from, pc);
          const answer = await pc.createAnswer();
          if (this.pcs.get(from) !== pc) return;
          await pc.setLocalDescription(answer);
          this.opts.send(from, { kind: "answer", sdp: answer.sdp ?? "" });
          return;
        }
        case "answer": {
          const pc = this.pcs.get(from);
          if (!pc || pc.signalingState !== "have-local-offer") return;
          await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          if (this.pcs.get(from) === pc) await this.flushIce(from, pc);
          return;
        }
        case "ice": {
          const pc = this.pcs.get(from);
          if (pc?.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => undefined);
          else this.pendingIce.set(from, [...(this.pendingIce.get(from) ?? []), signal.candidate]);
          return;
        }
        case "bye":
          if (this.pcs.has(from)) {
            this.drop(from);
            delete this.peers[from];
            this.emit();
          }
          return;
        case "media":
          if (this.peers[from]) this.patch(from, { mic: signal.mic, cam: signal.cam });
          return;
      }
    } catch {
      if (this.pcs.has(from)) this.patch(from, { link: "failed" });
    }
  }

  /** Fecha tudo sem avisar ninguém (a página está indo embora). */
  dispose() {
    this.joined = false;
    for (const id of [...this.pcs.keys()]) this.drop(id);
    this.peers = {};
  }

  // ── conexões ─────────────────────────────────────────────────────────────

  private ensure(id: string): { pc: RTCPeerConnection; created: boolean } {
    const existing = this.pcs.get(id);
    if (existing) return { pc: existing, created: false };

    const config: RTCConfiguration = { iceServers: this.iceServers };
    const pc = this.opts.connect ? this.opts.connect(config) : new RTCPeerConnection(config);
    // Sempre dá pra RECEBER vídeo e áudio, mesmo sem câmera: quem só assiste vê a mímica.
    for (const kind of ["audio", "video"] as const) {
      const track = this.local?.getTracks().find((t) => t.kind === kind);
      if (track && this.local) pc.addTrack(track, this.local);
      else pc.addTransceiver(kind, { direction: "recvonly" });
    }
    pc.onicecandidate = (e) => {
      if (e.candidate && this.pcs.get(id) === pc) this.opts.send(id, { kind: "ice", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (this.pcs.get(id) !== pc) return;
      const stream = e.streams[0] ?? this.streams.get(id) ?? new MediaStream();
      if (!stream.getTracks().some((t) => t.id === e.track.id)) stream.addTrack(e.track);
      this.streams.set(id, stream);
      this.patch(id, { stream });
    };
    pc.onconnectionstatechange = () => {
      if (this.pcs.get(id) !== pc) return;
      const state = pc.connectionState;
      this.patch(id, { link: state === "connected" ? "connected" : state === "failed" || state === "closed" ? "failed" : "connecting" });
      if (state === "connected") this.applyAll();
      // Caiu de vez: o lado que oferece tenta achar outro caminho.
      else if (state === "failed" && isOfferer(this.opts.me(), id)) void this.offer(id, true);
    };
    this.pcs.set(id, pc);
    this.patch(id, blank(id));
    return { pc, created: true };
  }

  private drop(id: string) {
    const pc = this.pcs.get(id);
    this.pcs.delete(id);
    this.pendingIce.delete(id);
    this.streams.delete(id);
    if (!pc) return;
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    // o orçamento de upload é repartido entre as conexões que SOBRARAM
    this.applyAll();
  }

  private async offerIfOfferer(id: string) {
    if (isOfferer(this.opts.me(), id)) await this.offer(id, false);
  }

  private async offer(id: string, iceRestart: boolean) {
    const pc = this.pcs.get(id);
    if (!pc) return;
    try {
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (this.pcs.get(id) !== pc) return;
      await pc.setLocalDescription(offer);
      this.opts.send(id, { kind: "offer", sdp: offer.sdp ?? "" });
    } catch {
      if (this.pcs.get(id) === pc) this.patch(id, { link: "failed" });
    }
  }

  private async flushIce(id: string, pc: RTCPeerConnection) {
    const queued = this.pendingIce.get(id) ?? [];
    this.pendingIce.delete(id);
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
  }

  private sendMedia(id: string) {
    this.opts.send(id, { kind: "media", mic: this.media.mic, cam: this.media.cam });
  }

  /** O orçamento de upload é repartido entre as conexões: quando a mesa enche ou esvazia, TODAS as que já estão de pé se ajustam. */
  private applyAll() {
    for (const pc of this.pcs.values()) if (pc.connectionState === "connected") this.applyBitrate(pc);
  }

  /** Teto do vídeo que eu mando, repartido entre as conexões que mantenho. */
  private applyBitrate(pc: RTCPeerConnection) {
    const bitrate = videoBitrate(this.highQuality, this.pcs.size);
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = bitrate;
        void sender.setParameters(params).catch(() => undefined);
      } catch {
        // alguns navegadores só aceitam depois de negociar; a próxima mudança tenta de novo
      }
    }
  }

  private patch(id: string, partial: Partial<CallPeer>) {
    this.peers[id] = { ...(this.peers[id] ?? blank(id)), ...partial };
    this.emit();
  }

  private emit() {
    this.opts.onPeers({ ...this.peers });
  }
}
