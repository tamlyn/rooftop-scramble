/** Tiny synthesised sound effects, so the game ships without audio assets. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(type: OscillatorType, from: number, to: number, duration: number, volume = 0.5, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration);
}

function noise(duration: number, volume: number, filterFrom: number, filterTo: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrom, t);
  filter.frequency.exponentialRampToValueAtTime(filterTo, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

export const sfx = {
  jump: () => tone('square', 220, 520, 0.12, 0.12),
  bounce: () => tone('sine', 180, 900, 0.35, 0.4),
  land: () => noise(0.08, 0.25, 800, 100),
  splat: () => {
    noise(0.25, 0.5, 1200, 80);
    tone('sawtooth', 300, 60, 0.3, 0.15);
  },
  dive: () => noise(0.18, 0.2, 3000, 400),
  bonk: () => tone('square', 160, 80, 0.15, 0.3),
  tackle: () => {
    tone('square', 140, 70, 0.2, 0.3);
    noise(0.15, 0.4, 2000, 200);
  },
  pickup: () => [523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.1, 0.25, i * 0.06)),
  item: () => tone('sawtooth', 400, 1200, 0.15, 0.15),
  rocket: () => noise(0.6, 0.3, 4000, 300),
  explosion: () => {
    noise(0.9, 0.9, 2500, 40);
    tone('sine', 120, 30, 0.6, 0.6);
  },
  splash: () => noise(0.5, 0.5, 5000, 300),
  coo: () => [0, 0.18].forEach((d) => tone('sine', 420, 300, 0.15, 0.2, d)),
  beep: (high = false) => tone('square', high ? 880 : 440, high ? 880 : 440, high ? 0.4 : 0.15, 0.2),
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.25, i * 0.12)),
  honk: () => tone('square', 330, 300, 0.25, 0.15),
};
