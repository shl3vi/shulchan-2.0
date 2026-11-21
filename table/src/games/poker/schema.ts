import { z } from "zod";
import { publicConfigSet } from "../../publicConfig.js";
import type { PokerConfig } from "./config.js";
import { MAX_TURN_SECONDS, MIN_TURN_SECONDS } from "./turn.js";

const turnSeconds = z.number().int().min(MIN_TURN_SECONDS).max(MAX_TURN_SECONDS);

export const MAX_CHIPS = 1_000_000_000;

export const chipAmount = z.number().int().positive().max(MAX_CHIPS);

const openBody = z.object({
  smallBlind: z.number().int().positive(),
  buyIn: z.number().int().positive(),
  kind: z.literal("poker").optional(),
  autoDeal: z.boolean().optional(),
  turnSeconds: turnSeconds.optional(),
}).strict();

export type PokerSettings = {
  smallBlind: number;
  buyIn: number;
  autoDeal?: boolean;
  /** Absent only on the debug table, which keeps the old 30 seconds. */
  turnSeconds?: number;
};

/** The same two rules for an opened table and for the debug table. */
export function blindsProblem(smallBlind: number, buyIn: number) {
  if (!Number.isInteger(smallBlind) || smallBlind < 1) return "smallBlind must be a positive integer";
  if (!Number.isInteger(buyIn) || buyIn < smallBlind * 2) return "buyIn must be at least two big blinds";
  return null;
}

export function readOpenSettings(body: unknown): { settings: PokerSettings } | { error: string } {
  const parsed = openBody.safeParse(body);
  if (!parsed.success) return { error: "Invalid request" };
  const problem = blindsProblem(parsed.data.smallBlind, parsed.data.buyIn);
  if (problem) return { error: problem };
  return {
    settings: {
      smallBlind: parsed.data.smallBlind,
      buyIn: parsed.data.buyIn,
      ...(parsed.data.autoDeal ? { autoDeal: true } : {}),
      // The app sends its region's default. An older app sends none and gets the default region's.
      turnSeconds: parsed.data.turnSeconds ?? (publicConfigSet().default.games.poker as unknown as PokerConfig).turnSecondsDefault,
    },
  };
}

export const actBody = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise"]),
  amount: chipAmount.optional(),
}).strict();

export const rebuyBody = z.object({
  amount: chipAmount,
}).strict();

export const autoDealBody = z.object({
  enabled: z.boolean(),
}).strict();

export const turnTimeBody = z.object({
  seconds: turnSeconds,
}).strict();

/** Admin table settings. Each field is optional; only the ones sent change. */
export const tableSettingsBody = z.object({
  smallBlind: z.number().int().positive().max(MAX_CHIPS / 2).optional(),
  buyIn: chipAmount.optional(),
  rebuy: z.enum(["any", "busted", "off"]).optional(),
}).strict().refine((body) => body.smallBlind != null || body.buyIn != null || body.rebuy != null);
