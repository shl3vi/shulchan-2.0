import { z } from "zod";

export const createBody = z.object({
  smallBlind: z.number().int().positive(),
  buyIn: z.number().int().positive(),
  kind: z.enum(["poker", "backgammon"]).optional(),
}).strict();

export const joinBody = z.object({
  name: z.string(),
  password: z.string(),
  adminSecret: z.string().optional(),
}).strict();

export const liveKitBody = z.object({
  playerId: z.string().min(1),
  secret: z.string().min(1),
}).strict();

export const sessionBody = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const actBody = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: z.number().optional(),
}).strict();

export const playerBody = z.object({
  playerId: z.string().min(1),
}).strict();

export const rebuyBody = z.object({
  amount: z.number(),
}).strict();

export function readSchema<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
