// Sinalização da videochamada (WebRTC): as mensagens que as pessoas trocam, POR DENTRO do WebSocket da sala, pra
// combinar a conexão direta de vídeo e áudio. O servidor da sala (party/game-room.ts) só entrega cada mensagem
// pra pessoa certa; o vídeo e o áudio em si NÃO passam por ele — vão direto de um navegador pro outro.
//
// Cada par de pessoas tem UMA conexão, e quem manda a oferta é sempre o mesmo lado do par (o de menor id): assim
// os dois nunca oferecem ao mesmo tempo. Quem entra na chamada avisa todo mundo com "hello"; quem já estava nela
// responde com "hello" de resposta e a conexão do par se monta.

/** Um candidato ICE como ele viaja pela rede (o mesmo formato do RTCIceCandidateInit, sem depender das tipagens de DOM — o servidor da sala também importa este arquivo). */
export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type CallSignal =
  /** Entrei na chamada. `reply` = é a resposta a um "hello" que recebi (não se responde de volta). */
  | { kind: "hello"; reply?: boolean }
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  /** Um caminho possível pra conexão (candidato ICE). */
  | { kind: "ice"; candidate: IceCandidate }
  /** Saí da chamada. */
  | { kind: "bye" }
  /** Meu microfone / minha câmera estão ligados? (o vídeo desligado vira o avatar, em vez de uma tela preta). */
  | { kind: "media"; mic: boolean; cam: boolean };

/** O que chega do servidor: o remetente (identidade verificada) e o sinal. */
export interface RtcMessage {
  type: "rtc";
  from: string;
  signal: CallSignal;
}

/** Um SDP com vídeo e áudio tem uns 5 KB; passou muito disso, não é SDP. */
const MAX_SDP = 20_000;
const MAX_CANDIDATE = 2_000;

/** Quem manda a oferta num par: o de menor id (a comparação é a mesma nos dois lados). */
export function isOfferer(me: string, peer: string): boolean {
  return me < peer;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Lê um sinal que veio da rede: devolve um objeto limpo (só os campos conhecidos) ou null se não presta. */
export function parseSignal(raw: unknown): CallSignal | null {
  if (!isRecord(raw) || typeof raw.kind !== "string") return null;
  switch (raw.kind) {
    case "hello":
      return raw.reply === true ? { kind: "hello", reply: true } : { kind: "hello" };
    case "bye":
      return { kind: "bye" };
    case "offer":
    case "answer":
      return typeof raw.sdp === "string" && raw.sdp.length > 0 && raw.sdp.length <= MAX_SDP ? { kind: raw.kind, sdp: raw.sdp } : null;
    case "media":
      return typeof raw.mic === "boolean" && typeof raw.cam === "boolean" ? { kind: "media", mic: raw.mic, cam: raw.cam } : null;
    case "ice": {
      const c = raw.candidate;
      if (!isRecord(c) || typeof c.candidate !== "string" || c.candidate.length > MAX_CANDIDATE) return null;
      const candidate: IceCandidate = { candidate: c.candidate };
      if (typeof c.sdpMid === "string" || c.sdpMid === null) candidate.sdpMid = c.sdpMid;
      if (typeof c.sdpMLineIndex === "number" || c.sdpMLineIndex === null) candidate.sdpMLineIndex = c.sdpMLineIndex;
      if (typeof c.usernameFragment === "string") candidate.usernameFragment = c.usernameFragment;
      return { kind: "ice", candidate };
    }
    default:
      return null;
  }
}

/** Lê a mensagem "rtc" inteira que o servidor mandou. */
export function parseRtcMessage(raw: unknown): RtcMessage | null {
  if (!isRecord(raw) || raw.type !== "rtc" || typeof raw.from !== "string" || !raw.from) return null;
  const signal = parseSignal(raw.signal);
  return signal ? { type: "rtc", from: raw.from, signal } : null;
}
