import assert from "node:assert/strict";
import test from "node:test";
import { freshTally } from "../../events/tally.js";
import { applyPoker } from "./tally.js";

test("a poker hand counts once, and streets after the deal count as rounds", () => {
  const tally = freshTally("poker", 0);
  applyPoker(tally, "preflop");
  applyPoker(tally, "flop");
  applyPoker(tally, "turn");
  applyPoker(tally, null);
  applyPoker(tally, "preflop");
  assert.equal(tally.games, 2);
  assert.equal(tally.rounds, 2);
});
