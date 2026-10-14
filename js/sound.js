// Tiny synthesized sound effects. No audio files; everything is built with WebAudio.

const KEY = 'mo.muted';
let ctx = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch {}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch {}
}

// Must be called from a user gesture at least once so browsers allow audio.
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
}

function ready() {
  return !muted && ctx && ctx.state !== 'closed';
}

function tone({ type = 'sine', from, to = from, at = 0, dur = .15, gain = .3 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + .008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + .02);
}

function noise({ at = 0, dur = .08, gain = .5, freq = 1800 }) {
  const t = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
}

// Sticker slapped onto paper.
export function thwack() {
  if (!ready()) return;
  noise({ dur: .09, gain: .9, freq: 2400 });
  tone({ type: 'sine', from: 170, to: 48, dur: .22, gain: .7 });
}

// Swoosh while a star flies in.
export function whoosh(dur = .6) {
  if (!ready()) return;
  tone({ type: 'triangle', from: 300, to: 900, dur, gain: .06 });
}

// Squeaky pop when tapping a star.
export function pop() {
  if (!ready()) return;
  tone({ type: 'sine', from: 520, to: 1400, dur: .09, gain: .25 });
  tone({ type: 'triangle', from: 1800, to: 2600, at: .05, dur: .06, gain: .06 });
}

// Little twinkle for sparkles.
export function twinkle() {
  if (!ready()) return;
  [1568, 2093, 2637].forEach((f, i) => tone({ type: 'sine', from: f, at: i * .05, dur: .18, gain: .08 }));
}

// Fanfare for a milestone.
export function fanfare() {
  if (!ready()) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone({ type: 'triangle', from: f, at: i * .11, dur: i === 3 ? .6 : .14, gain: .22 }));
  notes.forEach((f, i) => tone({ type: 'square', from: f / 2, at: i * .11, dur: i === 3 ? .5 : .12, gain: .04 }));
}

// Rubber stamp thump.
export function stampThump() {
  if (!ready()) return;
  noise({ dur: .05, gain: .6, freq: 900 });
  tone({ type: 'sine', from: 110, to: 40, dur: .16, gain: .6 });
}

// Paper page turning.
export function flip() {
  if (!ready()) return;
  noise({ dur: .18, gain: .35, freq: 3200 });
  noise({ at: .07, dur: .1, gain: .2, freq: 1400 });
}
