type DieState = { x: number; y: number; vx: number; vy: number; rot: number; vrot: number };

let audioCtx: AudioContext | null = null;
let lastClack = 0;

function context(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx ??= new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

export function diceClack(strength = 1) {
  const nowMs = Date.now();
  if (nowMs - lastClack < 45) return;
  lastClack = nowMs;
  const ctx = context();
  if (!ctx) {
    void nativeClack();
    return;
  }
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(240 + Math.random() * 380, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.06);
  filter.type = "bandpass";
  filter.frequency.value = 900;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.min(0.35, 0.12 + strength * 0.2), t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.08);

  const length = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  noise.buffer = buffer;
  noiseGain.gain.setValueAtTime(0.18 * strength, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(t);
}

async function nativeClack() {
  try {
    const { requireOptionalNativeModule } = require("expo-modules-core") as {
      requireOptionalNativeModule: (name: string) => object | null;
    };
    if (!requireOptionalNativeModule("ExpoAudio")) return;
    const audio = require("expo-audio") as { createAudioPlayer?: (source: string) => { play: () => void; remove: () => void } };
    if (!audio.createAudioPlayer) return;
    const player = audio.createAudioPlayer(clackWav(320, 90));
    player.play();
    setTimeout(() => player.remove(), 400);
  } catch {
    // This build has no audio module yet.
  }
}

export function checkerPlace() {
  const ctx = context();
  if (!ctx) {
    void nativePlace();
    return;
  }
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180 + Math.random() * 40, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.09);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.28, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

async function nativePlace() {
  try {
    const { requireOptionalNativeModule } = require("expo-modules-core") as {
      requireOptionalNativeModule: (name: string) => object | null;
    };
    if (!requireOptionalNativeModule("ExpoAudio")) return;
    const audio = require("expo-audio") as { createAudioPlayer?: (source: string) => { play: () => void; remove: () => void } };
    if (!audio.createAudioPlayer) return;
    const player = audio.createAudioPlayer(clackWav(140, 140));
    player.play();
    setTimeout(() => player.remove(), 400);
  } catch {
    // This build has no audio module yet.
  }
}

function clackWav(frequency: number, decay: number) {
  const rate = 8000;
  const n = 700;
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const env = Math.exp(-i / decay);
    const tone = Math.sin((2 * Math.PI * frequency * i) / rate) * 0.6 + (Math.random() * 2 - 1) * 0.4;
    samples[i] = Math.max(-1, Math.min(1, tone * env)) * 32000;
  }
  const header = 44;
  const buffer = new ArrayBuffer(header + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) view.setInt16(header + i * 2, samples[i]!, true);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function stepDice(dice: DieState[], radius: number, dt: number) {
  const drag = Math.pow(0.14, dt);
  for (const die of dice) {
    die.vx *= drag;
    die.vy *= drag;
    die.vrot *= drag;
    die.x += die.vx * dt;
    die.y += die.vy * dt;
    die.rot += die.vrot * dt;
    const dist = Math.hypot(die.x, die.y) || 0.001;
    if (dist > radius) {
      const nx = die.x / dist;
      const ny = die.y / dist;
      die.x = nx * radius;
      die.y = ny * radius;
      const impact = die.vx * nx + die.vy * ny;
      if (impact > 0) {
        die.vx -= 2 * impact * nx;
        die.vy -= 2 * impact * ny;
        die.vx *= 0.62;
        die.vy *= 0.62;
        die.vrot += (Math.random() - 0.5) * 900;
        diceClack(Math.min(1, impact / 80));
      }
    }
  }
  const a = dice[0];
  const b = dice[1];
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const min = 16;
  if (dist < min) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = (min - dist) / 2;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel > 0) {
      a.vx -= rel * nx;
      a.vy -= rel * ny;
      b.vx += rel * nx;
      b.vy += rel * ny;
      a.vrot += (Math.random() - 0.5) * 700;
      b.vrot += (Math.random() - 0.5) * 700;
      diceClack(Math.min(1, rel / 90));
    }
  }
}
