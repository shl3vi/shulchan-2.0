import { randomInt } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const arrayUtil = require("poker-ts/dist/util/array.js") as { shuffle: (cards: unknown[]) => void };

type DeckCard = { rank: number; suit: number };

const originalShuffle = arrayUtil.shuffle;
let order: number[] | null = null;
let random: (() => number) | null = null;

function cardIndex(card: DeckCard) {
  return card.suit * 13 + card.rank;
}

arrayUtil.shuffle = (cards: unknown[]) => {
  if (order) {
    const byIndex = new Map<number, unknown>();
    for (let position = 0; position < cards.length; position += 1) {
      byIndex.set(cardIndex(cards[position] as DeckCard), cards[position]);
    }
    order.forEach((index, position) => {
      cards[position] = byIndex.get(index);
    });
    return;
  }
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

export function shuffledDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, index) => index);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return deck;
}

export function useDeck(deck: number[]) {
  order = deck;
}

// Hands dealt before decks were stored still carry a 32-bit seed.
export function useSeed(seed: number) {
  let state = seed >>> 0;
  random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function clearDeck() {
  order = null;
  random = null;
}
