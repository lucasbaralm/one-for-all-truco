// Utilidades de teste compartilhadas pelos controladores dos jogos: rng com
// semente (resultados repetíveis, vem de ../random) e um relógio manual que
// dispara os timers em ordem, sem esperar tempo de verdade.

export { mulberry32 } from "../random";

export function manualClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const earliest = () => [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    now: () => now,
    pending: () => timers.size,
    /** Avança `ms`, disparando o que vencer no caminho. */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = earliest();
        if (!next || next[1].at > target) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = target;
    },
    /** Roda até não sobrar nada agendado; false se estourou o limite de passos. */
    runAll(maxSteps = 200000) {
      for (let i = 0; i < maxSteps; i++) {
        const next = earliest();
        if (!next) return true;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
      }
      return false;
    },
  };
}
