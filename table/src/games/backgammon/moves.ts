import { assertPlaying, noteActivity } from "../../idle.js";
import { seatedCount } from "../../players.js";
import type { GameMove } from "../types.js";
import { noteBackgammonWin, playBackgammon } from "./engine.js";
import { backgammonBody, type BackgammonAction } from "./schema.js";
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
      throw new Error("Waiting for a second player");
    }
    const previous = table.backgammon as Turn | undefined;
    const before = table.backgammonLog?.length ?? 0;
    const game = (await playBackgammon(table, seat.id, action)) as Turn;
    noteBackgammonWin(table, game);
    table.backgammon = game;
    noteActivity(table, Date.now());
    return { previous: previous ?? null, game, games: (table.backgammonLog?.length ?? 0) - before };
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
