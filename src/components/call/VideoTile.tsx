"use client";

import { ReactNode, useEffect, useRef } from "react";
import { MicOff, VideoOff } from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

// Um quadrinho da videochamada: o vídeo de uma pessoa (ou o avatar, se a câmera está desligada ou ela só assiste),
// com o nome, a pontuação e os avisos de microfone/câmera. O vídeo é SEMPRE mudo aqui: o som de cada pessoa sai
// de UM <audio> (CallAudio) — assim a mesma pessoa pode aparecer em dois lugares (no quadro grande e na lista)
// sem o áudio sair dobrado.

interface VideoTileProps {
  stream: MediaStream | null;
  /** É o meu próprio vídeo: aparece espelhado, como num espelho. */
  local?: boolean;
  name: string;
  avatarUrl?: string | null;
  /** Ela disse que a câmera está ligada (null = não sei ainda). */
  cam?: boolean | null;
  mic?: boolean | null;
  /** Enquanto não há vídeo: o texto embaixo do avatar. */
  placeholder?: string;
  className?: string;
  /** Vai no cantinho de baixo, à direita do nome (a pontuação). */
  corner?: ReactNode;
  /** Vai por cima de tudo (selos, avisos). */
  children?: ReactNode;
  testId?: string;
}

export function VideoTile({ stream, local = false, name, avatarUrl, cam = true, mic = true, placeholder, className = "", corner, children, testId }: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().length > 0 && cam !== false;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950 ${className}`} data-mimica-tile={testId} data-has-video={hasVideo ? "true" : "false"}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full bg-black object-cover ${hasVideo ? "" : "invisible"}`}
        style={local ? { transform: "scaleX(-1)" } : undefined}
        data-mimica-video={testId}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-b from-zinc-900 to-zinc-950 p-1 text-center">
          <PlayerAvatar avatarUrl={avatarUrl} name={name} className="h-[34%] max-h-16 min-h-7 w-auto aspect-square text-lg" />
          {placeholder && <p className="line-clamp-2 text-[0.62rem] font-semibold leading-tight text-zinc-400">{placeholder}</p>}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1 pt-4">
        <p className="min-w-0 truncate text-[0.72rem] font-bold leading-tight text-white">
          {name}
          {local && <span className="ml-1 text-[0.6rem] font-semibold text-zinc-300">(você)</span>}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {mic === false && <MicOff className="h-3 w-3 text-red-400" aria-label="microfone desligado" />}
          {cam === false && <VideoOff className="h-3 w-3 text-red-400" aria-label="câmera desligada" />}
          {corner}
        </div>
      </div>
      {children}
    </div>
  );
}
