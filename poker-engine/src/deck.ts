import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const arrayUtil = require("poker-ts/dist/util/array.js") as { shuffle: (cards: unknown[]) => void };

const originalShuffle = arrayUtil.shuffle;
let random: (() => number) | null = null;

arrayUtil.shuffle = (cards: unknown[]) => {
  if (!random) {
    originalShuffle(cards);
    return;
  }
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const card = cards[index];
    cards[index] = cards[swap];
    cards[swap] = card;
  }
};

export function useSeed(seed: number) {
  let state = seed >>> 0;
  random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function clearSeed() {
  random = null;
}
