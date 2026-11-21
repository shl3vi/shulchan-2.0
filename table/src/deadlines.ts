import { reportCaught } from "./events/report.js";
import { gameOf, kindOf } from "./games/index.js";
import { readTable, TableBusy, TableNotFound, type TableRecord } from "./store.js";

/**
 * Each game may store one deadline on its table (a turn clock, the next deal). Every table
 * process arms a timer for it whenever the table is published, and the idle sweep catches
 * any timer a restart lost. The game takes the lock and checks again, so extra calls do nothing.
 */

/** Checked late rather than early, so a player who acts on the last second wins the race. */
const GRACE_MS = 500;

const pending = new Map<string, NodeJS.Timeout>();

function schedule(tableId: string, at: number) {
  const previous = pending.get(tableId);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    pending.delete(tableId);
    void fireDeadline(tableId);
  }, Math.max(0, at - Date.now()) + GRACE_MS);
  timer.unref();
  pending.set(tableId, timer);
}

/** Called whenever a table is published, on every table process. */
export function armDeadline(table: TableRecord) {
  const at = gameOf(table).deadline?.(table) ?? null;
  if (at == null) {
    const previous = pending.get(table.id);
    if (previous) clearTimeout(previous);
    pending.delete(table.id);
    return;
  }
  schedule(table.id, at);
}

/** Backstop for timers lost to a restart. Run from the idle sweep. */
export function deadlineOverdue(table: TableRecord, now: number) {
  const at = gameOf(table).deadline?.(table) ?? null;
  return at != null && now >= at + GRACE_MS;
}

export async function fireDeadline(tableId: string) {
  let kind: ReturnType<typeof kindOf> | undefined;
  try {
    const table = await readTable(tableId);
    if (!table) return;
    kind = kindOf(table);
    await gameOf(table).onDeadline?.(tableId);
  } catch (error) {
    if (error instanceof TableNotFound) return;
    if (error instanceof TableBusy) {
      // Someone else holds the lock, most likely the player acting. Look again shortly.
      schedule(tableId, Date.now() + 1000);
      return;
    }
    reportCaught(tableId, error, "deadline", kind);
  }
}
