// Primitivas de áudio (WebAudio) compartilhadas pelos efeitos sonoros dos
// jogos — sem arquivos de som pra baixar nem licenciar. O AudioContext só
// nasce depois de um gesto do usuário (política de autoplay dos navegadores):
// o primeiro clique de verdade chama `unlockAudio()`. Liga/desliga é um só pro
// site inteiro (guardado no localStorage).

const STORAGE_KEY = "fodinha_sound";

let ctx: AudioContext | null = null;
let enabled = true;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    enabled = window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // sem localStorage (modo privado): segue com o som ligado
  }
}

export function isSoundEnabled(): boolean {
  load();
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  load();
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // ignora
  }
}

function audio(): AudioContext | null {
  load();
  if (!enabled || typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Chamar dentro de um clique/toque pra liberar o áudio do navegador. */
export function unlockAudio() {
  audio();
}

/** Um tom (com deslize opcional de frequência), começando `start` segundos a partir de agora. */
export function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12, slideTo?: number) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Estalo de ruído (chocalho de dado, explosão, "puff"). */
export function noiseBurst(start: number, dur: number, gain = 0.05, highpass = 1800) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}
