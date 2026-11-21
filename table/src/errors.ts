/**
 * A request the table turns down on purpose. Shared code reports it by `reason`, never by its text.
 * The text is a readable fallback; the app shows the translation for `code` when it has one.
 */
export class TableRefused extends Error {
  constructor(readonly reason: "forbidden" | "invalid", message: string, readonly code?: string) {
    super(message);
  }
}

/** Codes the app translates. A game adds its own, prefixed with its kind, e.g. "poker.bet-range". */
export const REFUSAL = {
  paused: "paused",
  closing: "closing",
  notAdmin: "not-admin",
  invalid: "invalid",
  tooMany: "too-many",
} as const;
