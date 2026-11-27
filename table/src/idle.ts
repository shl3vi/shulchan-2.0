import { REFUSAL, TableRefused } from "./errors.js";

/**
 * Idle fuse. Five quiet minutes, then five minutes to play or actively pause, then the table closes.
 * A paused table closes an hour after the pause began.
 */

export const IDLE_WARN_MS = 5 * 60 * 1000;
export const IDLE_CLOSE_MS = 10 * 60 * 1000;
/** A paused table closes this long after the pause began, however long the admin stays. */
export const PAUSE_LIMIT_MS = 60 * 60 * 1000;

export type IdleTable = {
  lastActivityAt?: number;
  /** Set only while the admin has actively paused. The fuse is frozen, not reset. */
  paused?: boolean;
  /** Server time the current pause began. The table closes PAUSE_LIMIT_MS after it. */
  pausedAt?: number;
  /** How much of the fuse had already burned when the admin paused. */
  idleCarry?: number;
  /** Absolute server time the table closes if nobody plays. Derived from the last real action. */
  idleCloseAt?: number;
  closing?: boolean;
};

export type IdleSweep = "seed" | "warn" | "close" | "hold";

function finite(value: number | undefined) {
  return value != null && Number.isFinite(value) ? value : null;
}

/** A real game action. Joining, reconnecting, rebuying, and pausing do not call this. */
export function noteActivity(table: IdleTable, now: number) {
  table.lastActivityAt = now;
  delete table.idleCarry;
  delete table.idleCloseAt;
}

export function assertPlaying(table: IdleTable) {
  if (table.closing) throw new TableRefused("invalid", "Table is closing", REFUSAL.closing);
  if (table.paused) throw new TableRefused("invalid", "Table is paused", REFUSAL.paused);
}

/**
 * Active pause freezes the fuse where it is. Resuming continues that same fuse,
 * so pause and resume cannot buy another five minutes.
 */
export function setPaused(table: IdleTable, paused: boolean, now: number) {
  if (table.closing) throw new TableRefused("invalid", "Table is closing", REFUSAL.closing);
  if (paused) {
    if (table.paused) return;
    const activity = finite(table.lastActivityAt) ?? now;
    const spent = Math.max(0, now - (activity > now ? now : activity));
    if (spent >= IDLE_CLOSE_MS) throw new TableRefused("invalid", "Table is closing", REFUSAL.closing);
    table.paused = true;
    table.pausedAt = now;
    table.idleCarry = spent;
    delete table.idleCloseAt;
    return;
  }
  if (!table.paused) return;
  const carry = Math.min(IDLE_CLOSE_MS - 1, Math.max(0, Math.floor(finite(table.idleCarry) ?? 0)));
  delete table.paused;
  delete table.pausedAt;
  delete table.idleCarry;
  table.lastActivityAt = now - carry;
  if (carry >= IDLE_WARN_MS) table.idleCloseAt = table.lastActivityAt + IDLE_CLOSE_MS;
  else delete table.idleCloseAt;
}

/** True when the sweep must take the table lock. A quiet table is left untouched. */
export function needsIdleWrite(table: IdleTable, now: number) {
  if (table.closing) return true;
  if (table.paused) {
    const pausedAt = finite(table.pausedAt);
    return pausedAt == null || pausedAt > now || now >= pausedAt + PAUSE_LIMIT_MS;
  }
  const activity = finite(table.lastActivityAt);
  if (activity == null || activity > now) return true;
  if (now >= activity + IDLE_CLOSE_MS) return true;
  const closeAt = activity + IDLE_CLOSE_MS;
  if (now >= activity + IDLE_WARN_MS) return table.idleCloseAt !== closeAt;
  return table.idleCloseAt != null;
}

/**
 * The close time is lastActivityAt + 10 minutes, not "five minutes from when we noticed".
 * A late sweep cannot extend the table.
 */
export function sweepIdle(table: IdleTable, now: number): IdleSweep {
  if (table.closing) return "close";
  if (table.paused) {
    const pausedAt = finite(table.pausedAt);
    // Paused before this limit existed, or a clock that ran backwards: the hour starts now.
    if (pausedAt == null || pausedAt > now) {
      table.pausedAt = now;
      return "seed";
    }
    if (now < pausedAt + PAUSE_LIMIT_MS) return "hold";
    table.closing = true;
    return "close";
  }
  const activity = finite(table.lastActivityAt);
  if (activity == null || activity > now) {
    table.lastActivityAt = now;
    delete table.idleCloseAt;
    delete table.idleCarry;
    return "seed";
  }
  if (now >= activity + IDLE_CLOSE_MS) {
    table.closing = true;
    delete table.idleCloseAt;
    return "close";
  }
  const closeAt = activity + IDLE_CLOSE_MS;
  if (now >= activity + IDLE_WARN_MS) {
    if (table.idleCloseAt === closeAt) return "hold";
    table.idleCloseAt = closeAt;
    return "warn";
  }
  if (table.idleCloseAt != null) {
    delete table.idleCloseAt;
    return "warn";
  }
  return "hold";
}
