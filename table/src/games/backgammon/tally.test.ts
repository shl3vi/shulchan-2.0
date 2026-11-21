import assert from "node:assert/strict";
import test from "node:test";
import { freshTally } from "../../events/tally.js";
import { applyBackgammon } from "./tally.js";

test("a backgammon turn is a change of color back to roll, and a win is a game", () => {
  const tally = freshTally("backgammon", 0);
  applyBackgammon(tally, { phase: "opening", turn: "white" }, { phase: "roll", turn: "white" }, 0);
  applyBackgammon(tally, { phase: "move", turn: "white" }, { phase: "roll", turn: "black" }, 0);
  applyBackgammon(tally, { phase: "move", turn: "black" }, { phase: "over", turn: "white" }, 1);
  assert.equal(tally.rounds, 1);
  assert.equal(tally.games, 1);
});
