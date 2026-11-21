import type { SeatPlayer, TableRecord } from "../../store.js";
import { debugBlinds, repairPokerHand } from "./debug.js";
import { dropRemovedPlayers } from "./departures.js";
import { createPokerTable, readPoker, seatPoker, unseatPoker } from "./engine.js";
import { blindsProblem } from "./schema.js";
import { baseSnapshot } from "./snapshot.js";

/**
 * Every table still runs a poker hand, backgammon tables included: it holds the seats
 * and builds the snapshot. This file is the only way another game reaches it, and it
 * goes away once backgammon keeps its own seats.
 */
export const hiddenHand = {
  blindsProblem,
  debugBlinds,
  repair: repairPokerHand,
  open(table: TableRecord, smallBlind: number) {
    return createPokerTable(table, smallBlind);
  },
  async seat(table: TableRecord, player: SeatPlayer) {
    player.bought = table.buyIn;
    await seatPoker(table, player.seat, table.buyIn);
  },
  async unseat(table: TableRecord, player: SeatPlayer) {
    await unseatPoker(table, player.seat);
  },
  dropDeparted: dropRemovedPlayers,
  async snapshot(table: TableRecord, viewerId?: string, blockedIds?: Set<string>) {
    return baseSnapshot(table, await readPoker(table), viewerId, blockedIds);
  },
};
