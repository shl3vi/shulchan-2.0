import { z } from "zod";

export const createBody = z.object({
  smallBlind: z.number().int().positive(),
  buyIn: z.number().int().positive(),
  kind: z.enum(["poker", "backgammon"]).optional(),
}).strict();

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_CHIPS = 1_000_000_000;

export const chipAmount = z.number().int().positive().max(MAX_CHIPS);

export const joinBody = z.object({
  name: z.string().min(1).max(24),
  password: z.string().regex(/^\d{6}$/),
  adminSecret: z.string().regex(uuid).optional(),
}).strict();

export const liveKitBody = z.object({
  playerId: z.string().min(1),
  secret: z.string().min(1),
}).strict();

export const sessionBody = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict();

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

export const actBody = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: chipAmount.optional(),
}).strict();

export const playerBody = z.object({
  playerId: z.string().min(1),
}).strict();

export const rebuyBody = z.object({
  amount: chipAmount,
}).strict();

export function readSchema<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
