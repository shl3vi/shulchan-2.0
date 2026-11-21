import type { TableRecord } from "../../store.js";
import { actPoker, readPoker } from "./engine.js";
import { SEATS } from "./seats.js";

/** A departed player no longer has a socket that can act, so fold them when the hand is waiting on that seat. */
export async function foldDeparted(table: TableRecord) {
  for (let guard = 0; guard < SEATS; guard += 1) {
    const view = await readPoker(table);
    const seat = view.playerToActSeat;
    if (seat == null || !view.legalActions.includes("fold")) return;
    const actor = table.players.find((player) => player.seat === seat);
    if (!actor?.pendingRemoval) return;
    await actPoker(table, seat, "fold");
  }
}

/** A leaving player stays listed while the engine still holds their seat, so the hand can finish around them. */
export async function dropRemovedPlayers(table: TableRecord) {
  const view = await readPoker(table);
  const live = new Set(view.seats.map((seat) => seat.seat));
  table.players = table.players.filter((player) => !player.pendingRemoval || live.has(player.seat));
}
