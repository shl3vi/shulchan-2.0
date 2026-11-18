// Writes the sounds the app makes in code to assets/sounds as 16-bit mono WAV files.
// Run from client/: node scripts/make-sounds.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sounds");

function buffer(seconds) {
  return new Float32Array(Math.ceil(seconds * RATE));
}

const midi = (note) => 440 * Math.pow(2, (note - 69) / 12);

/** Adds one note: a few harmonics, a short attack, then an exponential decay. */
function note(samples, { at, freq, length, decay, gain, harmonics, attack = 0.005, bend = 0 }) {
  const start = Math.floor(at * RATE);
  const n = Math.floor(length * RATE);
  for (let i = 0; i < n && start + i < samples.length; i += 1) {
    const time = i / RATE;
    const env = Math.min(1, time / attack) * Math.exp(-time / decay);
    const f = freq * (1 + bend * time);
    let value = 0;
    for (const [multiple, level] of harmonics) value += Math.sin(2 * Math.PI * f * multiple * time) * level;
    samples[start + i] += value * env * gain;
  }
}

/** Fades the last few milliseconds so the file never ends on a click. */
function tail(samples, seconds = 0.04) {
  const n = Math.floor(seconds * RATE);
  for (let i = 0; i < n; i += 1) samples[samples.length - 1 - i] *= i / n;
  return samples;
}

function normalize(samples, peak) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  if (max > 0) for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] / max) * peak;
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return data;
}

const bell = [
  [1, 1],
  [2, 0.42],
  [3, 0.16],
  [4.2, 0.06],
];

// Win: a quick rising major arpeggio that rings out on the top note.
function win() {
  const samples = buffer(1.5);
  const steps = [72, 76, 79];
  steps.forEach((step, index) => {
    note(samples, { at: index * 0.085, freq: midi(step), length: 0.5, decay: 0.16, gain: 0.55, harmonics: bell });
  });
  note(samples, { at: 0.255, freq: midi(84), length: 1.2, decay: 0.42, gain: 0.7, harmonics: bell });
  note(samples, { at: 0.255, freq: midi(79), length: 1.0, decay: 0.38, gain: 0.32, harmonics: bell });
  note(samples, { at: 0.255, freq: midi(76), length: 1.0, decay: 0.36, gain: 0.26, harmonics: bell });
  // A little shimmer on top.
  for (let k = 0; k < 6; k += 1) {
    note(samples, { at: 0.32 + k * 0.07, freq: midi(96 + (k % 3) * 3), length: 0.15, decay: 0.04, gain: 0.08, harmonics: [[1, 1]] });
  }
  return tail(normalize(samples, 0.85));
}

// Lose: two soft, low notes going down, rounder and quieter than the win.
function lose() {
  const samples = buffer(1.1);
  const soft = [
    [1, 1],
    [2, 0.18],
    [3, 0.05],
  ];
  note(samples, { at: 0, freq: midi(64), length: 0.4, decay: 0.16, gain: 0.5, harmonics: soft, attack: 0.02, bend: -0.04 });
  note(samples, { at: 0.24, freq: midi(60), length: 0.85, decay: 0.3, gain: 0.55, harmonics: soft, attack: 0.025, bend: -0.05 });
  note(samples, { at: 0.24, freq: midi(55), length: 0.85, decay: 0.3, gain: 0.25, harmonics: soft, attack: 0.025, bend: -0.05 });
  return tail(normalize(samples, 0.6));
}

mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries({ win, lose })) {
  writeFileSync(join(out, `${name}.wav`), wav(make()));
  console.log(`wrote assets/sounds/${name}.wav`);
}
