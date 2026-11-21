import assert from "node:assert/strict";
import test from "node:test";
import { chooseSeat } from "./seats.js";

test("backgammon leaves a blocked pair as spectators once two people are already playing", () => {
  assert.equal(chooseSeat([0], [0]), 1);
  assert.equal(chooseSeat([0, 1], [0]), 8);
});
