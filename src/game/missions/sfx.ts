/**
 * Synthesized mission sounds (no audio files): checkpoint ding, countdown beeps, gunshots,
 * hits on the car, and pass / fail stings. The context starts on first use, which is always
 * after a click or key press (starting a mission), so browsers allow it.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master!, noise: noise! };
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + start;
  const o = a.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst(dur: number, freq: number, q: number, gain: number, pan = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime;
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  const f = a.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = a.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  src.connect(f).connect(g).connect(p).connect(a.out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  checkpoint: () => {
    tone(880, 0, 0.18, 'sine', 0.25);
    tone(1320, 0.08, 0.25, 'sine', 0.2);
  },
  beep: (urgent: boolean) => tone(urgent ? 1046 : 784, 0, 0.12, 'square', 0.08),
  start: () => {
    tone(523, 0, 0.18, 'triangle', 0.22);
    tone(784, 0.12, 0.3, 'triangle', 0.22);
  },
  passed: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.35, 'triangle', 0.22));
  },
  failed: () => {
    [392, 330, 262].forEach((f, i) => tone(f, i * 0.16, 0.4, 'sawtooth', 0.1));
  },
  /** A shot `distance` m away; `pan` −1..1 from where it came. */
  shot: (distance: number, pan: number) =>
    burst(0.16, 1400, 0.7, Math.max(0.05, 0.6 - distance * 0.008), pan),
  hit: () => {
    burst(0.08, 3200, 2, 0.35);
    tone(2400, 0, 0.06, 'square', 0.04);
  },
};
