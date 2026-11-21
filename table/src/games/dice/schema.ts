import { z } from "zod";

export const CATEGORIES = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "threeKind",
  "fourKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "fiveKind",
  "chance",
] as const;

/** Each move's input, without its `type`. */
export const moveInputs = {
  start: z.object({}).strict(),
  roll: z.object({}).strict(),
  hold: z.object({ held: z.array(z.boolean()).length(5) }).strict(),
  score: z.object({ category: z.enum(CATEGORIES) }).strict(),
};

export type DiceAction =
  | { type: "roll" }
  | ({ type: "hold" } & z.infer<typeof moveInputs.hold>)
  | ({ type: "score" } & z.infer<typeof moveInputs.score>);

/** The dice game has nothing to choose before the table opens. */
export const openBody = z.object({ kind: z.literal("dice") }).strict();

export type DiceSettings = Record<string, never>;
