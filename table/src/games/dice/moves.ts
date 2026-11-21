import { REFUSAL, TableRefused } from "../../errors.js";
import { assertPlaying, noteActivity } from "../../idle.js";
import type { TableRecord } from "../../store.js";
import type { GameMove } from "../types.js";
import { openingDice, playDice } from "./engine.js";
import { moveInputs, type DiceAction } from "./schema.js";
import { MAX_PLAYERS } from "./seats.js";
import { diceOf, noteDiceWin, type DicePlay } from "./state.js";
import { noteDice } from "./tally.js";

type MoveMark = { previous: DicePlay | null; next: DicePlay; started: boolean };

/** The players of a new game: everyone seated, in seat order, up to six. */
export function diceLineup(table: TableRecord) {
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
    const state = diceOf(table);
    const inPlay = state.play?.phase === "playing";
    // Anyone seated starts a game when none is running. Starting over mid-game is the admin's call.
    if (inPlay && seat.id !== table.adminId) {
      throw new TableRefused("forbidden", "Only the table admin can restart a game in progress", REFUSAL.notAdmin);
    }
    const previous = state.play;
    const next = await openingDice(diceLineup(table));
    state.play = next;
    noteActivity(table, Date.now());
    return { previous, next, started: true };
  },
  async after(context, mark) {
    if (mark) await noteDice(context.tableId, mark.previous, mark.next, mark.started);
  },
};

function play<Type extends DiceAction["type"]>(type: Type): GameMove<object, MoveMark> {
  return {
    schema: moveInputs[type],
    failure: "Dice move failed",
    async run({ table, seat }, input) {
      assertPlaying(table);
      const state = diceOf(table);
      if (!state.play) throw new TableRefused("invalid", "Start a game first", "dice.not-started");
      const previous = state.play;
      const next = await playDice(previous, seat.id, { type, ...input } as DiceAction);
      noteDiceWin(state, previous, next);
      state.play = next;
      noteActivity(table, Date.now());
      return { previous, next, started: false };
    },
    async after(context, mark) {
      // A refused move leaves this phone showing its own guess, such as a held die, so send it the real game.
      if (!mark) {
        await context.resync();
        return;
      }
      await noteDice(context.tableId, mark.previous, mark.next, mark.started);
    },
  };
}

export const diceMoves: Record<string, GameMove> = {
  start,
  roll: play("roll"),
  hold: play("hold"),
  score: play("score"),
};
