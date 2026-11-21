import { z } from "zod";

const point = z.number().int().min(1).max(24);

export const backgammonBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll") }).strict(),
  z.object({
    type: z.literal("move"),
    from: z.union([point, z.literal("bar")]),
    to: z.union([point, z.literal("off")]),
    die: z.number().int().min(1).max(6),
  }).strict(),
  z.object({ type: z.literal("double") }).strict(),
  z.object({ type: z.literal("answer"), accept: z.boolean() }).strict(),
  z.object({ type: z.literal("restart") }).strict(),
]);

export type BackgammonAction = z.infer<typeof backgammonBody>;

/** The app still sends blinds and a buy-in for the hidden poker hand. Auto-deal and turn time are ignored. */
export const openBody = z.object({
  smallBlind: z.number().int().positive(),
  buyIn: z.number().int().positive(),
  kind: z.literal("backgammon"),
  autoDeal: z.boolean().optional(),
  turnSeconds: z.number().int().optional(),
}).strict();

export type BackgammonSettings = { smallBlind: number; buyIn: number };
