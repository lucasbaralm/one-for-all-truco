"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AUDIO_CONSTRAINTS, VIDEO_CONSTRAINTS } from "./bitrate";
import { CallEngine, CallPeer } from "./engine";
import { IceResult, STUN_SERVERS } from "./iceServers";
import type { CallSignal } from "./signaling";

export type { CallPeer };

// A videochamada da sala, como um hook: câmera e microfone, a conexão direta com cada pessoa da mesa
// (motor em engine.ts) e a sinalização pelo WebSocket da sala. Quem usa só liga as pontas:
//  • `sendSignal` / `subscribe`: como mandar e como ouvir as mensagens "rtc" da sala;
//  • `peers`: quem está na mesa (a chamada só conecta com eles);
//  • `highQuality`: sou quem faz a mímica (vídeo melhor);
//  • `micLocked`: o microfone fica cortado (quem faz a mímica não faz som).

export interface UseCallOptions {
  me: string;
  peers: string[];
  sendSignal: (to: string, signal: CallSignal) => void;
  subscribe: (handler: (from: string, signal: CallSignal) => void) => () => void;
  highQuality: boolean;
  micLocked: boolean;
}

export interface CallApi {
  joined: boolean;
  joining: boolean;
  /** Aviso em português pra mostrar (câmera bloqueada, sem câmera...). A chamada pode seguir mesmo assim, só assistindo. */
  error: string | null;
  /** Tem servidor TURN (null = ainda não sei). Sem ele, uma minoria de redes não conecta. */
  relay: boolean | null;
  localStream: MediaStream | null;
  hasMic: boolean;
  hasCam: boolean;
  micOn: boolean;
  camOn: boolean;
  /** O microfone está de fato aberto (ligado, sem trava e existente). */
  micActive: boolean;
  /** Quem está na chamada comigo (só os da mesa). */
  peers: Record<string, CallPeer>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

const ICE_TIMEOUT_MS = 5000;

async function loadIceServers(): Promise<IceResult> {
  const fallback: IceResult = { iceServers: STUN_SERVERS, relay: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICE_TIMEOUT_MS);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return fallback;
    const res = await fetch("/api/turn", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) return fallback;
    const body = (await res.json()) as Partial<IceResult>;
    return Array.isArray(body.iceServers) && body.iceServers.length > 0 ? { iceServers: body.iceServers, relay: body.relay === true } : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** Texto em português pro motivo de a câmera/microfone não abrirem. */
export function mediaErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "O navegador bloqueou a câmera e o microfone. Libere a permissão no cadeado da barra de endereço e entre de novo — por enquanto você só assiste.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Não encontrei câmera nem microfone neste aparelho — você só assiste.";
  if (name === "NotReadableError" || name === "AbortError") return "A câmera ou o microfone estão em uso por outro programa — você só assiste.";
  return "Não consegui abrir a câmera e o microfone — você só assiste.";
}

/** Abre câmera + microfone; se faltar um dos dois, tenta só o que existe; se faltar tudo, devolve null (só assiste). */
async function openMedia(): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { stream: null, error: "Este navegador só libera câmera e microfone em páginas seguras (https) — você só assiste." };
  }
  const attempts: MediaStreamConstraints[] = [
    { audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS },
    { audio: AUDIO_CONSTRAINTS, video: false },
    { audio: false, video: VIDEO_CONSTRAINTS },
  ];
  let firstError: unknown;
  for (const constraints of attempts) {
    try {
      return { stream: await navigator.mediaDevices.getUserMedia(constraints), error: null };
    } catch (e) {
      firstError ??= e;
      // Permissão negada vale pros dois: não adianta tentar de novo só com o áudio.
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) break;
    }
  }
  return { stream: null, error: mediaErrorMessage(firstError) };
}

export function useCall(options: UseCallOptions): CallApi {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [peers, setPeers] = useState<Record<string, CallPeer>>({});
  const [engine] = useState(() => new CallEngine({ me: () => "", send: () => undefined, onPeers: setPeers }));
  // Quem sou eu e como mando um sinal: ligado depois que as props existem (antes de qualquer sinal chegar).
  const { me, sendSignal, subscribe } = options;
  useEffect(() => {
    engine.bind(() => me, sendSignal);
  }, [engine, me, sendSignal]);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relay, setRelay] = useState<boolean | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const joiningRef = useRef(false);

  const hasMic = useMemo(() => (localStream?.getAudioTracks().length ?? 0) > 0, [localStream]);
  const hasCam = useMemo(() => (localStream?.getVideoTracks().length ?? 0) > 0, [localStream]);
  const micActive = hasMic && micOn && !options.micLocked;

  const join = useCallback(async () => {
    if (engine.joined || joiningRef.current) return;
    joiningRef.current = true;
    setJoining(true);
    setError(null);
    const [ice, media] = await Promise.all([loadIceServers(), openMedia()]);
    engine.setIceServers(ice.iceServers);
    engine.setLocal(media.stream);
    localRef.current = media.stream;
    setRelay(ice.relay);
    setLocalStream(media.stream);
    setError(media.error);
    engine.join(optsRef.current.peers);
    setJoined(true);
    setJoining(false);
    joiningRef.current = false;
  }, [engine]);

  const leave = useCallback(() => {
    engine.leave(optsRef.current.peers);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setJoined(false);
    setError(null);
  }, [engine]);

  // Microfone e câmera: o interruptor de cada um + a trava do microfone (quem faz a mímica não faz som).
  useEffect(() => {
    if (!localStream) return;
    const mic = micOn && !options.micLocked;
    localStream.getAudioTracks().forEach((t) => (t.enabled = mic));
    localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
    engine.setMedia(mic && hasMic, camOn && hasCam);
  }, [engine, localStream, micOn, camOn, options.micLocked, hasMic, hasCam]);

  useEffect(() => {
    engine.setQuality(options.highQuality);
  }, [engine, options.highQuality]);

  // Quem saiu da mesa perde a conexão.
  const peerKey = options.peers.join("|");
  useEffect(() => {
    engine.syncPeers(peerKey ? peerKey.split("|") : []);
  }, [engine, peerKey]);

  useEffect(() => subscribe((from, signal) => void engine.handle(from, signal)), [engine, subscribe]);

  // Fechou a aba / saiu da sala: libera a câmera e avisa a mesa.
  useEffect(() => {
    const bye = () => {
      engine.leave(optsRef.current.peers);
      localRef.current?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
      engine.dispose();
    };
  }, [engine]);

  const visible = useMemo(() => {
    const present = new Set(options.peers);
    return Object.fromEntries(Object.entries(peers).filter(([id]) => present.has(id)));
  }, [peers, options.peers]);

  return {
    joined,
    joining,
    error,
    relay,
    localStream,
    hasMic,
    hasCam,
    micOn,
    camOn,
    micActive,
    peers: visible,
    join,
    leave,
    toggleMic: () => setMicOn((v) => !v),
    toggleCam: () => setCamOn((v) => !v),
  };
}
