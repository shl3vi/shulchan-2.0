import assert from "node:assert/strict";
import test from "node:test";
import { applyPlayers, freshTally } from "./tally.js";

test("the last player leaving closes the session, an empty create does not", () => {
  const tally = freshTally("poker", 0);
  assert.equal(applyPlayers(tally, 0), false);
  assert.equal(applyPlayers(tally, 4), false);
  assert.equal(tally.peakPlayers, 4);
  assert.equal(applyPlayers(tally, 6), false);
  assert.equal(applyPlayers(tally, 2), false);
  assert.equal(tally.peakPlayers, 6);
  assert.equal(applyPlayers(tally, 0), true);
});
