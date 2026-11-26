/**
 * The dice engine's scoring, copied so the scorecard can show what each box would score
 * before the player picks it. The engine still checks and scores every box.
 */
export const UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"] as const;
export const LOWER = ["threeKind", "fourKind", "fullHouse", "smallStraight", "largeStraight", "fiveKind", "chance"] as const;
export const CATEGORIES = [...UPPER, ...LOWER] as const;

export type Category = (typeof CATEGORIES)[number];

export const UPPER_BONUS_AT = 63;
export const UPPER_BONUS = 35;
export const FIVE_KIND_BONUS = 100;
export const ROLLS_PER_TURN = 3;

export type DicePlayer = {
  id: string;
  name: string;
  scores: Partial<Record<Category, number>>;
  fiveKindBonus: number;
  left?: boolean;
  total?: number;
};

export type DiceGame = {
  players: DicePlayer[];
  turn: number;
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  rolls: number;
  phase: "playing" | "over";
  last: { playerId: string; category: Category; points: number } | null;
  winners: string[];
};

function counts(dice: number[]) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const face of dice) out[face] += 1;
  return out;
}

function sum(dice: number[]) {
  return dice.reduce((total, face) => total + face, 0);
}

function hasRun(dice: number[], length: number) {
  const faces = new Set(dice);
  for (let start = 1; start + length - 1 <= 6; start += 1) {
    let run = true;
    for (let face = start; face < start + length; face += 1) if (!faces.has(face)) run = false;
    if (run) return true;
  }
  return false;
}

export function isFiveKind(dice: number[]) {
  return counts(dice).includes(5);
}

export function scoreFor(category: Category, dice: number[], player?: DicePlayer): number {
  const tally = counts(dice);
  const most = Math.max(...tally);
  // A five-of-a-kind is a joker once the five-of-a-kind box is filled, with 50 or with 0.
  const joker = most === 5 && player?.scores.fiveKind !== undefined;
  const upper = (UPPER as readonly string[]).indexOf(category);
  if (upper >= 0) return tally[upper + 1] * (upper + 1);
  switch (category) {
    case "threeKind":
      return most >= 3 ? sum(dice) : 0;
    case "fourKind":
      return most >= 4 ? sum(dice) : 0;
    case "fullHouse":
      return joker || (tally.includes(3) && tally.includes(2)) ? 25 : 0;
    case "smallStraight":
      return joker || hasRun(dice, 4) ? 30 : 0;
    case "largeStraight":
      return joker || hasRun(dice, 5) ? 40 : 0;
    case "fiveKind":
      return most === 5 ? 50 : 0;
    case "chance":
      return sum(dice);
    default:
      return 0;
  }
}

export function upperTotal(player: DicePlayer) {
  return UPPER.reduce((total, category) => total + (player.scores[category] ?? 0), 0);
}

export function totalOf(player: DicePlayer) {
  if (typeof player.total === "number") return player.total;
  const boxes = CATEGORIES.reduce((total, category) => total + (player.scores[category] ?? 0), 0);
  return boxes + (upperTotal(player) >= UPPER_BONUS_AT ? UPPER_BONUS : 0) + player.fiveKindBonus * FIVE_KIND_BONUS;
}

/** The open box worth the most with these dice, to point the player at a good choice. */
export function bestBox(player: DicePlayer, dice: number[]): Category | null {
  let best: Category | null = null;
  let bestPoints = 0;
  for (const category of CATEGORIES) {
    if (player.scores[category] !== undefined) continue;
    const points = scoreFor(category, dice, player);
    if (points > bestPoints) {
      best = category;
      bestPoints = points;
    }
  }
  return best;
}
