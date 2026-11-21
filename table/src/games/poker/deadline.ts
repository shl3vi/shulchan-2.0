import { notePlayers } from "../../events/ledger.js";
import { seatedCount } from "../../players.js";
import { publishTable, TABLE_UNCHANGED, withTable, type TableRecord } from "../../store.js";
import { dropRemovedPlayers, foldDeparted } from "./departures.js";
import { actPoker, readPoker, startPoker } from "./engine.js";
import { AUTO_DEAL_DELAY_MS, pokerOf, type PokerState } from "./state.js";
import { notePoker } from "./tally.js";
import { restartTurn, timeoutAction, turnExpired } from "./turn.js";

/**
 * Poker's one stored deadline: the earlier of the turn clock and the next automatic deal.
 * Both live in the table record, so they survive a restart and every table process agrees.
 */
export function pokerDeadline(table: TableRecord): number | null {
  if (table.game.kind !== "poker" || table.closing) return null;
  const state = table.game as PokerState;
  const times: number[] = [];
  if (state.turn && table.paused !== true) times.push(state.turn.deadline);
  // Kept even while paused or idle, so it fires once and is cleared instead of firing late.
  if (state.autoDealAt != null) times.push(state.autoDealAt);
  return times.length > 0 ? Math.min(...times) : null;
}

type Mark = { round: Awaited<ReturnType<typeof readPoker>>["round"]; seated: number; quiet?: boolean };

/** Reasons the engine gives for not dealing that only mean "not now". */
const NOT_NOW = new Set(["At least two players need chips to deal.", "Hand already in progress"]);

/**
 * Acts for a player whose clock ran out, or deals the next hand. Neither counts as activity,
 * so a table where nobody is left still burns down on the idle fuse instead of dealing forever.
 */
export async function pokerOnDeadline(tableId: string) {
  const mark = await withTable<Mark | typeof TABLE_UNCHANGED>(tableId, async (table) => {
    if (table.closing) return TABLE_UNCHANGED;
    const state = pokerOf(table);
    const now = Date.now();
    if (state.turn && table.paused !== true) {
      const view = await readPoker(table);
      const action = turnExpired(state, view, now) ? timeoutAction(view.legalActions) : null;
      if (action) {
        await actPoker(table, state.turn.seat, action);
        await foldDeparted(table);
        await dropRemovedPlayers(table);
        return { round: (await readPoker(table)).round, seated: seatedCount(table) };
      }
    }
    if (state.autoDealAt == null || now < state.autoDealAt) return TABLE_UNCHANGED;
    const view = await readPoker(table);
    const allowed = state.autoDeal === true && table.paused !== true && table.idleCloseAt == null;
    if (view.round != null || !allowed) {
      delete state.autoDealAt;
      return { round: view.round, seated: seatedCount(table), quiet: true };
    }
    try {
      const started = await startPoker(table);
      await dropRemovedPlayers(table);
      return { round: started.round, seated: seatedCount(table) };
    } catch (error) {
      if (!(error instanceof Error && NOT_NOW.has(error.message))) throw error;
      // Not enough players with chips. The next change at the table starts a new wait.
      delete state.autoDealAt;
      return { round: null, seated: seatedCount(table), quiet: true };
    }
  });
  if (mark === TABLE_UNCHANGED) return;
  await publishTable(tableId);
  if (mark.quiet) return;
  await notePoker(tableId, mark.round);
  await notePlayers(tableId, mark.seated);
}

/** After a pause the player to act gets a full clock, and a waiting table deals after the usual wait. */
export function pokerResume(table: TableRecord, now: number) {
  const state = pokerOf(table);
  restartTurn(state, now);
  if (state.view?.round == null) state.autoDealAt = now + AUTO_DEAL_DELAY_MS;
}
