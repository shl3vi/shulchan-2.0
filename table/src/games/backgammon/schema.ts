import { z } from "zod";

const point = z.number().int().min(1).max(24);

/** Each move's input, without its `type`. */
export const moveInputs = {
  roll: z.object({}).strict(),
  move: z.object({
    from: z.union([point, z.literal("bar")]),
    to: z.union([point, z.literal("off")]),
    die: z.number().int().min(1).max(6),
  }).strict(),
  double: z.object({}).strict(),
  answer: z.object({ accept: z.boolean() }).strict(),
  restart: z.object({}).strict(),
};

/** A whole action, with its type, as the engine and the debug page take it. */
export const backgammonBody = z.discriminatedUnion("type", [
  moveInputs.roll.extend({ type: z.literal("roll") }),
  moveInputs.move.extend({ type: z.literal("move") }),
  moveInputs.double.extend({ type: z.literal("double") }),
  moveInputs.answer.extend({ type: z.literal("answer") }),
  moveInputs.restart.extend({ type: z.literal("restart") }),
]);

export type BackgammonAction = z.infer<typeof backgammonBody>;

/** Backgammon needs no settings. Blinds, buy-in, auto-deal and turn time from older apps are accepted and ignored. */
export const openBody = z.object({
  kind: z.literal("backgammon"),
  smallBlind: z.number().int().positive().optional(),
  buyIn: z.number().int().positive().optional(),
  autoDeal: z.boolean().optional(),
  turnSeconds: z.number().int().optional(),
}).strict();

export type BackgammonSettings = Record<string, never>;
