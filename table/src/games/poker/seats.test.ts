import assert from "node:assert/strict";
import test from "node:test";
import { chooseSeat } from "./seats.js";

test("a blocked neighbor is seated across the table when a chair is free", () => {
  assert.equal(chooseSeat([], []), 0);
  assert.equal(chooseSeat([], [0]), 4);
  assert.equal(chooseSeat([4], [0]), 5);
});
