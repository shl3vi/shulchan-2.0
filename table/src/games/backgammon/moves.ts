import { TableRefused } from "../../errors.js";
import { assertPlaying, noteActivity } from "../../idle.js";
import { seatedCount } from "../../players.js";
import type { GameMove } from "../types.js";
import { playBackgammon } from "./engine.js";
import { moveInputs, type BackgammonAction } from "./schema.js";
import { backgammonOf } from "./state.js";
import { noteBackgammon } from "./tally.js";

type Turn = { phase?: unknown; turn?: unknown };
type MoveMark = { previous: Turn | null; game: Turn; games: number };

/** Every backgammon move goes to the engine the same way: the type and its input together. */
function play<Type extends BackgammonAction["type"]>(type: Type): GameMove<object, MoveMark> {
  return {
    schema: moveInputs[type],
    failure: "Backgammon move failed",
    async run({ table, seat }, input) {
      const action = { type, ...input } as BackgammonAction;
      assertPlaying(table);
      if (seatedCount(table) < 2) {
        throw new TableRefused("invalid", "Waiting for a second player");
      }
      const state = backgammonOf(table);
      const previous = state.board as Turn | undefined;
      const before = state.log.length;
      const game = (await playBackgammon(table, seat.id, action)) as Turn;
      noteActivity(table, Date.now());
      return { previous: previous ?? null, game, games: state.log.length - before };
    },
    async after(context, mark) {
      // A refused move leaves this phone showing its own guess, so send it the real board.
      if (!mark) {
        await context.resync();
        return;
      }
      await noteBackgammon(context.tableId, mark.previous, mark.game, mark.games);
    },
  };
}

export const backgammonMoves: Record<string, GameMove> = {
  roll: play("roll"),
  move: play("move"),
  double: play("double"),
  answer: play("answer"),
  restart: play("restart"),
};
