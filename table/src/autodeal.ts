import { notePlayers, notePoker } from "./events/ledger.js";
import { reportCaught } from "./events/report.js";
import { readPoker, startPoker } from "./engine.js";
import { dropRemovedPlayers, seatedCount } from "./players.js";
import { publishTable, readTable, TableNotFound, withTable } from "./store.js";

const AUTO_DEAL_DELAY_MS = 5_000;

const pending = new Map<string, NodeJS.Timeout>();

function scheduleAutoDeal(tableId: string) {
  if (pending.has(tableId)) return;
  const timer = setTimeout(() => {
    pending.delete(tableId);
    void dealIfWaiting(tableId);
  }, AUTO_DEAL_DELAY_MS);
  timer.unref();
  pending.set(tableId, timer);
}

function cancelAutoDeal(tableId: string) {
  const timer = pending.get(tableId);
  if (!timer) return;
  clearTimeout(timer);
  pending.delete(tableId);
}

/** Starts the next hand a few seconds after the table is waiting, so winners stay on screen. */
export async function considerAutoDeal(tableId: string) {
  try {
    const table = await readTable(tableId);
    if (!table || table.kind === "backgammon" || table.autoDeal !== true || table.paused || table.closing || table.idleCloseAt) {
      cancelAutoDeal(tableId);
      return;
    }
    const view = table.pokerView ?? (await readPoker(table));
    if (view.round) {
      cancelAutoDeal(tableId);
      return;
    }
    scheduleAutoDeal(tableId);
  } catch (error) {
    reportCaught(tableId, error, "auto-deal");
  }
}

async function dealIfWaiting(tableId: string) {
  try {
    const mark = await withTable(tableId, async (current) => {
      if (current.kind === "backgammon" || current.autoDeal !== true || current.paused || current.closing || current.idleCloseAt) return null;
      const view = await readPoker(current);
      if (view.round) return null;
      const started = await startPoker(current);
      await dropRemovedPlayers(current);
      return { round: started.round, seated: seatedCount(current) };
    });
    if (!mark) return;
    await publishTable(tableId);
    await notePoker(tableId, mark.round);
    await notePlayers(tableId, mark.seated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "At least two players need chips to deal." || message === "Hand already in progress") return;
    if (error instanceof TableNotFound) return;
    if (message === "Table is busy") {
      scheduleAutoDeal(tableId);
      return;
    }
    reportCaught(tableId, error, "auto-deal");
  }
}
