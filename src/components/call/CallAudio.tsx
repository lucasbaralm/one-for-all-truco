"use client";

import { useEffect, useRef } from "react";
import type { CallPeer } from "@/lib/call/engine";

// O som da chamada: UM <audio> por pessoa que está mandando áudio. Os quadrinhos de vídeo são mudos, então
// ninguém é ouvido duas vezes. (O navegador só toca depois de um clique na página — entrar na chamada já é um.)

function PeerAudio({ stream, id }: { stream: MediaStream; id: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);
  return <audio ref={ref} autoPlay data-call-audio={id} />;
}

export function CallAudio({ peers }: { peers: Record<string, CallPeer> }) {
  return (
    <>
      {Object.values(peers).map((p) => (p.stream ? <PeerAudio key={p.id} id={p.id} stream={p.stream} /> : null))}
    </>
  );
}
