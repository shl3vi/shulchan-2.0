import assert from "node:assert/strict";
import test from "node:test";
import { freshTally } from "../../events/tally.js";
import type { TilesPlay } from "./state.js";
import { applyTiles } from "./tally.js";

const at = (turns: number) => ({ turns }) as TilesPlay;

test("a tiles game is a game started, and a round is a turn taken", () => {
  const tally = freshTally("tiles", 0);
  applyTiles(tally, null, at(0), true);
  applyTiles(tally, at(0), at(1), false);
  applyTiles(tally, at(1), at(1), false);
  applyTiles(tally, at(1), at(2), false);
  assert.equal(tally.games, 1);
  assert.equal(tally.rounds, 2);
});
