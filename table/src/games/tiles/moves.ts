import { REFUSAL, TableRefused } from "../../errors.js";
import { assertPlaying, noteActivity } from "../../idle.js";
import type { TableRecord } from "../../store.js";
import type { GameMove } from "../types.js";
import { openingTiles, playTiles } from "./engine.js";
import { moveInputs, type TilesAction } from "./schema.js";
import { MAX_PLAYERS, MIN_PLAYERS } from "./seats.js";
import { noteTilesWin, tilesOf, type TilesPlay } from "./state.js";
import { noteTiles } from "./tally.js";

type MoveMark = { previous: TilesPlay | null; next: TilesPlay; started: boolean };

/** The players of a new game: everyone seated, in seat order, up to four. */
export function tilesLineup(table: TableRecord) {
  return table.players
    .filter((player) => !player.pendingRemoval)
    .sort((a, b) => a.seat - b.seat)
    .slice(0, MAX_PLAYERS);
}

const start: GameMove<object, MoveMark> = {
  schema: moveInputs.start,
  failure: "Could not start the game",
  async run({ table, seat }) {
    assertPlaying(table);
    const state = tilesOf(table);
    if (state.play?.phase === "playing" && seat.id !== table.adminId) {
      throw new TableRefused("forbidden", "Only the table admin can restart a game in progress", REFUSAL.notAdmin);
    }
    const lineup = tilesLineup(table);
    if (lineup.length < MIN_PLAYERS) throw new TableRefused("invalid", "Waiting for a second player", "tiles.needs-two");
    const previous = state.play;
    const next = await openingTiles(lineup);
    state.play = next;
    noteActivity(table, Date.now());
    return { previous, next, started: true };
  },
  async after(context, mark) {
    if (mark) await noteTiles(context.tableId, mark.previous, mark.next, mark.started);
  },
};

function play<Type extends TilesAction["type"]>(type: Type): GameMove<object, MoveMark> {
  return {
    schema: moveInputs[type],
    failure: "Tiles move failed",
    async run({ table, seat }, input) {
      assertPlaying(table);
      const state = tilesOf(table);
      if (!state.play) throw new TableRefused("invalid", "Start a game first", "tiles.not-started");
      const previous = state.play;
      const next = await playTiles(previous, seat.id, { type, ...input } as TilesAction);
      noteTilesWin(state, previous, next);
      state.play = next;
      noteActivity(table, Date.now());
      return { previous, next, started: false };
    },
    async after(context, mark) {
      // A refused play leaves this phone showing its own arrangement, so send it the real table.
      if (!mark) {
        await context.resync();
        return;
      }
      await noteTiles(context.tableId, mark.previous, mark.next, mark.started);
    },
  };
}

export const tilesMoves: Record<string, GameMove> = {
  start,
  play: play("play"),
  draw: play("draw"),
};
