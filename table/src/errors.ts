import { EngineFailed, EngineRefused, EngineTimeout } from "./engines.js";
import { TableBusy, TableNotFound } from "./store.js";

/**
 * A request the table turns down on purpose. Shared code reports it by `reason`, never by its text.
 * The text is English for logs and tests. The app shows the translation for `code`, never the text.
 */
export class TableRefused extends Error {
  constructor(readonly reason: "forbidden" | "invalid", message: string, readonly code: string) {
    super(message);
  }
}

/**
 * Every error a player can see carries one of these codes, on HTTP as `{ error, code }` and on the socket
 * `error` event as `{ message, code }`. The app translates the code. A game adds its own codes, prefixed
 * with its kind, e.g. "poker.bet-range". The English `error` / `message` is only for logs and tests.
 */
export const REFUSAL = {
  /** Anything without a code of its own, including every internal failure. The app says "something went wrong". */
  failed: "failed",
  invalid: "invalid",
  tooMany: "too-many",
  paused: "paused",
  closing: "closing",
  notAdmin: "not-admin",
  notYourTurn: "not-your-turn",
  gameOver: "game-over",
  watching: "watching",
  needsTwo: "needs-two",
  notStarted: "not-started",
  busy: "busy",
  engineSlow: "engine-slow",
  engineDown: "engine-down",
  notFound: "not-found",
  /** The seat is gone: removed, left, or the table was opened again. */
  notSeated: "not-seated",
  playerGone: "player-gone",
  browserAdmin: "browser-admin",
  /** Join and opening a table. */
  signInNeeded: "sign-in-needed",
  tableLimit: "table-limit",
  nameLength: "name-length",
  nameBlocked: "name-blocked",
  wrongPassword: "wrong-password",
  passwordAttempts: "password-attempts",
  tableFull: "table-full",
  /** Reading a table needs a seat or the password. */
  seatNeeded: "seat-needed",
  videoOff: "video-off",
  reportFailed: "report-failed",
  blockFailed: "block-failed",
  /** Sign-in. */
  signInExpired: "sign-in-expired",
  signInAttempts: "sign-in-attempts",
  appleOff: "apple-off",
  appleRefused: "apple-refused",
  appleUnavailable: "apple-unavailable",
  appleNoEmail: "apple-no-email",
} as const;

export type RefusalCode = (typeof REFUSAL)[keyof typeof REFUSAL];

/**
 * The code for anything a move or a change can throw. An engine's refusal is its own English text,
 * which `engineCode` (the game's) turns into a code; one it does not know is "failed".
 */
export function codeOf(error: unknown, engineCode?: (message: string) => string | undefined): string {
  if (error instanceof TableRefused) return error.code;
  if (error instanceof EngineRefused) return engineCode?.(error.message) ?? REFUSAL.failed;
  if (error instanceof EngineTimeout) return REFUSAL.engineSlow;
  if (error instanceof EngineFailed) return REFUSAL.engineDown;
  if (error instanceof TableBusy) return REFUSAL.busy;
  if (error instanceof TableNotFound) return REFUSAL.notFound;
  return REFUSAL.failed;
}

/** English for logs and tests. A refusal keeps its own text; an internal failure never sends its message out. */
export function messageOf(error: unknown, fallback: string) {
  if (error instanceof TableRefused || error instanceof EngineRefused || error instanceof EngineTimeout) return error.message;
  if (error instanceof TableBusy || error instanceof TableNotFound) return error.message;
  return fallback;
}
