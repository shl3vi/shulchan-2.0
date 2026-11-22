// Draws the board textures into assets/images/textures as tileable PNG overlays.
// They are @2x, so each tile spans half its pixel size in points and stays sharp.
// They hold only light and shadow (white and black at low alpha), so the colors stay in code.
// Run from client/: node scripts/make-textures.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const OUT = new URL("../assets/images/textures/", import.meta.url);

function png(width, height, rgba) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0;
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A seeded random, so the textures come out the same on every run.
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Value noise on a grid of `cells` across and `rows` down (`rows` defaults to `cells`),
 * wrapping at the edges so the texture tiles.
 */
function noiseLayer(width, cells, rand, height = width, rows = cells) {
  const grid = Array.from({ length: cells * rows }, () => rand() * 2 - 1);
  const at = (gx, gy) => grid[((gy % rows) + rows) % rows * cells + (((gx % cells) + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / width) * cells;
    const fy = (y / height) * rows;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

/** Light where the value is above zero, shadow where it is below. */
function shade(rgba, index, value, strength) {
  const alpha = Math.min(255, Math.round(Math.abs(value) * strength * 255));
  const tone = value > 0 ? 255 : 0;
  rgba[index] = tone;
  rgba[index + 1] = tone;
  rgba[index + 2] = tone;
  rgba[index + 3] = alpha;
}

/** Felt: fine fibre speckle over a soft, cloudy nap. */
function felt(size) {
  const rand = random(7);
  const nap = noiseLayer(size, 8, rand);
  const tuft = noiseLayer(size, 64, rand);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fibre = rand() * 2 - 1;
      const value = nap(x, y) * 0.35 + tuft(x, y) * 0.35 + fibre * 0.3;
      shade(rgba, (y * size + x) * 4, value, 0.22);
    }
  }
  return rgba;
}

/** Walnut: long, nearly straight grain lines running across, with streaks and darker pores. */
function wood(width, height) {
  const rand = random(11);
  // Coarse across and finer down, so the grain stretches out sideways.
  const bend = noiseLayer(width, 2, rand, height, 5);
  const ripple = noiseLayer(width, 6, rand, height, 24);
  const streak = noiseLayer(width, 3, rand, height, 48);
  const pores = noiseLayer(width, 96, rand, height, 96);
  const rgba = Buffer.alloc(width * height * 4);
  const lines = 18; // grain lines down the tile; whole, so the tile wraps
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const warp = bend(x, y) * 0.9 + ripple(x, y) * 0.12;
      const ring = Math.sin(((y / height) * lines + warp) * Math.PI * 2);
      // Thin dark lines with broad bands between them, darker in some streaks than others.
      const line = Math.pow((ring + 1) / 2, 8) * (0.55 + 0.45 * (streak(x, y) + 1) / 2);
      const band = streak(x, y) * 0.22;
      const pore = Math.max(0, pores(x, y) - 0.35) * 0.9;
      const value = 0.1 + band - line * 0.9 - pore + (rand() - 0.5) * 0.06;
      shade(rgba, (y * width + x) * 4, value, 0.32);
    }
  }
  return rgba;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL("felt@2x.png", OUT), png(256, 256, felt(256)));
writeFileSync(new URL("wood@2x.png", OUT), png(512, 256, wood(512, 256)));
console.log("Wrote felt@2x.png and wood@2x.png to assets/images/textures");
