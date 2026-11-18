import { considerAutoDeal } from "./autodeal.js";
import { actPoker, readPoker } from "./engine.js";
import { notePlayers, notePoker } from "./events/ledger.js";
import { reportCaught } from "./events/report.js";
import { dropRemovedPlayers, foldDeparted, seatedCount } from "./players.js";
import { publishTable, TABLE_UNCHANGED, TableNotFound, withTable, type TableRecord } from "./store.js";
import { timeoutAction, turnExpired } from "./turn.js";

/** Checked late rather than early, so a player who acts on the last second wins the race. */
const GRACE_MS = 500;

const pending = new Map<string, NodeJS.Timeout>();

// The debug table is not held: it shows the clock like any other table, so the clock must act there too.
function holds(table: TableRecord) {
  return table.kind === "backgammon" || table.paused === true || table.closing === true;
}

/**
 * Acts for a player whose clock ran out. It does not count as activity, so a table
 * where nobody is left still burns down on the idle fuse instead of dealing forever.
 */
export async function expireTurn(tableId: string) {
  try {
    const mark = await withTable(tableId, async (current) => {
      if (holds(current) || !current.turn) return TABLE_UNCHANGED;
      const view = await readPoker(current);
      if (!turnExpired(current, view, Date.now())) return TABLE_UNCHANGED;
      const action = timeoutAction(view.legalActions);
      if (!action) return TABLE_UNCHANGED;
      await actPoker(current, current.turn.seat, action);
      await foldDeparted(current);
      await dropRemovedPlayers(current);
      const after = await readPoker(current);
      return { round: after.round, seated: seatedCount(current) };
    });
    if (mark === TABLE_UNCHANGED) return;
    await publishTable(tableId);
    void considerAutoDeal(tableId);
    await notePoker(tableId, mark.round);
    await notePlayers(tableId, mark.seated);
  } catch (error) {
    if (error instanceof TableNotFound) return;
    const message = error instanceof Error ? error.message : "";
    if (message === "Table is busy") {
      // Someone else holds the lock, most likely the player acting. Look again shortly.
      schedule(tableId, Date.now() + 1000);
      return;
    }
    reportCaught(tableId, error, "turn-timer");
  }
}

function schedule(tableId: string, at: number) {
  const previous = pending.get(tableId);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    pending.delete(tableId);
    void expireTurn(tableId);
  }, Math.max(0, at - Date.now()) + GRACE_MS);
  timer.unref();
  pending.set(tableId, timer);
}

/**
 * Called whenever a table is published. Every table process arms its own timer;
 * the lock and the deadline check make the extra ones do nothing.
 */
export function armTurn(table: TableRecord) {
  if (holds(table) || !table.turn) {
    const previous = pending.get(table.id);
    if (previous) clearTimeout(previous);
    pending.delete(table.id);
    return;
  }
  schedule(table.id, table.turn.deadline);
}

/** Backstop for timers lost to a restart. Run from the idle sweep. */
export function overdueTurn(table: TableRecord, now: number) {
  return !holds(table) && table.turn != null && now >= table.turn.deadline + GRACE_MS;
}
