import { z } from "zod";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const joinBody = z.object({
  name: z.string().min(1).max(24),
  password: z.string().regex(/^\d{6}$/),
  adminSecret: z.string().regex(uuid).optional(),
  personKey: z.string().regex(uuid),
  /** What the player joined from. Older apps send none. */
  platform: z.enum(["ios", "android", "web"]).optional(),
}).strict();

export const reportBody = z.object({
  playerId: z.string().min(1),
  secret: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.enum(["name", "camera", "microphone"]),
}).strict();

export const blockBody = z.object({
  playerId: z.string().min(1),
  secret: z.string().min(1),
  targetId: z.string().min(1),
}).strict();

export const liveKitBody = z.object({
  playerId: z.string().min(1),
  secret: z.string().min(1),
}).strict();

export const sessionBody = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
}).strict();

export const appleBody = z.object({
  identityToken: z.string().min(20).max(8000),
  authorizationCode: z.string().min(1).max(2000).optional(),
  name: z.string().trim().min(1).max(80).optional(),
}).strict();

export const playerBody = z.object({
  playerId: z.string().min(1),
}).strict();

export const pauseBody = z.object({
  paused: z.boolean(),
}).strict();

export function readSchema<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
