"use client";

import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import type { CallApi } from "@/lib/call/useCall";

// Os botões da videochamada: entrar, microfone, câmera e sair. Aparecem no cabeçalho do jogo e no lobby.
// `compact` = só ícones (cabeçalho, telas estreitas).

const BASE = "flex items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function CallControls({ call, micLocked = false, compact = false }: { call: CallApi; micLocked?: boolean; compact?: boolean }) {
  if (!call.joined) {
    return (
      <button
        onClick={() => void call.join()}
        disabled={call.joining}
        data-call-join=""
        className={`${BASE} bg-emerald-600 text-white hover:bg-emerald-700 ${compact ? "h-8 px-2.5" : "h-11 px-4"}`}
      >
        {call.joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
        <span className={compact ? "hidden sm:inline" : ""}>{call.joining ? "Abrindo a câmera…" : "Entrar na chamada"}</span>
      </button>
    );
  }

  const size = compact ? "h-8 w-8" : "h-11 w-11";
  const micOpen = call.micActive;
  return (
    <div className="flex items-center gap-1" data-call-controls="">
      <button
        onClick={call.toggleMic}
        disabled={!call.hasMic || micLocked}
        aria-label={micLocked ? "Microfone cortado durante a mímica" : micOpen ? "Desligar microfone" : "Ligar microfone"}
        title={micLocked ? "Quem faz a mímica não faz som: o microfone fica cortado" : micOpen ? "Desligar microfone" : "Ligar microfone"}
        data-call-mic={micOpen ? "on" : "off"}
        className={`${BASE} ${size} ${micOpen ? "bg-black/50 text-white hover:bg-black/70" : "bg-red-600/80 text-white hover:bg-red-600"}`}
      >
        {micOpen ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </button>
      <button
        onClick={call.toggleCam}
        disabled={!call.hasCam}
        aria-label={call.camOn && call.hasCam ? "Desligar câmera" : "Ligar câmera"}
        title={call.hasCam ? (call.camOn ? "Desligar câmera" : "Ligar câmera") : "Sem câmera neste aparelho"}
        data-call-cam={call.camOn && call.hasCam ? "on" : "off"}
        className={`${BASE} ${size} ${call.camOn && call.hasCam ? "bg-black/50 text-white hover:bg-black/70" : "bg-red-600/80 text-white hover:bg-red-600"}`}
      >
        {call.camOn && call.hasCam ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </button>
      <button onClick={call.leave} aria-label="Sair da chamada" title="Sair da chamada" data-call-leave="" className={`${BASE} ${size} bg-black/50 text-red-300 hover:bg-red-600 hover:text-white`}>
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}
