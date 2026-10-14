"use client";

import { useEffect } from "react";

// "É a sua vez" fora da aba: com a aba em segundo plano ninguém vê o jogo, então
// o título da aba fica alternando entre o aviso e o nome normal até a pessoa voltar.

/** Título da aba num instante do piscar (puro, pra testar). */
export function alertTitle(base: string, message: string, on: boolean): string {
  return on ? `🔔 ${message} — ${base}` : base;
}

const BLINK_MS = 1000;

/**
 * `active` = "tem algo esperando por você agora". O título só pisca se a aba
 * estiver escondida, e volta ao normal quando a pessoa volta pra aba ou quando
 * `active` termina.
 */
export function useTurnAlert(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const base = document.title;
    let on = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      document.title = base;
    };
    const sync = () => {
      if (document.hidden) {
        if (timer) return;
        on = true;
        document.title = alertTitle(base, message, on);
        timer = setInterval(() => {
          on = !on;
          document.title = alertTitle(base, message, on);
        }, BLINK_MS);
      } else {
        stop();
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [active, message]);
}
