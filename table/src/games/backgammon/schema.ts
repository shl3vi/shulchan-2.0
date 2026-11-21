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

/** Backgammon needs no settings. Blinds, buy-in, auto-deal and turn time from older apps are accepted and ignored. */
export const openBody = z.object({
  kind: z.literal("backgammon"),
  smallBlind: z.number().int().positive().optional(),
  buyIn: z.number().int().positive().optional(),
  autoDeal: z.boolean().optional(),
  turnSeconds: z.number().int().optional(),
}).strict();

export type BackgammonSettings = Record<string, never>;
