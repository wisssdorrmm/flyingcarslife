/**
 * Synthesized electric-motor whine + tire/road noise (no audio files needed).
 * Pitch follows speed, loudness follows throttle. Created on first use, which is always
 * after a user gesture (getting into the car), so the AudioContext is allowed to start.
 */
let ctx: AudioContext | null = null;
let nodes: {
  master: GainNode;
  whine: OscillatorNode;
  whine2: OscillatorNode;
  whineGain: GainNode;
  roadGain: GainNode;
  roadFilter: BiquadFilterNode;
  screechGain: GainNode;
  screechFilter: BiquadFilterNode;
} | null = null;

function init(): void {
  if (nodes) return;
  ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const whineFilter = ctx.createBiquadFilter();
  whineFilter.type = 'lowpass';
  whineFilter.frequency.value = 2400;
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0;
  const whine = ctx.createOscillator();
  whine.type = 'sawtooth';
  const whine2 = ctx.createOscillator();
  whine2.type = 'sine';
  whine.connect(whineFilter);
  whine2.connect(whineFilter);
  whineFilter.connect(whineGain).connect(master);

  // Looping brown-ish noise for tires on asphalt.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const roadFilter = ctx.createBiquadFilter();
  roadFilter.type = 'lowpass';
  roadFilter.frequency.value = 400;
  const roadGain = ctx.createGain();
  roadGain.gain.value = 0;
  noise.connect(roadFilter).connect(roadGain).connect(master);

  // Tire screech: white noise through a narrow band-pass that wobbles a little.
  const white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const wd = white.getChannelData(0);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
  const screech = ctx.createBufferSource();
  screech.buffer = white;
  screech.loop = true;
  const screechFilter = ctx.createBiquadFilter();
  screechFilter.type = 'bandpass';
  screechFilter.frequency.value = 1900;
  screechFilter.Q.value = 9;
  const screechGain = ctx.createGain();
  screechGain.gain.value = 0;
  screech.connect(screechFilter).connect(screechGain).connect(master);

  whine.start();
  whine2.start();
  noise.start();
  screech.start();
  nodes = { master, whine, whine2, whineGain, roadGain, roadFilter, screechGain, screechFilter };
}

/** Call every frame while driving. `speed` in m/s, `throttle` and `slide` (tire slide) 0–1. */
export function updateEvSound(speed: number, throttle: number, slide = 0): void {
  init();
  if (!ctx || !nodes) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime;
  const s = Math.abs(speed);
  const ramp = 0.08;
  nodes.master.gain.setTargetAtTime(0.9, t, 0.2);
  nodes.whine.frequency.setTargetAtTime(90 + s * 26, t, ramp);
  nodes.whine2.frequency.setTargetAtTime(180 + s * 52, t, ramp);
  nodes.whineGain.gain.setTargetAtTime(0.012 + throttle * 0.03 + Math.min(s, 30) * 0.0008, t, ramp);
  nodes.roadGain.gain.setTargetAtTime(Math.min(s / 30, 1) * 0.12, t, 0.15);
  nodes.roadFilter.frequency.setTargetAtTime(250 + s * 25, t, 0.15);
  nodes.screechGain.gain.setTargetAtTime(slide * 0.22, t, 0.06);
  nodes.screechFilter.frequency.setTargetAtTime(1700 + Math.sin(t * 23) * 180 + s * 6, t, 0.05);
}

/** Fade out when the player leaves the car. */
export function stopEvSound(): void {
  if (!ctx || !nodes) return;
  nodes.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}
