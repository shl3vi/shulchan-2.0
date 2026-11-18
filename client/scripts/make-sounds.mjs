// Writes the sounds the app makes in code to assets/sounds as 16-bit mono WAV files.
// The chip and card sounds are Kenney's (see assets/sounds/CREDITS.txt), not made here.
// Run from client/: node scripts/make-sounds.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sounds");

const midi = (note) => 440 * Math.pow(2, (note - 69) / 12);

/**
 * A struck metal bar, like a celesta or glockenspiel: the bar's own overtones
 * (not whole multiples), the higher ones dying away faster.
 */
function bar(samples, { at, freq, gain, length = 1.4 }) {
  const partials = [
    [1, 1, 0.9],
    [2.756, 0.28, 0.22],
    [5.404, 0.09, 0.07],
    [0.5, 0.22, 0.5],
  ];
  const start = Math.floor(at * RATE);
  const n = Math.floor(length * RATE);
  for (let i = 0; i < n && start + i < samples.length; i += 1) {
    const time = i / RATE;
    const attack = Math.min(1, time / 0.002);
    let value = 0;
    for (const [ratio, level, decay] of partials) {
      value += Math.sin(2 * Math.PI * freq * ratio * time) * level * Math.exp(-time / decay);
    }
    samples[start + i] += value * attack * gain;
  }
}

/** A small room: four comb filters and two all-pass filters (Schroeder). */
function reverb(dry, wet) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((seconds) => ({ delay: Math.floor(seconds * RATE), feedback: 0.78 }));
  const sum = new Float32Array(dry.length);
  for (const { delay, feedback } of combs) {
    const line = new Float32Array(dry.length);
    for (let i = 0; i < dry.length; i += 1) {
      line[i] = dry[i] + (i >= delay ? line[i - delay] * feedback : 0);
      sum[i] += line[i] / combs.length;
    }
  }
  let signal = sum;
  for (const seconds of [0.005, 0.0017]) {
    const delay = Math.floor(seconds * RATE);
    const g = 0.7;
    const next = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i += 1) {
      const back = i >= delay ? next[i - delay] : 0;
      const ahead = i >= delay ? signal[i - delay] : 0;
      next[i] = -g * signal[i] + ahead + g * back;
    }
    signal = next;
  }
  const mixed = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i += 1) mixed[i] = dry[i] + signal[i] * wet;
  return mixed;
}

/** Takes the edge off the top so the bells do not sound thin through a phone speaker. */
function soften(samples, amount = 0.35) {
  let last = 0;
  for (let i = 0; i < samples.length; i += 1) {
    last += (samples[i] - last) * (1 - amount);
    samples[i] = last;
  }
  return samples;
}

function normalize(samples, peak) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  if (max > 0) for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] / max) * peak;
  return samples;
}

/** Fades the end so the file never stops on a click. */
function tail(samples, seconds = 0.25) {
  const n = Math.floor(seconds * RATE);
  for (let i = 0; i < n; i += 1) samples[samples.length - 1 - i] *= Math.pow(i / n, 2);
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

// Win: four quick celesta notes up a major chord, the last two ringing together, in a small room.
function win() {
  const dry = new Float32Array(Math.ceil(1.7 * RATE));
  const notes = [79, 84, 88, 91];
  notes.forEach((note, index) => {
    bar(dry, { at: index * 0.075, freq: midi(note), gain: index === notes.length - 1 ? 0.75 : 0.55 });
  });
  bar(dry, { at: 0.3, freq: midi(96), gain: 0.32, length: 1.3 });
  return tail(normalize(reverb(soften(dry), 0.28), 0.8));
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "win.wav"), wav(win()));
console.log("wrote assets/sounds/win.wav");
