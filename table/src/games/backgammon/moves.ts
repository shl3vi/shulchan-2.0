import { TableRefused } from "../../errors.js";
import { assertPlaying, noteActivity } from "../../idle.js";
import { seatedCount } from "../../players.js";
import type { GameMove } from "../types.js";
import { playBackgammon } from "./engine.js";
import { backgammonBody, type BackgammonAction } from "./schema.js";
import { backgammonOf } from "./state.js";
import { noteBackgammon } from "./tally.js";

type Turn = { phase?: unknown; turn?: unknown };
type MoveMark = { previous: Turn | null; game: Turn; games: number };

const play: GameMove<BackgammonAction, MoveMark> = {
  schema: backgammonBody,
  invalidMessage: "Invalid backgammon move",
  failure: "Backgammon move failed",
  async run({ table, seat }, action) {
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

export const backgammonMoves: Record<string, GameMove> = { bg: play };
