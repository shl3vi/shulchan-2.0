/** Idle fuse. Five quiet minutes, then five minutes to play or actively pause, then the table closes. */

export const IDLE_WARN_MS = 5 * 60 * 1000;
export const IDLE_CLOSE_MS = 10 * 60 * 1000;

export type IdleTable = {
  lastActivityAt?: number;
  /** Set only while the admin has actively paused. The fuse is frozen, not reset. */
  paused?: boolean;
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
  if (table.closing) throw new Error("Table is closing");
  if (table.paused) throw new Error("Table is paused");
}

/**
 * Active pause freezes the fuse where it is. Resuming continues that same fuse,
 * so pause and resume cannot buy another five minutes.
 */
export function setPaused(table: IdleTable, paused: boolean, now: number) {
  if (table.closing) throw new Error("Table is closing");
  if (paused) {
    if (table.paused) return;
    const activity = finite(table.lastActivityAt) ?? now;
    const spent = Math.max(0, now - (activity > now ? now : activity));
    if (spent >= IDLE_CLOSE_MS) throw new Error("Table is closing");
    table.paused = true;
    table.idleCarry = spent;
    delete table.idleCloseAt;
    return;
  }
  if (!table.paused) return;
  const carry = Math.min(IDLE_CLOSE_MS - 1, Math.max(0, Math.floor(finite(table.idleCarry) ?? 0)));
  delete table.paused;
  delete table.idleCarry;
  table.lastActivityAt = now - carry;
  if (carry >= IDLE_WARN_MS) table.idleCloseAt = table.lastActivityAt + IDLE_CLOSE_MS;
  else delete table.idleCloseAt;
}

/** True when the sweep must take the table lock. A quiet table is left untouched. */
export function needsIdleWrite(table: IdleTable, now: number) {
  if (table.closing) return true;
  if (table.paused) return false;
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
  if (table.paused) return "hold";
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
